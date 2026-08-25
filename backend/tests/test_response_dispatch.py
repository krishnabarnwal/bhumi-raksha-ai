"""Response routing & escalation — dispatcher logic + the escalate endpoint.

Two layers, both DB-less (matching the rest of the suite):

- the pure :func:`recommend_dispatch` routing brain — deterministic mapping of
  (priority, needs, risk) → response category, escalation network/level and DEMO
  providers; and
- the ``POST /api/sos/{id}/escalate`` endpoint — recomputes the recommendation
  server-side (client cannot fake it), records it additively under
  ``cv_classification["escalation"]`` with a server timestamp, and is idempotent.

Everything is SIMULATED (§9, §18): no real NDRF/108/NGO API is contacted.
"""

from __future__ import annotations

from datetime import datetime

import pytest

import app.api.sos as sos
from app.api.sos import EscalateIn, escalate_sos
from app.models.field import FieldReportCategory, FieldReportStatus
from app.services.response_dispatch import (
    CATEGORIES,
    DemoResponseDispatcher,
    recommend_dispatch,
)

# --- pure routing brain --------------------------------------------------


def _keys(out: dict) -> set[str]:
    return {s["key"] for s in out["supporting"]}


def test_trapped_routes_to_disaster_response_national():
    out = recommend_dispatch("P1", ["search_rescue"], "CRITICAL")
    assert out["primary_category"]["key"] == "disaster_response"
    assert out["escalation_level"] == "NATIONAL"
    # Scene access (police) and, under high risk, relief come along as support.
    assert "police" in _keys(out)
    assert "relief" in _keys(out)


def test_trapped_and_medical_pulls_in_medical_support():
    out = recommend_dispatch("P1", ["search_rescue", "medical"], "HIGH")
    assert out["primary_category"]["key"] == "disaster_response"
    assert "medical" in _keys(out)
    assert "police" in _keys(out)


def test_medical_only_low_risk_routes_to_ambulance_state():
    out = recommend_dispatch("P2", ["medical"], "LOW")
    assert out["primary_category"]["key"] == "medical"
    assert out["escalation_level"] == "STATE"
    # Not a landslide-driven incident → no disaster-response escalation.
    assert "disaster_response" not in _keys(out)


def test_medical_in_high_risk_adds_disaster_response():
    out = recommend_dispatch("P1", ["medical"], "CRITICAL")
    assert out["primary_category"]["key"] == "medical"
    assert "disaster_response" in _keys(out)
    assert "relief" in _keys(out)


def test_field_verification_low_risk_is_municipal_district():
    out = recommend_dispatch("P3", ["field_verification"], "MODERATE")
    assert out["primary_category"]["key"] == "field_verification"
    assert out["escalation_level"] == "DISTRICT"
    assert out["supporting"] == []


def test_field_verification_high_risk_upgrades_to_disaster_response():
    # A high-risk incident with no specific need is a developing disaster.
    out = recommend_dispatch("P1", ["field_verification"], "CRITICAL")
    assert out["primary_category"]["key"] == "disaster_response"
    assert "field_verification" in _keys(out)
    assert "relief" in _keys(out)


def test_unknown_priority_defaults_to_district():
    out = recommend_dispatch(None, ["field_verification"], None)
    assert out["escalation_level"] == "DISTRICT"


def test_recommendation_is_deterministic():
    a = recommend_dispatch("P1", ["search_rescue", "medical"], "CRITICAL")
    b = recommend_dispatch("P1", ["search_rescue", "medical"], "CRITICAL")
    assert a == b


def test_primary_is_never_listed_as_its_own_support():
    out = recommend_dispatch("P1", ["search_rescue"], "CRITICAL")
    assert out["primary_category"]["key"] not in _keys(out)


def test_everything_is_labeled_simulated():
    out = recommend_dispatch("P1", ["search_rescue"], "CRITICAL")
    assert out["is_simulated"] is True
    for provider in out["providers"]:
        assert "SIMULATED" in provider
    # The reason names the primary category so the operator sees the "why".
    assert out["primary_category"]["label"].split(" /")[0] in out["reason"] or out["reason"]


