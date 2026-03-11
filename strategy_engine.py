#!/usr/bin/env python3
"""
F1 Race Strategy Engine — MLX-powered Tire Degradation Model

Uses Apple's MLX framework to train a small neural network that
predicts lap-time degradation as a function of:
    • tire_age   — number of laps on this set of tires (0-based)
    • compound   — one-hot encoded: Soft [1,0,0], Medium [0,1,0], Hard [0,0,1]
    • fuel_load  — proxy via (total_laps − lap_number) / total_laps, range [0,1]

The model outputs a *delta* (seconds) relative to the compound's baseline pace.
After training we sweep the model to produce smooth degradation curves that
the frontend renders.

Designed to be called from preprocess.py after fetching Race session data.
"""

import json
import math
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim

# ---------------------------------------------------------------------------
# Tire compound helpers
# ---------------------------------------------------------------------------

COMPOUNDS = ["SOFT", "MEDIUM", "HARD"]
COMPOUND_INDEX = {c: i for i, c in enumerate(COMPOUNDS)}

# Canonical colours used in the frontend
COMPOUND_COLORS = {
    "SOFT": "#E10600",
    "MEDIUM": "#FFC700",
    "HARD": "#CCCCCC",
}


def one_hot_compound(compound_str: str) -> list[float]:
    """Return a 3-element one-hot list for a compound string."""
    idx = COMPOUND_INDEX.get(compound_str.upper(), -1)
    if idx < 0:
        return [0.0, 0.0, 0.0]
    vec = [0.0, 0.0, 0.0]
    vec[idx] = 1.0
    return vec


# ---------------------------------------------------------------------------
# MLX Model
# ---------------------------------------------------------------------------

class TireDegradationMLP(nn.Module):
    """Small MLP: 5 inputs → hidden → 1 output (lap-time delta in seconds)."""

    def __init__(self, hidden: int = 64):
        super().__init__()
        self.fc1 = nn.Linear(5, hidden)
        self.fc2 = nn.Linear(hidden, hidden)
        self.fc3 = nn.Linear(hidden, 1)

    def __call__(self, x: mx.array) -> mx.array:
        x = nn.gelu(self.fc1(x))
        x = nn.gelu(self.fc2(x))
        return self.fc3(x)


# ---------------------------------------------------------------------------
# Data preparation (called from preprocess.py)
# ---------------------------------------------------------------------------

def prepare_training_data(laps: list[dict], total_laps: int) -> tuple[mx.array, mx.array]:
    """
    Convert a list of race-lap dicts into MLX arrays.

    Each lap dict should contain:
        driver, lapNumber, lapTime (seconds),
        compound (SOFT/MEDIUM/HARD), tireLife (int),
        stint (int), isAccurate (bool).

    Returns (X, y) where X.shape = (N, 5) and y.shape = (N, 1).
    """
    rows_x: list[list[float]] = []
    rows_y: list[float] = []

    # Group laps by compound to compute per-compound baseline (fastest lap)
    compound_bests: dict[str, float] = {}
    for lap in laps:
        c = lap.get("compound", "").upper()
        if c not in COMPOUND_INDEX:
            continue
        lt = lap.get("lapTime")
        if lt is None or lt <= 0:
            continue
        if c not in compound_bests or lt < compound_bests[c]:
            compound_bests[c] = lt

    if not compound_bests:
        return mx.array([]), mx.array([])

    for lap in laps:
        c = lap.get("compound", "").upper()
        if c not in COMPOUND_INDEX or c not in compound_bests:
            continue

        lt = lap.get("lapTime")
        tire_age = lap.get("tireLife", 0)
        lap_num = lap.get("lapNumber", 1)

        if lt is None or lt <= 0:
            continue

        # Normalise fuel load (1.0 at start, 0.0 at end)
        fuel = max(0.0, (total_laps - lap_num) / total_laps) if total_laps > 0 else 0.5

        # Normalise tire age (divide by a reasonable max stint length)
        tire_age_norm = tire_age / 40.0

        features = [tire_age_norm, fuel] + one_hot_compound(c)
        delta = lt - compound_bests[c]

        rows_x.append(features)
        rows_y.append(delta)

    if not rows_x:
        return mx.array([]), mx.array([])

    X = mx.array(rows_x)
    y = mx.array(rows_y).reshape(-1, 1)
    return X, y


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_model(
    X: mx.array,
    y: mx.array,
    epochs: int = 300,
    lr: float = 1e-3,
    verbose: bool = False,
) -> TireDegradationMLP:
    """Train an MLP on the prepared data and return the model."""

    model = TireDegradationMLP(hidden=64)
    optimizer = optim.Adam(learning_rate=lr)

    # Define loss + grad function
    def loss_fn(model, X, y):
        pred = model(X)
        return mx.mean((pred - y) ** 2)

    loss_and_grad = nn.value_and_grad(model, loss_fn)

    for epoch in range(epochs):
        loss, grads = loss_and_grad(model, X, y)
        optimizer.update(model, grads)
        mx.eval(model.parameters(), optimizer.state)

        if verbose and (epoch % 50 == 0 or epoch == epochs - 1):
            print(f"      Epoch {epoch:4d}  loss={loss.item():.4f}")

    return model


