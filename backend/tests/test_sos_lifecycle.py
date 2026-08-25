"""Responder status lifecycle — the deterministic, forward-only state machine.

Deterministic unit tests of the ``update_sos_status`` control flow (no DB, no
TestClient — matching the DB-less style of the rest of the suite). They prove
the state machine and its guards:

- every legal forward step succeeds and stamps a server-side timestamp;
- backwards moves, skips, repeats and moves out of RESOLVED are all rejected;
- an unknown target status is rejected;
- the demo-grade authorization (``X-Responder-Id`` must match the assigned
  ``team_id``) rejects a missing or wrong responder (IDOR protection);
- timestamps are generated on the server — a client-supplied time is ignored.

A live end-to-end walkthrough (assign → acknowledge → … → resolved, persisted in
PostGIS and reflected in the Command Center) is part of the browser runbook.
"""

from __future__ import annotations

from datetime import datetime

import pytest

import app.api.sos as sos
from app.api.sos import StatusIn, update_sos_status
from app.models.field import FieldReportCategory, FieldReportStatus

TEAM = "team-b"  # the responder this incident is assigned to


class FakeReport:
    """Minimal stand-in for a FieldReport row (only what the endpoint touches)."""

    def __init__(self, category, cv):
        self.category = category
        self.cv_classification = cv
        self.status = FieldReportStatus.assigned


class FakeSession:
    """``get`` returns the seeded report (or None); ``commit`` just counts."""

    def __init__(self, report):
        self._report = report
        self.commits = 0

    def get(self, _model, _report_id):
        return self._report

    def commit(self):
        self.commits += 1


@pytest.fixture(autouse=True)
def _stub_feature(monkeypatch):
    """Keep the endpoint off the DB read path: the feature builder just echoes
    the (already-mutated) assignment so tests can assert on the result."""

    monkeypatch.setattr(
        sos,
        "_feature_by_id",
        lambda db, report_id, override: {
            "id": report_id,
            "assignment": db._report.cv_classification.get("assignment"),
        },
    )


def _assignment(status=None, **timestamps):
    a = {"team_id": TEAM, "team_name": "Team B", "kind": "medical",
         "assigned_at": "2026-08-24T06:00:00+00:00"}
    if status is not None:
        a["status"] = status
    a.update(timestamps)
    return a


def _session(assignment=None, category=FieldReportCategory.sos):
    cv = {"sos": {"trapped": True}}
    if assignment is not None:
        cv["assignment"] = assignment
    return FakeSession(FakeReport(category, cv))


def _advance(db, target, responder=TEAM):
    return update_sos_status(1, StatusIn(status=target), x_responder_id=responder, db=db)


# --- happy path: every forward step succeeds & stamps a timestamp --------


@pytest.mark.parametrize(
    "current, target, ts_field",
    [
        ("ASSIGNED", "ACKNOWLEDGED", "acknowledged_at"),
        ("ACKNOWLEDGED", "EN_ROUTE", "en_route_at"),
        ("EN_ROUTE", "ON_SITE", "on_site_at"),
        ("ON_SITE", "RESOLVED", "resolved_at"),
    ],
)
def test_each_valid_forward_transition_succeeds(current, target, ts_field):
    db = _session(_assignment(status=current))
    out = _advance(db, target)

    assert out["assignment"]["status"] == target
    assert db.commits == 1
    # A server-side timestamp was recorded for this transition...
    stamped = out["assignment"][ts_field]
    assert stamped
    parsed = datetime.fromisoformat(stamped)
    assert parsed.tzinfo is not None  # ...and it is timezone-aware (UTC)


def test_full_lifecycle_walk_stamps_each_step():
    db = _session(_assignment(status="ASSIGNED"))
    for target in ("ACKNOWLEDGED", "EN_ROUTE", "ON_SITE", "RESOLVED"):
        _advance(db, target)
    a = db._report.cv_classification["assignment"]
    assert a["status"] == "RESOLVED"
    # Every transition left its own timestamp behind — a complete audit trail.
    for field in ("acknowledged_at", "en_route_at", "on_site_at", "resolved_at"):
        assert a[field]


