"""
Steel mechanical property predictor.

Trains three regressors (tensile strength, yield strength, Brinell hardness) from
steel composition + heat treatment, and saves them to disk for reuse.

Run directly to train + evaluate + save models:
    python steel_property_predictor.py

Then predict on new rows from another script:
    import pandas as pd
    from steel_property_predictor import predict_properties
    new = pd.DataFrame([{"C": 0.4, "Mn": 0.8, "Cr": 1.0, "Mo": 0.2, "Ni": 0.0,
                          "Si": 0.3, "V": 0.0, "Cu": 0.0, "Al": 0.0,
                          "austenitize_T": 850, "quench_medium": "oil", "temper_T": 580,
                          "steel_family": "low_alloy_QT"}])
    print(predict_properties(new))

Design notes (why the pipeline looks like this):
  - 82% of rows share an identical feature vector with another row, so a random
    train/test split lets the model memorise instead of generalise. Splitting is
    done on whole groups of identical feature vectors (see `feature_hash`).
  - `hardness` mixes two incompatible measurement scales with zero overlap
    (Brinell vs. spec-sheet artefacts) -- only the measured-Brinell subset is used.
  - `elongation`, `reduction_area`, `impact_J_avg` are co-measured outcomes, not
    design-time inputs, and are excluded to avoid leakage.
  - A handful of rows have physically impossible yield/tensile ratios (misparsed
    elongation values) and are voided rather than trusted.
"""

import hashlib
import os
import re
import time
import warnings

