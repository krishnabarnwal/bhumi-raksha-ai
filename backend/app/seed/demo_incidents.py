"""Seed a clean, predictable set of DEMO/SIMULATED SOS + hazard incidents.

This stages the command-center board for a live demo so the RISK → SOS →
PRIORITY → RESPONSE → LIFECYCLE story is visible the moment the app loads. It is
a thin companion to :mod:`app.seed.seed_sikkim` (which owns the risk *geography*
— districts / zones / villages / roads / infrastructure / history); this module
owns only a handful of ``field_reports`` rows and **never touches the geography
tables**.

Run after the geography is seeded (``python -m app.seed.seed_sikkim``)::

    python -m app.seed.demo_incidents            # additive: create A–E if absent
    python -m app.seed.demo_incidents --reset    # clear ONLY these demo rows, reseed
    python -m app.seed.demo_incidents --purge     # clear ALL field_reports, then seed

Safety / honesty (rules §5, §9, §18):
- Every incident is **synthetic** — placed over real Sikkim coordinates but
  clearly marked: each row carries a ``demo_seed`` tag in ``cv_classification``
  and a ``demo-incident-*`` ``client_uuid``, and each description is prefixed
  ``[DEMO]``. The SOS read path already returns ``is_simulated: True`` and labels
  the response-routing layer SIMULATED; nothing here claims a real NDRF / SDRF /
  NGO / ambulance / government dispatch.
- ``--reset`` deletes **only** rows this script created (matched by the
  ``demo-incident-*`` client_uuid), so re-running is a safe, surgical clean slate
  that cannot remove a real citizen submission.
- ``--purge`` is the louder, explicit one-time cleanup of accumulated ad-hoc
  test rows: it deletes **all** ``field_reports`` (printing their ids first) and
  is scoped to that table alone — it is a local CLI action, never an endpoint.

Team assignments are computed with the real :func:`recommend_response` triage
logic, so a seeded incident is assigned exactly the team the system itself would
recommend — no fabricated routing.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from app.core.db import get_sessionmaker
from app.models.field import FieldReport, FieldReportCategory, FieldReportStatus, MediaAsset
from app.models.geo import District
from app.services.response_resources import available_resources
from app.services.sos_triage import SosAttrs, recommend_response, sos_priority

# Marker prefix shared by every row this script owns (used for a surgical reset).
DEMO_UUID_PREFIX = "demo-incident-"

# Responder lifecycle — mirrors app.api.sos (kept local so the seed has no
# dependency on the API router). Forward-only; each transition stamps one ts.
_RESPONDER_FLOW = ["ASSIGNED", "ACKNOWLEDGED", "EN_ROUTE", "ON_SITE", "RESOLVED"]
_STATUS_TS_FIELD = {
    "ACKNOWLEDGED": "acknowledged_at",
    "EN_ROUTE": "en_route_at",
    "ON_SITE": "on_site_at",
    "RESOLVED": "resolved_at",
}
_SEVERITY_BY_PRIORITY = {"P1": "critical", "P2": "high", "P3": "medium", "P4": "low"}


# --- demo incident definitions -----------------------------------------------
#
# Coordinates are real Sikkim towns already covered by the seeded risk zones, so
# each incident inherits a real computed risk level:
#   Chungthang CRITICAL · Mangan/Dikchu/Gangtok HIGH · Singtam HIGH/MODERATE.
# Attributes are chosen to land a spread of priority tiers and lifecycle states.

# key, letter, lon, lat, people, trapped, medical, lifecycle_status, minutes_ago, description
_SOS_INCIDENTS = [
    (
        "a", "A", 88.640, 27.600, 4, True, True, None, 4,
        "Family trapped after a slope collapse near the highway — need rescue and medical help.",
    ),
    (
        "b", "B", 88.530, 27.510, 3, False, True, "ACKNOWLEDGED", 25,
        "Elderly resident injured, road partly blocked by debris — medical assistance requested.",
    ),
    (
        "c", "C", 88.500, 27.232, 1, False, False, "EN_ROUTE", 55,
        "Fresh cracks and slumping above the road — requesting a field team to verify conditions.",
    ),
    (
        "d", "D", 88.612, 27.335, 2, False, True, "RESOLVED", 130,
        "Two people hurt by falling rocks on a hill road — casualties treated on site.",
    ),
]

# A HIGH-severity non-SOS hazard report (shows on the field-reports layer).
# key, letter, lon, lat, category, severity, minutes_ago, description
_HAZARD_INCIDENT = (
    "e", "E", 88.512, 27.420, FieldReportCategory.landslide, "high", 40,
    "Large debris slide has narrowed the road; loose boulders still coming down.",
)


def _uuid(key: str) -> str:
    return f"{DEMO_UUID_PREFIX}{key}"


def _needs_for(attrs: SosAttrs) -> list[str]:
    """The incident's response needs (independent of risk level)."""

    return sos_priority(None, attrs)["needs"]


