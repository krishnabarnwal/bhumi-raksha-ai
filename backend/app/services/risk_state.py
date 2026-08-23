"""Shared risk-state helpers — one compute path for every read endpoint.

Reconstructs the engine inputs stored on a zone's latest ``RiskPrediction``
(``contributing_factors["inputs"]``) and computes its risk under an optional
rainfall scenario / override. The zones map, the risk-detail panel and the
early-warning list all go through :func:`zone_result`, so the colour on the
map, the score in the panel and the severity of an alert can never disagree —
there is a single source of truth and nothing is persisted mid-demo.

All inputs here are DEMO/SIMULATED (§18); the output is an explainable score,
never a guaranteed prediction (§5).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import RiskLevel
from app.models.hazard import RiskPrediction
from app.services.risk_engine import (
    RiskInputs,
    RiskResult,
    compute_risk,
    scenario_rainfall,
)

# Map colours shared with the frontend legend.
LEVEL_COLOR: dict[RiskLevel, str] = {
    RiskLevel.green: "#2e7d32",
    RiskLevel.yellow: "#f9a825",
    RiskLevel.orange: "#ef6c00",
    RiskLevel.red: "#c62828",
}


def as_level(value) -> RiskLevel:
    return value if isinstance(value, RiskLevel) else RiskLevel(value)


def color_for(value) -> str:
    return LEVEL_COLOR.get(as_level(value), "#9e9e9e")


def latest_inputs(db: Session, zone_id: int) -> RiskInputs:
    """Rebuild the engine inputs stored on the zone's latest prediction."""

    factors = db.execute(
        select(RiskPrediction.contributing_factors)
        .where(RiskPrediction.risk_zone_id == zone_id)
        .order_by(RiskPrediction.valid_to.desc(), RiskPrediction.id.desc())
        .limit(1)
    ).scalar_one_or_none()

    data = (factors or {}).get("inputs") if factors else None
    if not data:
        return RiskInputs()
    return RiskInputs(
        rainfall_mm_24h=data.get("rainfall_mm_24h", 0.0),
        antecedent_index=data.get("antecedent_index", 0.0),
        slope_deg=data.get("slope_deg", 0.0),
        historical_susceptibility=data.get("historical_susceptibility", 0.0),
        terrain_index=data.get("terrain_index", 0.0),
        exposure_index=data.get("exposure_index", 0.0),
        is_simulated=data.get("is_simulated", True),
    )


def resolve_override(scenario: str | None, rainfall_24h: float | None) -> float | None:
    """Resolve an explicit rainfall override, or a named scenario's preset."""

    if rainfall_24h is not None:
        return float(rainfall_24h)
    return scenario_rainfall(scenario)


def scenario_label(scenario: str | None, rainfall_24h: float | None) -> str:
    if scenario:
        return scenario.strip().lower()
    if rainfall_24h is not None:
        return "custom"
    return "current"


def zone_result(db: Session, zone_id: int, override: float | None) -> RiskResult:
    """Compute a zone's risk from its stored inputs, applying a rainfall override."""

    inputs = latest_inputs(db, zone_id)
    if override is not None:
        inputs.rainfall_mm_24h = override
    return compute_risk(inputs)
