"""Risk-engine unit tests: determinism, monotonicity, thresholds, weights,
confidence and score bounds. Pure functions — no DB, no TestClient needed."""

from app.core.config import get_settings
from app.models.base import RiskLevel
from app.services.risk_engine import (
    RiskInputs,
    compute_risk,
    level_for_score,
    scenario_rainfall,
)


def _full_inputs(**overrides) -> RiskInputs:
    base = dict(
        rainfall_mm_24h=40.0,
        antecedent_index=30.0,
        slope_deg=30.0,
        historical_susceptibility=50.0,
        terrain_index=40.0,
        exposure_index=45.0,
        is_simulated=True,
    )
    base.update(overrides)
    return RiskInputs(**base)


def test_deterministic_same_inputs_same_score():
    a = compute_risk(_full_inputs())
    b = compute_risk(_full_inputs())
    assert a.risk_score == b.risk_score
    assert a.risk_level == b.risk_level


def test_score_bounded_0_100():
    lo = compute_risk(RiskInputs())  # all zero
    hi = compute_risk(
        RiskInputs(
            rainfall_mm_24h=500.0,
            antecedent_index=500.0,
            slope_deg=90.0,
            historical_susceptibility=100.0,
            terrain_index=100.0,
            exposure_index=100.0,
        )
    )
    assert 0.0 <= lo.risk_score <= 100.0
    assert 0.0 <= hi.risk_score <= 100.0
    assert hi.risk_score <= 100.0


def test_monotonic_in_rainfall():
    low = compute_risk(_full_inputs(rainfall_mm_24h=10.0))
    high = compute_risk(_full_inputs(rainfall_mm_24h=160.0))
    # More rain, everything else equal → score must not decrease.
    assert high.risk_score >= low.risk_score
    # Rainfall is weighted 0.30, so the swing must be material.
    assert high.risk_score - low.risk_score > 5.0


def test_threshold_to_level_mapping():
    assert level_for_score(0.0) == RiskLevel.green
    assert level_for_score(24.9) == RiskLevel.green
    assert level_for_score(25.0) == RiskLevel.yellow
    assert level_for_score(49.9) == RiskLevel.yellow
    assert level_for_score(50.0) == RiskLevel.orange
    assert level_for_score(74.9) == RiskLevel.orange
    assert level_for_score(75.0) == RiskLevel.red
    assert level_for_score(100.0) == RiskLevel.red


def test_display_level_matches_enum():
    result = compute_risk(
        _full_inputs(
            rainfall_mm_24h=200.0,
            slope_deg=90.0,
            historical_susceptibility=100.0,
        )
    )
    assert result.risk_level == RiskLevel.red
    assert result.display_level == "CRITICAL"


def test_weights_normalize_to_one():
    weights = get_settings().risk_weights()
    assert abs(sum(weights.values()) - 1.0) < 1e-9
    assert set(weights) == {
        "rainfall", "slope", "historical", "soil", "terrain", "exposure"
    }


def test_contributions_sum_to_score():
    result = compute_risk(_full_inputs())
    total = sum(factor.contribution for factor in result.factors)
    # Each contribution is rounded to 1 dp, so allow a small rounding tolerance.
    assert abs(total - result.risk_score) < 1.0


def test_factors_sorted_by_contribution_desc():
    result = compute_risk(_full_inputs())
    contributions = [factor.contribution for factor in result.factors]
    assert contributions == sorted(contributions, reverse=True)
    assert len(result.factors) == 6


def test_simulated_lowers_confidence():
    real = compute_risk(_full_inputs(is_simulated=False))
    simulated = compute_risk(_full_inputs(is_simulated=True))
    assert simulated.confidence < real.confidence
    # §5: never fully certain.
    assert real.confidence < 1.0


def test_missing_signals_lower_confidence():
    complete = compute_risk(_full_inputs(is_simulated=False))
    sparse = compute_risk(
        RiskInputs(rainfall_mm_24h=40.0, is_simulated=False)  # only one signal
    )
    assert sparse.confidence < complete.confidence


def test_scenario_rainfall_presets():
    assert scenario_rainfall("normal") == 20.0
    assert scenario_rainfall("heavy") == 90.0
    assert scenario_rainfall("extreme") == 160.0
    assert scenario_rainfall("EXTREME") == 160.0  # case-insensitive
    assert scenario_rainfall("unknown") is None
    assert scenario_rainfall(None) is None


def test_to_dict_shape_and_no_guarantee_language():
    payload = compute_risk(_full_inputs()).to_dict()
    for key in (
        "risk_score", "risk_level", "display_level", "confidence",
        "factors", "is_simulated", "model_version", "computed_at",
        "recommended_action", "disclaimer",
    ):
        assert key in payload
    # §5: output disclaims certainty rather than claiming it.
    blob = (payload["disclaimer"] + payload["recommended_action"]).lower()
    assert "100%" not in blob
    assert "100 percent" not in blob
    assert "not a guaranteed" in payload["disclaimer"].lower()
    factor = payload["factors"][0]
    assert {"name", "value", "weight", "contribution", "impact"} <= set(factor)
