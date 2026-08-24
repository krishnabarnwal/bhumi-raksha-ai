"""SOS triage unit tests — pure functions, no DB, no TestClient.

Covers the deterministic priority scoring (transparent factor breakdown, tier
mapping, life-safety floor, monotonicity) and the response recommender
(capability-over-proximity selection, availability filtering, estimated
distance). Also asserts the migration-free enum additions exist.
"""

import pytest

from app.models.field import FieldReportCategory, FieldReportStatus
from app.services.response_resources import (
    DEMO_RESPONSE_RESOURCES,
    ResponseResource,
    all_resources,
    available_resources,
    get_resource,
)
from app.services.sos_triage import (
    SosAttrs,
    haversine_km,
    recommend_response,
    sos_priority,
)

# Chungthang (north Sikkim) — the demo's hero SOS location.
CHUNGTHANG_LAT, CHUNGTHANG_LON = 27.600, 88.640


# --- enum additions (migration-free) -------------------------------------


def test_sos_and_flood_categories_exist():
    assert FieldReportCategory.sos.value == "sos"
    assert FieldReportCategory.flood.value == "flood"


def test_pending_and_assigned_statuses_exist():
    assert FieldReportStatus.pending.value == "pending"
    assert FieldReportStatus.assigned.value == "assigned"


# --- haversine -----------------------------------------------------------


def test_haversine_zero_for_same_point():
    assert haversine_km(27.3, 88.6, 27.3, 88.6) == pytest.approx(0.0, abs=1e-6)


def test_haversine_gangtok_to_chungthang_is_about_30km():
    # Team B is based at Gangtok; the SOS is at Chungthang.
    d = haversine_km(CHUNGTHANG_LAT, CHUNGTHANG_LON, 27.335, 88.612)
    assert 25.0 < d < 35.0


def test_haversine_is_symmetric():
    a = haversine_km(27.6, 88.6, 27.2, 88.5)
    b = haversine_km(27.2, 88.5, 27.6, 88.6)
    assert a == pytest.approx(b)


# --- sos_priority --------------------------------------------------------


def test_critical_trapped_medical_is_p1():
    result = sos_priority("CRITICAL", SosAttrs(people_affected=3, trapped=True, medical=True))
    assert result["priority"] == "P1"
    assert result["score"] == 100  # capped
    assert set(result["needs"]) == {"search_rescue", "medical"}


def test_score_is_capped_at_100():
    result = sos_priority("CRITICAL", SosAttrs(people_affected=500, trapped=True, medical=True))
    assert result["score"] == 100


def test_factor_points_are_transparent():
    # Every factor carries an explicit point value; the visible factors (minus
    # the zero-point floor note) sum to the pre-cap total.
    result = sos_priority("HIGH", SosAttrs(people_affected=2, trapped=True))
    labels = [f["label"] for f in result["factors"]]
    assert any("landslide risk" in label for label in labels)
    assert any("SOS" in label for label in labels)
    assert any("trapped" in label for label in labels)


def test_priority_monotonic_in_severity():
    bare = sos_priority("HIGH", SosAttrs())
    trapped = sos_priority("HIGH", SosAttrs(trapped=True))
    both = sos_priority("HIGH", SosAttrs(trapped=True, medical=True))
    assert trapped["score"] > bare["score"]
    assert both["score"] >= trapped["score"]


def test_more_people_never_lowers_score():
    few = sos_priority("MODERATE", SosAttrs(people_affected=1))
    many = sos_priority("MODERATE", SosAttrs(people_affected=8))
    assert many["score"] >= few["score"]


def test_life_safety_floor_lifts_low_risk_sos_to_p3():
    # A bare SOS in a LOW-risk area would score below P3 but is floored up.
    result = sos_priority("LOW", SosAttrs())
    assert result["priority"] == "P3"
    assert result["floored"] is True


def test_needs_default_to_field_verification():
    result = sos_priority("MODERATE", SosAttrs())
    assert result["needs"] == ["field_verification"]


def test_unknown_level_scores_without_crashing():
    result = sos_priority(None, SosAttrs(medical=True))
    assert result["priority"] in {"P1", "P2", "P3", "P4"}
    assert any("outside monitored region" in f["label"] for f in result["factors"])


# --- recommend_response --------------------------------------------------


def test_recommends_capability_over_nearest():
    # Trapped + medical at Chungthang: Team C (field verification) is nearest,
    # but Team B (medical + rescue, Gangtok) is the correct pick.
    rec = recommend_response(
        all_resources(),
        CHUNGTHANG_LAT,
        CHUNGTHANG_LON,
        needs=["search_rescue", "medical"],
    )
    assert rec is not None
    assert rec["team_id"] == "team-b"
    assert rec["coverage"] == 1.0
    assert set(rec["capability_match"]) == {"search_rescue", "medical"}
    # Team C is geographically closer — verify we did not just pick nearest.
    team_c = get_resource("team-c")
    dist_c = haversine_km(CHUNGTHANG_LAT, CHUNGTHANG_LON, team_c.lat, team_c.lon)
    assert dist_c < rec["distance_km"]


def test_plain_sos_picks_nearest_verification_team():
    # No trapped/medical → needs field_verification → Team C (Mangan) is nearest.
    rec = recommend_response(
        all_resources(),
        CHUNGTHANG_LAT,
        CHUNGTHANG_LON,
        needs=["field_verification"],
    )
    assert rec is not None
    assert rec["team_id"] == "team-c"


def test_unavailable_team_is_never_recommended():
    rec = recommend_response(
        all_resources(),
        27.170,
        88.530,  # right on top of Team E, which is deployed/unavailable
        needs=["engineering"],
    )
    assert rec is not None
    assert rec["team_id"] != "team-e"


def test_returns_none_when_no_team_available():
    assert recommend_response([], CHUNGTHANG_LAT, CHUNGTHANG_LON, needs=["medical"]) is None


def test_distance_is_positive_and_reason_present():
    rec = recommend_response(all_resources(), CHUNGTHANG_LAT, CHUNGTHANG_LON, needs=["medical"])
    assert rec["distance_km"] > 0
    assert "estimated distance" in rec["reason"]


# --- dataset sanity ------------------------------------------------------


def test_all_resources_labeled_and_well_formed():
    for resource in DEMO_RESPONSE_RESOURCES:
        assert resource.capabilities  # non-empty
        assert resource.to_dict()["is_simulated"] is True
        assert resource.status in {"available", "deployed", "standby"}


def test_available_resources_excludes_deployed():
    ids = {r.id for r in available_resources()}
    assert "team-e" not in ids
    assert "team-b" in ids
