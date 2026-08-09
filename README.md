# Steel Mechanical Property Prediction

Predicts three mechanical properties of steel from composition + heat treatment:
**tensile strength (UTS)**, **yield strength (YS)**, and **Brinell hardness (HB)**.

## Files in this package

```
steel_property_predictor.py     <- the pipeline: preprocessing -> training -> saved models -> predict()
steel_properties.ipynb          <- exploratory/audit notebook (the "why" behind every design choice)
requirements.txt                <- Python dependencies

steelbench_core_open.csv        <- core dataset (1,360 rows: EMK spec sheets, NIMS heats, Kaggle-measured steels)
external_data/
  tempering_hardness_raiipa.csv <- 1,466-row tempering-curve dataset (composition + real tempering
                                    time/temperature -> hardness), merged in to fix the hardness model

models/                         <- trained models from steel_property_predictor.py (USE THESE)
  tensile_strength.joblib
  yield_strength.joblib
  hardness_HB.joblib
models_notebook/                <- models trained inside the notebook, on the smaller un-augmented
                                    dataset only. Kept separate on purpose -- see "Two model sets" below.
```

## Quickest path: use the trained models

```python
import pandas as pd
from steel_property_predictor import predict_properties

new = pd.DataFrame([{
    "C": 0.4, "Mn": 0.8, "Cr": 1.0, "Mo": 0.2, "Ni": 0.0, "Si": 0.3, "V": 0.0, "Cu": 0.0, "Al": 0.0,
    "austenitize_T": 850, "quench_medium": "oil", "temper_T": 580,
    "steel_family": "low_alloy_QT",
}])
print(predict_properties(new))
# -> tensile_strength, yield_strength, hardness_HB predictions for this composition
```

`models/*.joblib` are loaded automatically; no retraining needed.

## Retraining from scratch

```
python steel_property_predictor.py
```

Runs the whole pipeline: loads + merges both CSVs, cleans the data, engineers metallurgical
features (carbon equivalent, Schaeffler equivalents, Hollomon-Jaffe tempering parameter, ...),
does a **leakage-free group-aware train/val/test split** (rows sharing an identical feature
vector never straddle the split), tunes 9 model families per target via `GridSearchCV` +
`GroupKFold`, builds Voting/Stacking ensembles on top, picks the best on validation, evaluates
once on test, and overwrites `models/*.joblib`.

`FAST_MODE = True` at the top of the file (coarse grid, ~2 min) is the default; set it to
`False` for the full grid search (~12-15 min) used to produce the numbers below. In this
project full vs. fast grid search made almost no difference — the ceiling here is set by the
data, not by hyperparameter tuning.

## Current accuracy (test set, full grid search)

| Target | Test R² | Test MAE | Test RMSE | Noise ceiling* |
|---|---|---|---|---|
| **Hardness (HB)** | **0.96** | 14 HB | 25 HB | 0.99 |
| Tensile strength (UTS, MPa) | 0.50 | 109 MPa | 155 MPa | 0.88 |
| Yield strength (YS, MPa) | 0.32 | 118 MPa | 163 MPa | 0.80 |

\* The theoretical max R² given that many rows share an identical feature vector but report
different measured values — a hard data limit no model can beat, not a tuning target.

**A single train/test split isn't the full story.** Repeating the split across 10 different
random seeds gives the honest picture:

| Target | R² (mean ± std across 10 splits) | Verdict |
|---|---|---|
| Hardness | 0.94 ± 0.02 | Reliable — trust it. |
| Tensile strength | 0.45 ± 0.24 | Usable but noisy — expect real error around ±100 MPa. |
| Yield strength | 0.09 ± 0.39 | **Not usable.** Std exceeds the mean; on an unlucky split R² goes negative. |

**Why yield strength stays weak:** it depends heavily on grain size and prior cold work,
neither of which is recorded in any dataset used here. This is a data gap, not something
more tuning, ensembling, or model families would fix — confirmed by testing full vs. fast
hyperparameter search (no meaningful difference) and by searching for (but not finding) a
public dataset that pairs yield strength with heat treatment the way the hardness fix below
did for hardness.

## Why hardness went from unusable to reliable

The original data had a hard blocker: the only rows with real (Brinell) hardness measurements
(237 of them, from the Kaggle-sourced tier) had **zero heat-treatment data** — every one of
`austenitize_T`, `temper_T`, and `quench_medium` was missing. Predicting hardness while blind
to tempering is close to impossible; the same steel grade can span 200-600 HB depending purely
on how it was tempered.

Fix: merged in a public 1,466-row tempering-curve compilation (composition + real tempering
time/temperature -> resulting hardness, classic metallurgical literature e.g. Grange & Baughman
1956, via github.com/Nate-Sheibley/Mild-Steel-Tempering). It reports Rockwell C, not Brinell, so
values are converted via the standard **ASTM E140** table and restricted to HRC 20-58 — the
range that conversion is actually considered reliable, rather than trusted blindly outside it.
1,161 of 1,466 rows survive that filter. Real tempering *time* (previously untracked) was also
added as a feature, and the Hollomon-Jaffe tempering-parameter formula was corrected to use it.

Result: hardness training rows went from 237 to 1,398, and test R² from ~0.5 (single split,
already unreliable, actual mean across splits was 0.18 ± 0.21) to **0.94 ± 0.02 across 10
splits** — a stable, large improvement, not a lucky split.

A 312-sample dataset of maraging/superalloy-type steels with yield+tensile strength was also
found but **not merged in**: it uses elements outside this project's schema (Co, W, Ti, Nb) and
is a different alloy family, unlikely to transfer well to the carbon/low-alloy/stainless steels
this dataset is mostly about.

## Two model sets — which to use

`steel_property_predictor.py` trains on the core CSV **plus** the external hardness dataset,
and is the one that achieves the numbers above. The notebook (`steel_properties.ipynb`) trains
on the core CSV **only** and was kept as the original audit/exploration record — its hardness
numbers are the pre-fix ones (~0.5). **Use `models/`, not `models_notebook/`,** unless you
specifically want to reproduce the notebook's own (smaller-data) results. The two save to
different directories on purpose so retraining one never silently overwrites the other's models.

## Data provenance / licensing note

`steelbench_core_open.csv` combines EMK spec-sheet data, NIMS MatNavi heats, and a Kaggle
carbon/stainless steel compilation (already merged before this project started).
`external_data/tempering_hardness_raiipa.csv` is a public GitHub-hosted compilation of
tempering data from classic metallurgical literature. Verify licensing/attribution
requirements for your own use case before redistributing.