# ---------------------------------------------------------------------------
# Inference / curve generation
# ---------------------------------------------------------------------------

def generate_degradation_curves(
    model: TireDegradationMLP,
    total_laps: int,
    compound_baselines: dict[str, float],
    max_stint: int = 40,
) -> dict:
    """
    Sweep the model across tire ages 0 … max_stint for each compound.

    Returns a dict ready to be saved as strategy.json:
    {
        "totalLaps": int,
        "compounds": {
            "SOFT":   { "color": ..., "baseline": ..., "curve": [ {lap, delta, predicted} ... ] },
            "MEDIUM": { ... },
            "HARD":   { ... },
        }
    }
    """
    result: dict = {
        "totalLaps": total_laps,
        "compounds": {},
    }

    for compound in COMPOUNDS:
        if compound not in compound_baselines:
            continue

        baseline = compound_baselines[compound]
        curve: list[dict] = []

        for age in range(max_stint + 1):
            fuel = max(0.0, (total_laps - age) / total_laps) if total_laps > 0 else 0.5
            tire_age_norm = age / 40.0
            features = [tire_age_norm, fuel] + one_hot_compound(compound)

            x = mx.array([features])
            pred_delta = model(x).item()

            # Clamp delta to be non-negative (tires don't get faster with age)
            pred_delta = max(0.0, pred_delta)

            curve.append({
                "lap": age,
                "delta": round(pred_delta, 3),
                "predicted": round(baseline + pred_delta, 3),
            })

        result["compounds"][compound] = {
            "color": COMPOUND_COLORS[compound],
            "baseline": round(baseline, 3),
            "curve": curve,
        }

    return result


# ---------------------------------------------------------------------------
# High-level API (entry point for preprocess.py)
# ---------------------------------------------------------------------------

def build_strategy(
    race_laps: list[dict],
    total_laps: int,
    output_path: Path,
    verbose: bool = False,
) -> bool:
    """
    End-to-end: prepare data → train → generate curves → save JSON.

    Parameters
    ----------
    race_laps : list of lap dicts (from process_race_session)
    total_laps : total number of laps in the race
    output_path : where to write strategy.json
    verbose : print training progress

    Returns True on success, False if insufficient data.
    """
    X, y = prepare_training_data(race_laps, total_laps)

    if X.size == 0:
        if verbose:
            print("      ⚠️  Not enough race data for strategy model")
        return False

    if verbose:
        print(f"      🧠 Training MLX model on {X.shape[0]} samples…")

    model = train_model(X, y, epochs=300, lr=1e-3, verbose=verbose)

    # Compute baselines
    compound_bests: dict[str, float] = {}
    for lap in race_laps:
        c = lap.get("compound", "").upper()
        lt = lap.get("lapTime")
        if c in COMPOUND_INDEX and lt and lt > 0:
            if c not in compound_bests or lt < compound_bests[c]:
                compound_bests[c] = lt

    curves = generate_degradation_curves(model, total_laps, compound_bests)

    # Add metadata
    curves["modelInfo"] = {
        "framework": "MLX",
        "architecture": "MLP (5 → 64 → 64 → 1)",
        "trainingSamples": int(X.shape[0]),
        "description": "Tire degradation prediction model trained on race stint data",
    }

    output_path.write_text(json.dumps(curves, indent=2))
    if verbose:
        compounds_found = list(curves["compounds"].keys())
        print(f"      ✅ Strategy saved → {output_path.name} ({', '.join(compounds_found)})")

    return True