import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import (
    BaggingRegressor,
    ExtraTreesRegressor,
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
    RandomForestRegressor,
    StackingRegressor,
    VotingRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge, RidgeCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeRegressor
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

warnings.filterwarnings("ignore")

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------
CSV_PATH = "steelbench_core_open.csv"
EXTERNAL_HARDNESS_PATH = os.path.join("external_data", "tempering_hardness_raiipa.csv")
MODEL_DIR = "models"
RANDOM_STATE = 42
N_JOBS = -1

# FAST_MODE=True  -> coarse hyperparameter grids, a couple of minutes on a laptop.
# FAST_MODE=False -> full grids, ~10-20 min on 8 cores. Set this to False to
#                     squeeze out the best achievable R2 once the pipeline works.
FAST_MODE = True

np.random.seed(RANDOM_STATE)

COMP = ["C", "Mn", "Cr", "Mo", "Ni", "Si", "V", "Cu", "Al"]
PROC = ["austenitize_T", "temper_T", "quench_medium", "temper_time_s"]
IDENTITY = COMP + PROC + ["steel_family"]

TARGETS = {
    "tensile_strength": "UTS (MPa)",
    "yield_strength": "YS (MPa)",
    "hardness_HB": "Hardness (HB)",
}

NUM_FEATURES = COMP + [
    "austenitize_T", "temper_T", "temper_time_s", "CE_IIW", "Pcm", "Cr_eq", "Ni_eq",
    "Creq_over_Nieq", "carbide_formers", "solid_solution", "total_alloy",
    "C_x_carbide", "quench_severity", "HJP", "aus_minus_temper",
    "is_tempered", "n_missing_proc", "n_missing_comp",
]
CAT_FEATURES = ["quench_medium", "steel_family", "data_tier"]
FEATURES = NUM_FEATURES + CAT_FEATURES


# --------------------------------------------------------------------------
# 1. Load + clean
# --------------------------------------------------------------------------
def load_raw(csv_path=CSV_PATH):
    return pd.read_csv(csv_path)


# ASTM E140 Table 2 (hardened, non-austenitic steel) Rockwell C -> Brinell
# (3000kgf/10mm ball), a handful of anchor points, linearly interpolated.
# Only valid for HRC 20-58: below that a material isn't "hardened" enough for
# the correlation to hold, above it the standard Brinell ball itself deforms.
HRC_TO_HB = {
    20: 226, 22: 237, 24: 247, 26: 258, 28: 271, 30: 286, 32: 302, 34: 319,
    36: 336, 38: 353, 40: 371, 42: 390, 44: 409, 46: 432, 48: 455, 50: 481,
    52: 512, 54: 543, 56: 578, 58: 615,
}


def hrc_to_hb(hrc):
    xs = np.array(sorted(HRC_TO_HB))
    ys = np.array([HRC_TO_HB[x] for x in xs])
    hrc = np.asarray(hrc, dtype=float)
    hb = np.interp(hrc, xs, ys)
    return np.where((hrc >= xs.min()) & (hrc <= xs.max()), hb, np.nan)


def _raiipa_family(steel_type):
    """Map an AISI-SAE grade (or a generic '%C plain carbon steel' label) onto
    the same steel_family vocabulary already used elsewhere in the dataset,
    so no new categorical levels are introduced."""
    s = str(steel_type)
    if "plain carbon" in s.lower():
        return "carbon_steel"
    m = re.search(r"AISI-SAE\s+E?(\d{2})", s)
    if not m:
        return "low_alloy_QT"
    return {
        "10": "carbon_steel",
        "40": "CrMo_QT", "41": "CrMo_QT",
        "43": "NiCrMo_QT", "86": "NiCrMo_QT", "87": "NiCrMo_QT", "94": "NiCrMo_QT",
    }.get(m.group(1), "low_alloy_QT")


def load_external_hardness(path=EXTERNAL_HARDNESS_PATH):
    """Grange & Baughman-style tempering-curve compilation: real composition +
    real tempering time/temperature -> resulting hardness, 1466 rows across 34
    grades (source: github.com/Nate-Sheibley/Mild-Steel-Tempering, itself
    compiled from classic metallurgical literature).

    This directly fills the single biggest gap the hardness model had: the
    original measured-Brinell rows carry zero heat-treatment data at all.
    Hardness here is reported as Rockwell C, so it's converted to Brinell via
    ASTM E140 and restricted to the range that conversion is considered
    reliable (HRC 20-58) rather than trusted blindly across the whole range.
    """
    if not os.path.exists(path):
        print(f"  (external hardness dataset not found at {path} -- skipping)")
        return pd.DataFrame()

    raw = pd.read_csv(path, encoding="cp1252")
    raw.columns = [
        "lit_source", "steel_type", "initial_hrc", "temper_time_s", "temper_T",
        "C", "Mn", "P", "S", "Si", "Ni", "Cr", "Mo", "V", "Al", "Cu", "final_hrc",
    ]
    hb = hrc_to_hb(raw["final_hrc"])
    keep = ~np.isnan(hb)
    raw, hb = raw[keep].reset_index(drop=True), hb[keep]

    n = len(raw)
    return pd.DataFrame({
        "heat_id": [f"RAIIPA_{i}" for i in range(n)],
        "grade_id": raw["steel_type"],
        "source": "Raiipa_tempering_compilation",
        "C": raw["C"], "Mn": raw["Mn"], "Cr": raw["Cr"], "Mo": raw["Mo"],
        "Ni": raw["Ni"], "Si": raw["Si"], "V": raw["V"], "Cu": raw["Cu"], "Al": raw["Al"],
        "austenitize_T": np.nan, "quench_medium": np.nan,
        "temper_T": raw["temper_T"], "temper_time_s": raw["temper_time_s"],
        "tensile_strength": np.nan, "yield_strength": np.nan,
        "elongation": np.nan, "reduction_area": np.nan, "impact_J_avg": np.nan,
        "condition": np.nan, "hardness": hb, "split": "pretrain",
        "data_tier": "raiipa_tempering_hrc2hb",
        "steel_family": raw["steel_type"].map(_raiipa_family),
    })


def load_combined_raw(csv_path=CSV_PATH, external_path=EXTERNAL_HARDNESS_PATH):
    """Core dataset + the external hardness/heat-treatment dataset, aligned
    to a common schema (pd.concat fills NaN for any column one side lacks)."""
    core = load_raw(csv_path)
    ext = load_external_hardness(external_path)
    if len(ext):
        print(f"  + {len(ext)} rows from external hardness dataset "
              f"(data_tier='{ext.data_tier.iloc[0]}')")
    return pd.concat([core, ext], ignore_index=True, sort=False)


def clean(raw):
    """Drop unusable columns, void physically impossible yield strengths, and
    restrict `hardness` to the measured/converted-Brinell rows (see module
    docstring)."""
    d = raw.copy()
    d = d.drop(columns=["condition", "split"])

    ratio = d.yield_strength / d.tensile_strength
    d.loc[(ratio < 0.25) | (ratio > 1.0), "yield_strength"] = np.nan

    hb_tiers = ["kaggle_measured", "raiipa_tempering_hrc2hb"]
    d["hardness_HB"] = np.where(d.data_tier.isin(hb_tiers), d.hardness, np.nan)
    return d


def add_features(d):
    """Metallurgically motivated features (carbon equivalent, Schaeffler
    equivalents, tempering parameter, ...) that a tree can't easily rediscover
    on its own from ~1k rows."""
    d = d.copy()
    c = d[COMP].fillna(0.0)  # unlisted element == not intentionally added ~ 0

    d["CE_IIW"] = c.C + c.Mn / 6 + (c.Cr + c.Mo + c.V) / 5 + (c.Ni + c.Cu) / 15
    d["Pcm"] = c.C + c.Si / 30 + c.Mn / 20 + c.Cu / 20 + c.Ni / 60 + c.Cr / 20 + c.Mo / 15 + c.V / 10
    d["Cr_eq"] = c.Cr + c.Mo + 1.5 * c.Si
    d["Ni_eq"] = c.Ni + 30 * c.C + 0.5 * c.Mn
    d["Creq_over_Nieq"] = d.Cr_eq / (d.Ni_eq + 1e-6)
    d["carbide_formers"] = c.Cr + c.Mo + c.V
    d["solid_solution"] = c.Mn + c.Si + c.Ni + c.Cu
    d["total_alloy"] = c[["Mn", "Cr", "Mo", "Ni", "Si", "V", "Cu"]].sum(axis=1)
    d["C_x_carbide"] = c.C * d.carbide_formers

    d["quench_severity"] = d.quench_medium.map({"water": 1.0, "oil": 0.35, "air": 0.05})
    T = d.temper_T + 273.15
    # Hollomon-Jaffe tempering parameter T*(C + log10(t_hours)); t defaults to
    # 1h when unknown (most rows have no recorded tempering time), but uses
    # the real duration for rows that do (see load_external_hardness).
    t_hours = (d["temper_time_s"] / 3600.0).fillna(1.0)
    d["HJP"] = T * (20 + np.log10(t_hours)) / 1000.0
    d["aus_minus_temper"] = d.austenitize_T - d.temper_T
    d["is_tempered"] = d.temper_T.notna().astype(int)

    d["n_missing_proc"] = d[PROC].isna().sum(axis=1)
    d["n_missing_comp"] = d[COMP].isna().sum(axis=1)
    return d


# --------------------------------------------------------------------------
# 2. Encoding + leakage-free grouping
# --------------------------------------------------------------------------
def build_cat_vocab(df):
    """Fixed global vocabulary per categorical column so train/val/test/inference
    all encode the same category to the same code. "NA" is always included so a
    column that's missing at inference time (even if it was never missing during
    training) still encodes cleanly instead of becoming an unseen category."""
    vocab = {}
    for c in CAT_FEATURES:
        vals = sorted(df[c].map(lambda v: "NA" if pd.isna(v) else str(v)).unique())
        if "NA" not in vals:
            vals = vals + ["NA"]
        vocab[c] = vals
    return vocab


def encode(d, cat_vocab):
    X = d[NUM_FEATURES].astype(float).copy()
    for c in CAT_FEATURES:
        v = d[c].map(lambda x: "NA" if pd.isna(x) else str(x))
        X[c] = pd.Categorical(v, categories=cat_vocab[c]).codes.astype(float)
    return X


def feature_hash(d, key=IDENTITY):
    """Rows with an identical feature vector must never straddle train/test --
    otherwise the model can memorise instead of generalise."""
    s = d[key].copy()
    for c in key:
        s[c] = s[c].map(lambda v: "NA" if pd.isna(v) else str(v))
    return s.apply(lambda r: hashlib.md5("|".join(r.tolist()).encode()).hexdigest()[:12], axis=1)


def grouped_split_70_15_15(d, fracs=(0.70, 0.15, 0.15), seed=RANDOM_STATE):
    """Assign whole groups to train/val/test, greedily filling whichever split is
    furthest below its row-count quota. Largest groups placed first."""
    rng = np.random.default_rng(seed)
    sizes = d.groupby("group").size()
    order = sizes.sample(frac=1, random_state=seed).sort_values(ascending=False, kind="mergesort").index
    quota, filled, assign = np.array(fracs) * len(d), np.zeros(3), {}
    for g in order:
        j = int(np.argmax((quota - filled) / np.maximum(quota, 1) + rng.normal(0, 5e-3, 3)))
        assign[g] = j
        filled[j] += sizes[g]
    idx = d["group"].map(assign).values
    return d[idx == 0].copy(), d[idx == 1].copy(), d[idx == 2].copy()


def noise_ceiling(d, target, key=IDENTITY):
    """Upper bound on achievable R2: rows with an identical feature vector but a
    different target value contribute irreducible variance no model can predict
    away. Computed on the same population the model is actually trained on."""
    dd = d.dropna(subset=[target])
    within = ((dd[target] - dd.groupby(key, dropna=False)[target].transform("mean")) ** 2).mean()
    total = dd[target].var(ddof=0)
    return dict(n=len(dd), ceiling_r2=1 - within / total, irreducible_rmse=np.sqrt(within))


# --------------------------------------------------------------------------
# 3. Model zoo
# --------------------------------------------------------------------------
def impute(est):
    """Wrap estimators that cannot handle NaN natively."""
    return Pipeline([("imp", SimpleImputer(strategy="median")), ("est", est)])


def scaled(est):
    return Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler()), ("est", est)])


