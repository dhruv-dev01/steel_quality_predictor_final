"""
FastAPI server for steel property predictions.

Run from the project root:
    uvicorn api:app --reload --port 8000
"""

from __future__ import annotations

import os
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from steel_property_predictor import COMP, MODEL_DIR, PROC, predict_properties

app = FastAPI(
    title="Steel Property Predictor API",
    description="Predict tensile strength, yield strength, and Brinell hardness from composition + heat treatment.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000","https://steel-quality-predictor-final.vercel.app",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_ORIGIN", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STEEL_FAMILIES = [
    "carbon_steel",
    "carbon_medium",
    "low_alloy_QT",
    "CrMo_QT",
    "NiCrMo_QT",
    "stainless_austenitic",
    "stainless_martensitic",
    "stainless_ferritic",
]

QUENCH_MEDIA = ["water", "oil", "air", "polymer", "salt", "NA"]

MODEL_METRICS = [
    {
        "target": "hardness_HB",
        "label": "Hardness (HB)",
        "test_r2": 0.96,
        "test_mae": 14,
        "unit": "HB",
        "reliability": "high",
    },
    {
        "target": "tensile_strength",
        "label": "Tensile Strength (UTS)",
        "test_r2": 0.50,
        "test_mae": 109,
        "unit": "MPa",
        "reliability": "moderate",
    },
    {
        "target": "yield_strength",
        "label": "Yield Strength (YS)",
        "test_r2": 0.32,
        "test_mae": 118,
        "unit": "MPa",
        "reliability": "low",
    },
]


class SteelInput(BaseModel):
    C: float = Field(0.4, ge=0, le=2, description="Carbon (wt%)")
    Mn: float = Field(0.8, ge=0, le=20)
    Cr: float = Field(1.0, ge=0, le=30)
    Mo: float = Field(0.2, ge=0, le=10)
    Ni: float = Field(0.0, ge=0, le=30)
    Si: float = Field(0.3, ge=0, le=5)
    V: float = Field(0.0, ge=0, le=5)
    Cu: float = Field(0.0, ge=0, le=5)
    Al: float = Field(0.0, ge=0, le=5)
    austenitize_T: float | None = Field(850, ge=700, le=1200, description="Austenitizing temperature (°C)")
    temper_T: float | None = Field(580, ge=150, le=700, description="Tempering temperature (°C)")
    temper_time_s: float | None = Field(None, ge=0, description="Tempering time (seconds)")
    quench_medium: str | None = Field("oil", description="Quench medium")
    steel_family: str = Field("low_alloy_QT", description="Steel family category")


class PredictionResponse(BaseModel):
    tensile_strength: float
    yield_strength: float
    hardness_HB: float


def models_ready() -> bool:
    return all(
        os.path.exists(os.path.join(MODEL_DIR, f"{target}.joblib"))
        for target in ("tensile_strength", "yield_strength", "hardness_HB")
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "models_loaded": models_ready(), "model_dir": MODEL_DIR}


@app.get("/metadata")
def metadata() -> dict[str, Any]:
    return {
        "composition_fields": COMP,
        "process_fields": PROC,
        "steel_families": STEEL_FAMILIES,
        "quench_media": QUENCH_MEDIA,
        "metrics": MODEL_METRICS,
        "models_ready": models_ready(),
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(data: SteelInput) -> PredictionResponse:
    if not models_ready():
        raise HTTPException(
            status_code=503,
            detail="Trained models not found. Run `python steel_property_predictor.py` first.",
        )

    row = {k: v for k, v in data.model_dump().items() if v is not None}
    df = pd.DataFrame([row])

    try:
        preds = predict_properties(df)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return PredictionResponse(
        tensile_strength=round(float(preds.iloc[0]["tensile_strength"]), 1),
        yield_strength=round(float(preds.iloc[0]["yield_strength"]), 1),
        hardness_HB=round(float(preds.iloc[0]["hardness_HB"]), 1),
    )
