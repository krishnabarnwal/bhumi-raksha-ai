"""SOS idempotency — the offline-sync guarantee, enforced on the server.

Deterministic unit tests of the ``create_sos`` control flow (no DB, no
TestClient — matching the DB-less style of the rest of the suite). They prove
that re-syncing the same ``client_uuid`` can never create a second incident,
via both paths that enforce it:

1. the pre-insert lookup that returns the existing incident on a repeat, and
2. the unique-constraint race: if a concurrent sync of the same SOS slips past
   the lookup, the second ``INSERT`` raises :class:`IntegrityError`; we roll
   back and return the winner's incident instead of duplicating it.

A live end-to-end idempotency check against PostGIS (two real POSTs, one
incident) is part of the browser/API verification runbook.
"""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

import app.api.sos as sos
from app.api.sos import SosIn, create_sos


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeSession:
    """Minimal stand-in for a SQLAlchemy Session.

    ``execute`` pops the next pre-seeded scalar result (the ``client_uuid``
    lookup); ``commit`` raises the pre-seeded exception once, to simulate the
    unique-constraint race, then succeeds.
    """

    def __init__(self, scalars=(), commit_error=None):
        self._scalars = list(scalars)
        self._commit_error = commit_error
        self.added: list = []
        self.commits = 0
        self.rollbacks = 0
        self.refreshed: list = []

    def execute(self, *_a, **_k):
        return _Result(self._scalars.pop(0) if self._scalars else None)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        if self._commit_error is not None:
            err, self._commit_error = self._commit_error, None  # fail once
            raise err
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, obj):
        obj.id = 555
        self.refreshed.append(obj)


@pytest.fixture(autouse=True)
def _stub_triage(monkeypatch):
    """Keep create_sos off the DB: stub the risk/triage compute and the feature
    builder so we exercise only the idempotency control flow."""

    monkeypatch.setattr(
        sos,
        "_compute_triage",
        lambda db, lat, lon, attrs, override: {"triage": {"priority": "P2"}},
    )
    monkeypatch.setattr(
        sos,
        "_feature_by_id",
        lambda db, report_id, override: {"feature_for_id": report_id},
    )


def _payload(uuid="evt-1"):
    return SosIn(lat=27.6, lon=88.64, trapped=True, client_uuid=uuid)


def _integrity_error():
    return IntegrityError("duplicate client_uuid", None, Exception("unique violation"))


def test_repeat_uuid_returns_existing_without_insert():
    # The pre-insert lookup finds an existing incident (id=42) for this uuid.
    db = FakeSession(scalars=[42])
    out = create_sos(_payload("evt-1"), db=db)
    assert out == {"feature_for_id": 42}
    assert db.added == []  # nothing inserted
    assert db.commits == 0  # nothing committed — a true idempotent no-op


def test_new_uuid_inserts_exactly_once():
    db = FakeSession(scalars=[None])  # no existing row for this uuid
    out = create_sos(_payload("evt-new"), db=db)
    assert out == {"feature_for_id": 555}  # id assigned by refresh
    assert len(db.added) == 1
    assert db.commits == 1
    assert db.rollbacks == 0


def test_integrity_race_rolls_back_and_returns_winner():
    # Lookup #1 (pre-insert) -> None, so we attempt the insert; commit hits the
    # unique constraint (a concurrent sync won); lookup #2 (post-rollback) -> 77.
    db = FakeSession(scalars=[None, 77], commit_error=_integrity_error())
    out = create_sos(_payload("evt-race"), db=db)
    assert out == {"feature_for_id": 77}  # the winner's incident, not a new one
    assert db.rollbacks == 1
    assert db.commits == 0  # the only commit attempt failed
    assert len(db.added) == 1  # tried once; no duplicate incident created


def test_integrity_error_without_uuid_reraises():
    # A genuine integrity failure with no client_uuid to reconcile must not be
    # swallowed — there is no existing incident to return.
    db = FakeSession(commit_error=_integrity_error())
    with pytest.raises(IntegrityError):
        create_sos(SosIn(lat=27.6, lon=88.64), db=db)
    assert db.rollbacks == 1