def _priority_letter_severity(attrs: SosAttrs) -> str:
    """A stored severity for the raw row (the read path recomputes anyway)."""

    return _SEVERITY_BY_PRIORITY[sos_priority(None, attrs)["priority"]]


def _build_assignment(lon: float, lat: float, attrs: SosAttrs, status: str, created: datetime) -> dict:
    """Assign the *recommended* team and stamp the lifecycle up to ``status``.

    Timestamps are back-dated relative to ``created`` so the timeline reads like
    a real, progressing response (monotonic, all in the past).
    """

    needs = _needs_for(attrs)
    rec = recommend_response(available_resources(), lat, lon, needs)
    # Fall back defensively to a field-verification team if nothing matched.
    team_id = rec["team_id"] if rec else "team-c"
    team_name = rec["team_name"] if rec else "Team C · Field Verification"
    team_kind = rec["kind"] if rec else "Field Verification"

    # Minutes-after-created for each transition (only those up to `status` apply).
    offsets = {"ACKNOWLEDGED": 4, "EN_ROUTE": 12, "ON_SITE": 35, "RESOLVED": 70}

    assignment = {
        "team_id": team_id,
        "team_name": team_name,
        "kind": team_kind,
        "status": status,
        "assigned_at": (created + timedelta(minutes=2)).isoformat(),
    }
    reached = _RESPONDER_FLOW[: _RESPONDER_FLOW.index(status) + 1]
    for step in reached:
        if step in _STATUS_TS_FIELD:
            assignment[_STATUS_TS_FIELD[step]] = (
                created + timedelta(minutes=offsets[step])
            ).isoformat()
    return assignment


def _existing_demo_ids(session) -> list[int]:
    return list(
        session.scalars(
            select(FieldReport.id).where(
                FieldReport.client_uuid.like(f"{DEMO_UUID_PREFIX}%")
            )
        )
    )


def _delete_demo(session) -> None:
    """Surgical reset: remove ONLY the rows this script created."""

    ids = _existing_demo_ids(session)
    if ids:
        # Remove child media first (FK), though seeded demo rows carry none.
        session.execute(delete(MediaAsset).where(MediaAsset.field_report_id.in_(ids)))
        session.execute(delete(FieldReport).where(FieldReport.id.in_(ids)))
    session.commit()
    print(f"Reset: cleared {len(ids)} demo incident row(s) {ids or ''}".rstrip())


def _purge_all_field_reports(session) -> None:
    """Loud cleanup: remove ALL field_reports (SOS + hazards). Scoped to that
    table (+ its media_assets children) only — geography is never touched."""

    ids = list(session.scalars(select(FieldReport.id)))
    if not ids:
        print("Purge: no field reports to remove.")
        return
    # Child rows first to satisfy the media_assets → field_reports foreign key.
    session.execute(delete(MediaAsset))
    session.execute(delete(FieldReport))
    session.commit()
    print(f"Purge: deleted {len(ids)} field report row(s): {ids}")