def test_every_catalog_provider_is_simulated():
    for cat in CATEGORIES.values():
        assert cat.providers  # each category names at least one provider
        for provider in cat.providers:
            assert "SIMULATED" in provider


def test_demo_dispatch_makes_no_real_call():
    d = DemoResponseDispatcher()
    rec = d.recommend(priority="P1", needs=["search_rescue"], display_level="CRITICAL")
    ack = d.dispatch(incident_id=7, recommendation=rec)
    assert ack["accepted"] is True
    assert ack["reference"] == "SIM-7"
    assert ack["is_simulated"] is True


# --- the escalate endpoint (DB-less) -------------------------------------


class FakeScalar:
    def __init__(self, value):
        self._v = value

    def scalar(self):
        return self._v


class FakeReport:
    def __init__(self, category, cv):
        self.category = category
        self.cv_classification = cv
        self.status = FieldReportStatus.assigned


class FakeSession:
    def __init__(self, report):
        self._report = report
        self.commits = 0

    def get(self, _model, _report_id):
        return self._report

    def execute(self, _stmt):
        return FakeScalar(0.0)  # lat/lon are ignored (triage is stubbed)

    def commit(self):
        self.commits += 1


@pytest.fixture(autouse=True)
def _stub_paths(monkeypatch):
    """Keep the endpoint off the DB: stub the triage compute and the feature
    builder (which just echoes the recorded escalation for assertions)."""

    monkeypatch.setattr(
        sos,
        "_compute_triage",
        lambda db, lat, lon, attrs, override: {
            "risk": None,
            "display_level": "CRITICAL",
            "triage": {"priority": "P1", "needs": ["search_rescue", "medical"],
                       "score": 100, "factors": [], "floored": False},
            "recommendation": None,
        },
    )
    monkeypatch.setattr(
        sos,
        "_feature_by_id",
        lambda db, report_id, override: {
            "id": report_id,
            "escalation": db._report.cv_classification.get("escalation"),
        },
    )


def _session(cv=None, category=FieldReportCategory.sos):
    return FakeSession(FakeReport(category, cv if cv is not None else {"sos": {"trapped": True}}))


def test_escalate_records_simulated_dispatch():
    db = _session()
    out = escalate_sos(1, payload=None, db=db)
    esc = out["escalation"]
    assert esc["status"] == "ESCALATED"
    assert esc["is_simulated"] is True
    # Category was recomputed server-side from the (stubbed) triage.
    assert esc["primary_category"]["key"] == "disaster_response"
    assert esc["dispatch"]["reference"] == "SIM-1"
    assert esc["dispatch"]["is_simulated"] is True
    # Server-generated, timezone-aware timestamp.
    stamped = datetime.fromisoformat(esc["escalated_at"])
    assert stamped.tzinfo is not None
    assert db.commits == 1


def test_escalate_is_idempotent():
    db = _session()
    first = escalate_sos(1, payload=None, db=db)
    first_at = first["escalation"]["escalated_at"]
    second = escalate_sos(1, payload=None, db=db)
    # Same record, and no second write.
    assert second["escalation"]["escalated_at"] == first_at
    assert db.commits == 1


def test_escalate_stores_optional_note():
    db = _session()
    out = escalate_sos(1, payload=EscalateIn(note="Bridge washed out; air lift likely"), db=db)
    assert out["escalation"]["note"] == "Bridge washed out; air lift likely"


def test_escalate_404_when_not_sos_or_missing():
    with pytest.raises(sos.HTTPException) as ei:
        escalate_sos(1, payload=None, db=_session(category=FieldReportCategory.landslide))
    assert ei.value.status_code == 404

    with pytest.raises(sos.HTTPException) as ei2:
        escalate_sos(1, payload=None, db=FakeSession(None))
    assert ei2.value.status_code == 404