def test_missing_status_defaults_to_assigned():
    # Legacy assignment (pre-lifecycle) has no "status" — treated as ASSIGNED,
    # so ACKNOWLEDGED is the legal next step.
    db = _session(_assignment())  # no status key
    out = _advance(db, "ACKNOWLEDGED")
    assert out["assignment"]["status"] == "ACKNOWLEDGED"


def test_status_is_case_insensitive():
    db = _session(_assignment(status="ASSIGNED"))
    out = _advance(db, "acknowledged")
    assert out["assignment"]["status"] == "ACKNOWLEDGED"


# --- state-machine guards: everything illegal is rejected ----------------


def _reject(db, target, responder=TEAM) -> int:
    with pytest.raises(sos.HTTPException) as ei:
        _advance(db, target, responder)
    assert db.commits == 0  # a rejected transition never writes
    return ei.value.status_code


def test_backwards_transition_rejected():
    assert _reject(_session(_assignment(status="EN_ROUTE")), "ASSIGNED") == 409
    assert _reject(_session(_assignment(status="ON_SITE")), "ACKNOWLEDGED") == 409


def test_skipped_state_rejected():
    assert _reject(_session(_assignment(status="ASSIGNED")), "EN_ROUTE") == 409
    assert _reject(_session(_assignment(status="ASSIGNED")), "RESOLVED") == 409


def test_repeat_of_current_state_rejected():
    assert _reject(_session(_assignment(status="ACKNOWLEDGED")), "ACKNOWLEDGED") == 409


def test_resolved_cannot_transition_again():
    # RESOLVED is terminal — nothing follows it, in any direction.
    assert _reject(_session(_assignment(status="RESOLVED")), "RESOLVED") == 409
    assert _reject(_session(_assignment(status="RESOLVED")), "ON_SITE") == 409
    assert _reject(_session(_assignment(status="RESOLVED")), "ACKNOWLEDGED") == 409


def test_unknown_status_rejected():
    assert _reject(_session(_assignment(status="ASSIGNED")), "TELEPORTED") == 422
    assert _reject(_session(_assignment(status="ASSIGNED")), "") == 422


# --- authorization / IDOR -----------------------------------------------


def test_missing_responder_identity_rejected():
    db = _session(_assignment(status="ASSIGNED"))
    assert _reject(db, "ACKNOWLEDGED", responder=None) == 401


def test_wrong_responder_rejected():
    # A different team may not advance this incident (IDOR protection).
    db = _session(_assignment(status="ASSIGNED"))
    assert _reject(db, "ACKNOWLEDGED", responder="team-c") == 403


# --- preconditions -------------------------------------------------------


def test_not_found_when_missing_or_not_sos():
    assert _reject(_session(_assignment(status="ASSIGNED"), category=FieldReportCategory.landslide),
                   "ACKNOWLEDGED") == 404
    assert _reject(FakeSession(None), "ACKNOWLEDGED") == 404


def test_no_assignment_yet_rejected():
    # A PENDING incident with no team assigned has no lifecycle to advance.
    assert _reject(_session(assignment=None), "ACKNOWLEDGED") == 409


# --- server-side timestamps (client clock is never trusted) --------------


def test_client_supplied_timestamp_is_ignored():
    # StatusIn has no timestamp field, so a client that tries to smuggle one in
    # is silently ignored; the server stamps its own fresh time.
    db = _session(_assignment(status="ASSIGNED"))
    payload = StatusIn(**{"status": "ACKNOWLEDGED", "acknowledged_at": "1999-01-01T00:00:00+00:00"})
    out = update_sos_status(1, payload, x_responder_id=TEAM, db=db)
    assert out["assignment"]["acknowledged_at"] != "1999-01-01T00:00:00+00:00"
    # And it is a real, recent, timezone-aware server timestamp.
    assert datetime.fromisoformat(out["assignment"]["acknowledged_at"]).year >= 2026
