"""Explainable landslide-risk engine (PROTOTYPE).

A deterministic, fully explainable, weighted scoring model — **not** a machine-
learning predictor and **not** an LLM (project rule §10). It fuses six factors,
each normalized to 0-100, using configurable weights (see
``Settings.risk_weights``). The maths is transparent and reproducible: same
inputs → same output, and every point of the final score is attributable to a
named factor.

Project rules honored:
- §5  — never emits a "guaranteed" / "100% accurate" claim. Output is a
        score (0-100), a level, per-factor contributions and a ``confidence``.
- §9/§18 — consumes real or DEMO/SIMULATED inputs interchangeably; the
        ``is_simulated`` flag flows through to the result and lowers confidence.
- §10 — explainable weighted model, deliberately NOT an ML/LLM predictor.

The weighting here is illustrative for the SIH prototype; it is **not** a
government-certified threshold set. Weights are configurable via ``RISK_W_*``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.config import Settings, get_settings
from app.models.base import RiskLevel

# Bumped whenever the scoring maths changes; stored on RiskPrediction rows.
MODEL_VERSION = "risk-proto-0.1.0"

# Display labels layered over the stored green|yellow|orange|red enum. The
# database keeps the enum unchanged (Phase 1 schema is frozen); this mapping is
# purely presentational for the dashboard.
DISPLAY_LEVEL: dict[RiskLevel, str] = {
    RiskLevel.green: "LOW",
    RiskLevel.yellow: "MODERATE",
    RiskLevel.orange: "HIGH",
    RiskLevel.red: "CRITICAL",
}

# Rainfall scenario presets (mm over 24h) that drive the live "change the rain,
# watch the score move" demo. Values are illustrative, not forecasts.
SCENARIO_RAINFALL_MM: dict[str, float] = {
    "normal": 20.0,
    "heavy": 90.0,
    "extreme": 160.0,
}

# Human-readable recommended actions per level (surfaced by the alert API).
RECOMMENDED_ACTION: dict[RiskLevel, str] = {
    RiskLevel.green: "Routine monitoring. No action required.",
    RiskLevel.yellow: "Increased monitoring; brief local response teams.",
    RiskLevel.orange: (
        "Issue advisory; pre-position response teams; inspect vulnerable "
        "road segments and slopes."
    ),
    RiskLevel.red: (
        "Activate early warning; consider evacuation of exposed settlements; "
        "restrict traffic on affected corridors."
    ),
}

DISCLAIMER = (
    "Prototype explainable risk model — a decision-support score, "
    "NOT a guaranteed prediction (SIH demo)."
)


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


# --- factor normalizations (each documented + monotonic, output 0-100) --------

def _norm_rainfall(mm_24h: float) -> float:
    """24h rainfall → 0-100. 150 mm (≈ intense-event threshold) maps to 100."""

    return _clamp(mm_24h / 1.5)


def _norm_slope(slope_deg: float) -> float:
    """Terrain slope → 0-100. 45° (very steep) maps to 100."""

    return _clamp(slope_deg / 45.0 * 100.0)


def _norm_soil(antecedent_index: float) -> float:
    """Antecedent-moisture proxy (mm-scale) → 0-100. ~90 mm maps to 100."""

    return _clamp(antecedent_index / 0.9)


def _passthrough(value: float) -> float:
    """Already on a 0-100 scale (historical susceptibility, terrain, exposure)."""

    return _clamp(value)


def _impact(normalized: float) -> str:
    """Bucket a normalized 0-100 factor value into LOW / MEDIUM / HIGH."""

    if normalized >= 66.0:
        return "HIGH"
    if normalized >= 33.0:
        return "MEDIUM"
    return "LOW"


def level_for_score(score: float) -> RiskLevel:
    """Map a 0-100 score to the stored RiskLevel enum via fixed thresholds.

    <25 green/LOW · 25-49 yellow/MODERATE · 50-74 orange/HIGH · ≥75 red/CRITICAL.
    """

    if score >= 75.0:
        return RiskLevel.red
    if score >= 50.0:
        return RiskLevel.orange
    if score >= 25.0:
        return RiskLevel.yellow
    return RiskLevel.green


def scenario_rainfall(scenario: str | None) -> float | None:
    """Return the preset 24h rainfall for a named scenario, or None if unknown."""

    if not scenario:
        return None
    return SCENARIO_RAINFALL_MM.get(scenario.strip().lower())


@dataclass
class RiskInputs:
    """Normalized-ready inputs for a single location/zone.

    All values default to 0 so a partially-populated location still scores
    (missing signals simply contribute nothing and lower confidence).
    """

    rainfall_mm_24h: float = 0.0
    antecedent_index: float = 0.0      # soil-moisture proxy (mm-scale)
    slope_deg: float = 0.0
    historical_susceptibility: float = 0.0  # 0-100 (incident density per zone)
    terrain_index: float = 0.0         # 0-100 static composite (elev/curv/TWI)
    exposure_index: float = 0.0        # 0-100 (population + critical infra)
    is_simulated: bool = True


@dataclass
class RiskFactor:
    """One explainable contributor to the score."""

    key: str
    name: str
    raw_value: float      # original units (mm, degrees, index…)
    unit: str
    normalized: float     # 0-100
    weight: float         # normalized weight (Σ = 1)
    contribution: float   # points added to the final score (normalized × weight)
    impact: str           # LOW | MEDIUM | HIGH

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "name": self.name,
            "value": self.raw_value,
            "unit": self.unit,
            "normalized": self.normalized,
            "weight": self.weight,
            "contribution": self.contribution,
            "impact": self.impact,
        }


@dataclass
class RiskResult:
    """Full explainable output of the engine."""

    risk_score: float               # 0-100
    risk_level: RiskLevel           # stored enum (green|yellow|orange|red)
    display_level: str              # LOW | MODERATE | HIGH | CRITICAL
    confidence: float               # 0-1
    factors: list[RiskFactor]       # sorted by contribution, descending
    is_simulated: bool
    model_version: str
    computed_at: datetime

    @property
    def recommended_action(self) -> str:
        return RECOMMENDED_ACTION[self.risk_level]

    def to_dict(self) -> dict:
        return {
            "risk_score": self.risk_score,
            "risk_level": self.risk_level.value,
            "display_level": self.display_level,
            "confidence": self.confidence,
            "factors": [factor.to_dict() for factor in self.factors],
            "is_simulated": self.is_simulated,
            "model_version": self.model_version,
            "computed_at": self.computed_at.isoformat(),
            "recommended_action": self.recommended_action,
            "disclaimer": DISCLAIMER,
        }


def _confidence(inputs: RiskInputs) -> float:
    """Confidence in 0-1. Lower for simulated inputs and for missing signals.

    Never returns 1.0 — the model is explicitly a decision-support estimate,
    not a certainty (§5).
    """

    base = 0.9
    # Penalize simulated data — we must not present it as ground truth (§18).
    if inputs.is_simulated:
        base *= 0.7
    # Penalize missing/zero signals (each absent driver erodes confidence a bit).
    signals = [
        inputs.rainfall_mm_24h,
        inputs.antecedent_index,
        inputs.slope_deg,
        inputs.historical_susceptibility,
        inputs.terrain_index,
        inputs.exposure_index,
    ]
    missing = sum(1 for value in signals if value <= 0.0)
    base *= max(0.5, 1.0 - 0.05 * missing)
    return round(_clamp(base, 0.0, 0.99), 2)


def compute_risk(inputs: RiskInputs, settings: Settings | None = None) -> RiskResult:
    """Compute an explainable landslide-risk score for one location/zone.

    Deterministic: identical inputs (and weights) always yield identical output.
    The final score is the weight-normalized sum of the six factor scores, so it
    is guaranteed to land in 0-100 and every point is attributable to a factor.
    """

    settings = settings or get_settings()
    weights = settings.risk_weights()

    # (key, human name, raw value, unit, normalized 0-100)
    definitions = [
        ("rainfall", "24h Rainfall", inputs.rainfall_mm_24h, "mm",
         _norm_rainfall(inputs.rainfall_mm_24h)),
        ("slope", "Slope", inputs.slope_deg, "°",
         _norm_slope(inputs.slope_deg)),
        ("historical", "Historical Susceptibility", inputs.historical_susceptibility,
         "index", _passthrough(inputs.historical_susceptibility)),
        ("soil", "Soil Moisture (antecedent)", inputs.antecedent_index, "mm",
         _norm_soil(inputs.antecedent_index)),
        ("terrain", "Terrain", inputs.terrain_index, "index",
         _passthrough(inputs.terrain_index)),
        ("exposure", "Exposure", inputs.exposure_index, "index",
         _passthrough(inputs.exposure_index)),
    ]

    factors: list[RiskFactor] = []
    score = 0.0
    for key, name, raw, unit, normalized in definitions:
        weight = weights[key]
        contribution = normalized * weight
        score += contribution
        factors.append(
            RiskFactor(
                key=key,
                name=name,
                raw_value=round(raw, 1),
                unit=unit,
                normalized=round(normalized, 1),
                weight=round(weight, 3),
                contribution=round(contribution, 1),
                impact=_impact(normalized),
            )
        )

    score = round(_clamp(score), 1)
    level = level_for_score(score)
    factors.sort(key=lambda factor: factor.contribution, reverse=True)

    return RiskResult(
        risk_score=score,
        risk_level=level,
        display_level=DISPLAY_LEVEL[level],
        confidence=_confidence(inputs),
        factors=factors,
        is_simulated=inputs.is_simulated,
        model_version=MODEL_VERSION,
        computed_at=datetime.now(timezone.utc),
    )