def _create_sos(session, spec, now: datetime) -> None:
    key, letter, lon, lat, people, trapped, medical, status, mins, desc = spec
    client_uuid = _uuid(key)
    if session.scalar(select(FieldReport.id).where(FieldReport.client_uuid == client_uuid)):
        print(f"  · SOS {letter} ({client_uuid}) already present — skipping.")
        return

    attrs = SosAttrs(people_affected=people, trapped=trapped, medical=medical)
    created = now - timedelta(minutes=mins)
    cv: dict = {
        "sos": {"people_affected": people, "trapped": trapped, "medical": medical},
        "source": "CITIZEN",
        "demo_seed": letter,
    }
    if status is not None:
        cv["assignment"] = _build_assignment(lon, lat, attrs, status, created)
        row_status = FieldReportStatus.assigned
    else:
        row_status = FieldReportStatus.pending

    session.add(
        FieldReport(
            category=FieldReportCategory.sos,
            description=f"[DEMO] {desc}",
            severity=_priority_letter_severity(attrs),
            reporter_type="citizen",
            status=row_status,
            client_uuid=client_uuid,
            cv_classification=cv,
            created_at=created,
            geom=func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
        )
    )
    label = status or "PENDING (unassigned)"
    print(f"  · SOS {letter}: {label} @ ({lon}, {lat})")


def _create_hazard(session, now: datetime) -> None:
    key, letter, lon, lat, category, severity, mins, desc = _HAZARD_INCIDENT
    client_uuid = _uuid(key)
    if session.scalar(select(FieldReport.id).where(FieldReport.client_uuid == client_uuid)):
        print(f"  · Hazard {letter} ({client_uuid}) already present — skipping.")
        return

    session.add(
        FieldReport(
            category=category,
            description=f"[DEMO] {desc}",
            severity=severity,
            reporter_type="citizen",
            status=FieldReportStatus.under_review,
            client_uuid=client_uuid,
            cv_classification={"demo_seed": letter},
            created_at=now - timedelta(minutes=mins),
            geom=func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
        )
    )
    print(f"  · Hazard {letter}: {category.value} / {severity} @ ({lon}, {lat})")


def seed(reset: bool = False, purge: bool = False) -> None:
    Session = get_sessionmaker()
    now = datetime.now(timezone.utc)

    with Session() as session:
        # Guard: the risk geography must exist so incidents inherit real levels.
        districts = session.scalar(
            select(func.count()).select_from(District).where(District.state == "Sikkim")
        )
        if not districts:
            print(
                "No Sikkim geography found — seed it first:\n"
                "    python -m app.seed.seed_sikkim",
                file=sys.stderr,
            )
            raise SystemExit(1)

        if purge:
            _purge_all_field_reports(session)
        elif reset:
            _delete_demo(session)

        print("Seeding DEMO/SIMULATED incidents:")
        for spec in _SOS_INCIDENTS:
            _create_sos(session, spec, now)
        _create_hazard(session, now)
        session.commit()

    print(
        "Done. Board: 1 CRITICAL unassigned SOS (A), 1 acknowledged (B), "
        "1 en-route (C), 1 resolved (D), 1 HIGH hazard report (E). "
        "All synthetic — labeled DEMO/SIMULATED."
    )


def main() -> None:
    argv = sys.argv[1:]
    reset = "--reset" in argv
    purge = "--purge" in argv
    try:
        seed(reset=reset, purge=purge)
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover - operator feedback path
        print(f"Demo seed failed: {exc}", file=sys.stderr)
        print(
            "Ensure the database is up and migrated (`alembic upgrade head`) and "
            "the Sikkim geography is seeded (`python -m app.seed.seed_sikkim`).",
            file=sys.stderr,
        )
        raise


if __name__ == "__main__":
    main()