def _g(full, fast):
    return fast if FAST_MODE else full


def model_zoo():
    ntree = 150 if FAST_MODE else 400
    return {
        "Ridge": (
            scaled(Ridge()),
            _g({"est__alpha": [0.1, 1.0, 10.0, 100.0]}, {"est__alpha": [0.1]}),
        ),
        "DecisionTree": (
            impute(DecisionTreeRegressor(random_state=RANDOM_STATE)),
            _g(
                {"est__max_depth": [4, 6, 8, 12], "est__min_samples_leaf": [2, 5, 10]},
                {"est__max_depth": [4], "est__min_samples_leaf": [2]},
            ),
        ),
        "RandomForest": (
            impute(RandomForestRegressor(n_estimators=ntree, random_state=RANDOM_STATE, n_jobs=N_JOBS)),
            _g(
                {"est__max_depth": [8, 14, None], "est__min_samples_leaf": [1, 2, 5], "est__max_features": ["sqrt", 0.5]},
                {"est__max_depth": [8], "est__min_samples_leaf": [1], "est__max_features": ["sqrt"]},
            ),
        ),
        "ExtraTrees": (
            impute(ExtraTreesRegressor(n_estimators=ntree, random_state=RANDOM_STATE, n_jobs=N_JOBS)),
            _g(
                {"est__max_depth": [10, None], "est__min_samples_leaf": [1, 2, 5], "est__max_features": ["sqrt", 0.6]},
                {"est__max_depth": [10], "est__min_samples_leaf": [1], "est__max_features": ["sqrt"]},
            ),
        ),
        "Bagging(Tree)": (
            impute(BaggingRegressor(estimator=DecisionTreeRegressor(random_state=RANDOM_STATE),
                                     n_estimators=ntree // 2, random_state=RANDOM_STATE, n_jobs=N_JOBS)),
            _g(
                {"est__max_samples": [0.6, 0.8, 1.0], "est__estimator__min_samples_leaf": [2, 5]},
                {"est__max_samples": [0.6], "est__estimator__min_samples_leaf": [2]},
            ),
        ),
        "GradBoost": (
            impute(GradientBoostingRegressor(random_state=RANDOM_STATE)),
            _g(
                {"est__n_estimators": [300, 600], "est__learning_rate": [0.03, 0.08],
                 "est__max_depth": [2, 3], "est__subsample": [0.8]},
                {"est__n_estimators": [300], "est__learning_rate": [0.03], "est__max_depth": [2], "est__subsample": [0.8]},
            ),
        ),
        "HistGB": (
            HistGradientBoostingRegressor(random_state=RANDOM_STATE),
            _g(
                {"max_iter": [300, 600], "learning_rate": [0.03, 0.08], "max_leaf_nodes": [15, 31],
                 "min_samples_leaf": [5, 15], "l2_regularization": [0.0, 1.0]},
                {"max_iter": [300], "learning_rate": [0.03], "max_leaf_nodes": [15],
                 "min_samples_leaf": [5], "l2_regularization": [0.0]},
            ),
        ),
        "XGBoost": (
            XGBRegressor(random_state=RANDOM_STATE, n_jobs=N_JOBS, verbosity=0, tree_method="hist"),
            _g(
                {"n_estimators": [400, 800], "learning_rate": [0.03, 0.08], "max_depth": [3, 5],
                 "subsample": [0.8], "colsample_bytree": [0.7, 1.0], "reg_lambda": [1.0, 5.0]},
                {"n_estimators": [400], "learning_rate": [0.03], "max_depth": [3], "subsample": [0.8],
                 "colsample_bytree": [0.7], "reg_lambda": [1.0]},
            ),
        ),
        "LightGBM": (
            LGBMRegressor(random_state=RANDOM_STATE, n_jobs=N_JOBS, verbose=-1),
            _g(
                {"n_estimators": [400, 800], "learning_rate": [0.03, 0.08], "num_leaves": [15, 31],
                 "min_child_samples": [5, 20], "colsample_bytree": [0.7, 1.0]},
                {"n_estimators": [400], "learning_rate": [0.03], "num_leaves": [15],
                 "min_child_samples": [5], "colsample_bytree": [0.7]},
            ),
        ),
    }


def evaluate(y_true, y_pred):
    return {
        "R2": r2_score(y_true, y_pred),
        "MAE": mean_absolute_error(y_true, y_pred),
        "RMSE": float(np.sqrt(mean_squared_error(y_true, y_pred))),
    }


# --------------------------------------------------------------------------
# 4. Training
# --------------------------------------------------------------------------
def tune_all(target, Xtr, ytr, gtr, Xva, yva, Xte, yte, verbose=True):
    """GridSearchCV over GroupKFold inside the training split only -- plain KFold
    would let identical-feature-vector rows leak across folds and grid search
    would then reward the most memorising hyperparameters."""
    # Columns entirely missing for this target's training rows (e.g. the Kaggle
    # hardness rows carry no heat-treatment data at all, so HJP/aus_minus_temper/
    # quench_severity -- and even raw Cu/Al -- are all-NaN) carry zero information
    # and crash HistGradientBoostingRegressor's binning step. Drop them here,
    # keeping train/val/test column sets aligned.
    all_nan = Xtr.columns[Xtr.isna().all()]
    if len(all_nan):
        Xtr, Xva, Xte = (X.drop(columns=all_nan) for X in (Xtr, Xva, Xte))
        if verbose:
            print(f"  dropping all-missing columns for this target: {list(all_nan)}")

    n_groups = len(np.unique(gtr))
    cv = GroupKFold(n_splits=min(5, n_groups))

    fitted, rows = {}, []
    for name, (est, grid) in model_zoo().items():
        t0 = time.time()
        gs = GridSearchCV(est, grid, cv=cv, scoring="neg_root_mean_squared_error", n_jobs=N_JOBS, refit=True)
        gs.fit(Xtr, ytr, groups=gtr)
        best = gs.best_estimator_
        fitted[name] = best
        m_va, m_te = evaluate(yva, best.predict(Xva)), evaluate(yte, best.predict(Xte))
        rows.append({
            "model": name, "cv_RMSE": -gs.best_score_,
            "val_R2": m_va["R2"], "val_MAE": m_va["MAE"], "val_RMSE": m_va["RMSE"],
            "test_R2": m_te["R2"], "test_MAE": m_te["MAE"], "test_RMSE": m_te["RMSE"],
            "fit_s": time.time() - t0,
        })
        if verbose:
            print(f"  {name:<15} cvRMSE={-gs.best_score_:7.1f}  val R2={m_va['R2']:6.3f}  "
                  f"test R2={m_te['R2']:6.3f}  ({time.time()-t0:5.1f}s)")
    return fitted, pd.DataFrame(rows), Xtr, Xva, Xte


def build_ensembles(fitted, results, Xtr, ytr, gtr, Xva, yva, Xte, yte, top_k=5):
    """A VotingRegressor (equal-weight average) and a StackingRegressor (ridge
    meta-learner on GroupKFold out-of-fold predictions) over the top-k tuned
    models by CV score. Often nudges R2 above the single best base model."""
    ranked = results.sort_values("cv_RMSE")["model"].tolist()
    picks = [m for m in ranked if m != "Ridge"][:top_k]
    ests = [(m, fitted[m]) for m in picks]
    cv = GroupKFold(n_splits=min(5, len(np.unique(gtr))))

    out = {}
    out["Voting(top5)"] = VotingRegressor(ests, n_jobs=N_JOBS).fit(Xtr, ytr)
    out["Stacking(ridge)"] = StackingRegressor(
        estimators=ests, final_estimator=RidgeCV(alphas=np.logspace(-2, 3, 20)),
        cv=list(cv.split(Xtr, ytr, groups=gtr)), n_jobs=N_JOBS, passthrough=False,
    ).fit(Xtr, ytr)

    rows = []
    for name, m in out.items():
        mv, mt = evaluate(yva, m.predict(Xva)), evaluate(yte, m.predict(Xte))
        rows.append({
            "model": name, "cv_RMSE": np.nan,
            "val_R2": mv["R2"], "val_MAE": mv["MAE"], "val_RMSE": mv["RMSE"],
            "test_R2": mt["R2"], "test_MAE": mt["MAE"], "test_RMSE": mt["RMSE"],
            "fit_s": np.nan,
        })
    print(f"  ensembled: {picks}")
    return out, pd.DataFrame(rows)


def train_all(csv_path=CSV_PATH, model_dir=MODEL_DIR):
    raw = load_combined_raw(csv_path)
    df = clean(raw)
    df = add_features(df)
    cat_vocab = build_cat_vocab(df)
    df["group"] = feature_hash(df)

    os.makedirs(model_dir, exist_ok=True)
    summary = []

    for target, label in TARGETS.items():
        print(f"\n{'=' * 90}\n{target}  ({label})\n{'=' * 90}")
        d = df.dropna(subset=[target])
        ceil = noise_ceiling(df, target)
        print(f"n={ceil['n']}   noise ceiling R2={ceil['ceiling_r2']:.3f}   "
              f"(no model can beat this on this data -- see module docstring)")

        tr, va, te = grouped_split_70_15_15(d)
        print(f"train {len(tr)} / val {len(va)} / test {len(te)}   "
              f"overlapping groups: {len(set(tr.group) & set(te.group))}")

        Xtr, ytr, gtr = encode(tr, cat_vocab), tr[target].values, tr["group"].values
        Xva, yva = encode(va, cat_vocab), va[target].values
        Xte, yte = encode(te, cat_vocab), te[target].values

        fitted, results, Xtr, Xva, Xte = tune_all(target, Xtr, ytr, gtr, Xva, yva, Xte, yte)

        ens, ens_tbl = build_ensembles(fitted, results, Xtr, ytr, gtr, Xva, yva, Xte, yte)
        fitted.update(ens)
        results = pd.concat([results, ens_tbl], ignore_index=True)

        results = results.sort_values("val_RMSE").reset_index(drop=True)
        print(results.round(3).to_string(index=False))

        best_name = results.iloc[0]["model"]
        best_model = fitted[best_name]
        best_row = results.iloc[0]
        print(f"\n  selected on validation RMSE -> {best_name}")
        print(f"  TEST:  R2={best_row.test_R2:.3f}  MAE={best_row.test_MAE:.1f}  RMSE={best_row.test_RMSE:.1f}")

        joblib.dump(
            {
                "model": best_model,
                "model_name": best_name,
                "target": target,
                "feature_columns": list(Xtr.columns),
                "cat_vocab": cat_vocab,
            },
            os.path.join(model_dir, f"{target}.joblib"),
        )

        summary.append({
            "target": label, "best_model": best_name,
            "val_R2": round(best_row.val_R2, 3), "test_R2": round(best_row.test_R2, 3),
            "test_MAE": round(best_row.test_MAE, 1), "test_RMSE": round(best_row.test_RMSE, 1),
            "ceiling_R2": round(ceil["ceiling_r2"], 3),
        })

    print(f"\n\n{'=' * 90}\nFINAL SUMMARY\n{'=' * 90}")
    summary_df = pd.DataFrame(summary)
    print(summary_df.to_string(index=False))
    print(f"\nModels saved to ./{model_dir}/")
    return summary_df


# --------------------------------------------------------------------------
# 5. Inference on new data
# --------------------------------------------------------------------------
def predict_properties(input_df, model_dir=MODEL_DIR):
    """Predict tensile_strength, yield_strength and hardness_HB for new rows.

    `input_df` needs the raw composition/process columns used at training time:
    C, Mn, Cr, Mo, Ni, Si, V, Cu, Al, austenitize_T, quench_medium, temper_T,
    steel_family (and optionally data_tier). Missing columns are filled with NaN
    (composition treated as "not intentionally added", process columns left
    unknown) and the same feature engineering + encoding used in training is
    applied before scoring the saved models.
    """
    d = input_df.copy()
    for col in COMP + PROC + ["steel_family", "data_tier"]:
        if col not in d.columns:
            d[col] = np.nan
    d = add_features(d)

    preds = {}
    for target in TARGETS:
        bundle_path = os.path.join(model_dir, f"{target}.joblib")
        if not os.path.exists(bundle_path):
            raise FileNotFoundError(f"{bundle_path} not found -- run train_all() first.")
        bundle = joblib.load(bundle_path)
        X = encode(d, bundle["cat_vocab"]).reindex(columns=bundle["feature_columns"])
        preds[target] = bundle["model"].predict(X)

    return pd.DataFrame(preds, index=input_df.index)


if __name__ == "__main__":
    train_all()

    print(f"\n{'=' * 90}\nExample: predicting on a few held-out rows\n{'=' * 90}")
    raw = load_raw()
    sample = raw.dropna(subset=["tensile_strength"]).sample(5, random_state=RANDOM_STATE)
    preds = predict_properties(sample)
    comparison = pd.concat(
        [sample[["source", "steel_family", "tensile_strength", "yield_strength", "hardness"]].reset_index(drop=True),
         preds.add_prefix("pred_").reset_index(drop=True)],
        axis=1,
    )
    print(comparison.to_string(index=False))
