"""Emergency SOS — citizen distress signals, triage and response coordination.

This is the command-center side of the RISK → WARNING → **SOS → INCIDENT →
PRIORITY → RESPONSE** loop:

- ``POST /api/sos``                  citizen raises an SOS (lat/lon → POINT); the
                                     response includes the computed priority and
                                     recommended team.
- ``GET  /api/sos``                  all SOS incidents as a GeoJSON
                                     FeatureCollection, each with live risk,
                                     priority and recommendation.
- ``POST /api/sos/{id}/assign``      command center assigns a team (PENDING →
                                     ASSIGNED).
- ``GET  /api/risk-at``              risk at an arbitrary lon/lat (citizen safety
                                     status + alert).
- ``GET  /api/response-resources``   the DEMO response teams.

Design notes:
- An SOS is stored as a :class:`FieldReport` with ``category=sos`` — no new
  table, no migration. The optional structured attributes (people affected,
  trapped, medical) and the assignment live in the spare, nullable
  ``cv_classification`` JSONB column, namespaced under ``"sos"`` / ``"assignment"``.
- Priority and the response recommendation are **recomputed on read** via the
  pure :mod:`app.services.sos_triage` functions and the shared
  :func:`app.services.risk_state.zone_result` compute path, so the map, the
  panel and the priority never disagree and nothing is persisted mid-demo.
- All teams/data are DEMO/SIMULATED (§18); distances are haversine **estimated
  distances**, never faked ETAs (§5); priority is deterministic and explainable,
  not an ML/LLM output (§10).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.field import FieldReport, FieldReportCategory, FieldReportStatus
from app.services.geojson import make_feature, make_feature_collection
from app.services.response_dispatch import get_dispatcher
from app.services.response_resources import (
    all_resources,
    available_resources,
    get_resource,
)
from app.services.risk_state import (
    resolve_override,
    scenario_label,
    zone_at_point,
    zone_result,
)
from app.services.sos_triage import SosAttrs, recommend_response, sos_priority

router = APIRouter(prefix="/api", tags=["sos"])

# Incident severity mirrors the computed priority tier (shown in the panel).
SEVERITY_BY_PRIORITY = {"P1": "critical", "P2": "high", "P3": "medium", "P4": "low"}

# Citizen-facing safety copy, by risk display level.
_SAFETY = {
    "danger": (
        "High landslide risk near your location. Avoid slopes, road cuttings and "
        "riverbanks; move to stable open ground and follow local authority advice."
    ),
    "caution": (
        "Moderate landslide risk. Stay alert to changing conditions and avoid "
        "steep, water-logged slopes."
    ),
    "safe": "Low landslide risk at your location right now. Stay aware during heavy rain.",
    "unknown": (
        "This location is outside the monitored demo region (Sikkim). No landslide "
        "risk data is available here."
    ),
}


# --- request models ------------------------------------------------------


class SosIn(BaseModel):
    """Citizen SOS payload. Only lat/lon are required — an SOS must work even if
    the optional fields are unavailable."""

    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    people_affected: int | None = Field(None, ge=0, le=100000)
    trapped: bool = False
    medical: bool = False
    description: str | None = Field(None, max_length=2000)
    client_uuid: str | None = Field(
        None, max_length=64, description="client id for idempotent (offline) sync"
    )


class AssignIn(BaseModel):
    """Assign a team to an SOS. If ``team_id`` is omitted the recommended team is used."""

    team_id: str | None = Field(None, max_length=40)


# --- responder status lifecycle ------------------------------------------
#
# Once a team is assigned, the incident walks a deterministic, forward-only
# lifecycle. The state lives inside the existing ``assignment`` JSONB (no new
# table, no migration): ``assignment["status"]`` plus one server-stamped
# timestamp per transition. The DB row's ``status`` stays ``assigned`` the whole
# time — the lifecycle is a property of the assignment, not the incident record.

RESPONDER_FLOW = ["ASSIGNED", "ACKNOWLEDGED", "EN_ROUTE", "ON_SITE", "RESOLVED"]
# The single legal successor of each state (forward-only, no skips).
_NEXT_STATUS = {a: b for a, b in zip(RESPONDER_FLOW, RESPONDER_FLOW[1:])}
# Where each transition records its server-generated timestamp.
_STATUS_TS_FIELD = {
    "ACKNOWLEDGED": "acknowledged_at",
    "EN_ROUTE": "en_route_at",
    "ON_SITE": "on_site_at",
    "RESOLVED": "resolved_at",
}


class StatusIn(BaseModel):
    """Advance an assigned incident to the next responder status."""

    status: str = Field(..., max_length=32, description="target responder status")


class EscalateIn(BaseModel):
    """Escalate an incident to the wider response network (command-center action)."""

    note: str | None = Field(None, max_length=500)



# --- shared compute + feature builder ------------------------------------


def _sos_select():
    return select(
        FieldReport.id,
        FieldReport.status,
        FieldReport.description,
        FieldReport.reporter_type,
        FieldReport.severity,
        FieldReport.created_at,
        FieldReport.cv_classification,
        func.ST_X(FieldReport.geom).label("lon"),
        func.ST_Y(FieldReport.geom).label("lat"),
    ).where(FieldReport.category == FieldReportCategory.sos)


def _compute_triage(
    db: Session, lat: float | None, lon: float | None, attrs: SosAttrs, override: float | None
) -> dict:
    """Risk at the point + priority + response recommendation (single compute path)."""

    risk_dict: dict | None = None
    display_level: str | None = None
    if lat is not None and lon is not None:
        zone = zone_at_point(db, lon, lat)
        if zone is not None:
            result = zone_result(db, zone["zone_id"], override)
            risk_dict = result.to_dict()
            risk_dict["zone_id"] = zone["zone_id"]
            risk_dict["zone_name"] = zone["zone_name"]
            risk_dict["in_region"] = zone["in_region"]
            risk_dict["distance_km"] = zone["distance_km"]
            # Only trust a level for scoring when the point is inside the region.
            if zone["in_region"]:
                display_level = result.display_level

    triage = sos_priority(display_level, attrs)
    recommendation = None
    if lat is not None and lon is not None:
        recommendation = recommend_response(
            available_resources(), lat, lon, triage["needs"], triage["priority"]
        )
    return {"risk": risk_dict, "display_level": display_level, "triage": triage,
            "recommendation": recommendation}


def _attrs_from_cv(cv: dict | None) -> SosAttrs:
    sos = (cv or {}).get("sos") or {}
    return SosAttrs(
        people_affected=int(sos.get("people_affected") or 0),
        trapped=bool(sos.get("trapped")),
        medical=bool(sos.get("medical")),
    )


def _build_sos_feature(db: Session, row, override: float | None) -> dict:
    cv = row["cv_classification"] or {}
    attrs = _attrs_from_cv(cv)
    lat, lon = row["lat"], row["lon"]

    computed = _compute_triage(db, lat, lon, attrs, override)
    triage = computed["triage"]
    assignment = cv.get("assignment")
    # Response routing is advice computed on read (persists nothing); the
    # escalation record, if any, is the operator's recorded hand-off.
    response_routing = get_dispatcher().recommend(
        priority=triage["priority"],
        needs=triage["needs"],
        display_level=computed["display_level"],
    )

    props = {
        "id": row["id"],
        "category": "sos",
        "status": row["status"],
        "created_at": row["created_at"],
        "reporter_type": row["reporter_type"],
        "description": row["description"],
        "source": cv.get("source", "CITIZEN"),
        "people_affected": attrs.people_affected,
        "trapped": attrs.trapped,
        "medical": attrs.medical,
        "severity": SEVERITY_BY_PRIORITY[triage["priority"]],
        "priority": triage["priority"],
        "priority_score": triage["score"],
        "priority_factors": triage["factors"],
        "priority_floored": triage["floored"],
        "needs": triage["needs"],
        "risk": computed["risk"],
        "recommendation": computed["recommendation"],
        "response_routing": response_routing,
        "escalation": cv.get("escalation"),
        "assignment": assignment,
        "lat": lat,
        "lon": lon,
        "is_simulated": True,
    }
    geometry = (
        {"type": "Point", "coordinates": [lon, lat]}
        if lat is not None and lon is not None
        else None
    )
    return make_feature(geometry, props, row["id"])


def _feature_by_id(db: Session, report_id: int, override: float | None) -> dict | None:
    row = db.execute(_sos_select().where(FieldReport.id == report_id)).mappings().first()
    return _build_sos_feature(db, row, override) if row is not None else None


# --- endpoints -----------------------------------------------------------


@router.get("/response-resources")
def list_response_resources() -> dict:
    """The DEMO response teams (SIMULATED — not real NDRF/SDRF/NGO units)."""

    resources = [r.to_dict() for r in all_resources()]
    return {
        "count": len(resources),
        "available": sum(1 for r in resources if r["available"]),
        "resources": resources,
        "disclaimer": "DEMO / SIMULATED response resources — not real NDRF/SDRF/NGO units.",
    }


@router.get("/risk-at")
def risk_at(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    scenario: str | None = Query(None, description="normal | heavy | extreme"),
    rainfall_24h: float | None = Query(None, ge=0, description="override 24h rainfall (mm)"),
    db: Session = Depends(get_db),
) -> dict:
    """Risk at an arbitrary point — powers the citizen safety status and alert."""

    override = resolve_override(scenario, rainfall_24h)
    zone = zone_at_point(db, lon, lat)
    if zone is None:
        raise HTTPException(status_code=404, detail="No risk zones loaded")

    result = zone_result(db, zone["zone_id"], override)
    data = result.to_dict()
    data.update(
        {
            "zone_id": zone["zone_id"],
            "zone_name": zone["zone_name"],
            "in_region": zone["in_region"],
            "distance_km": zone["distance_km"],
            "scenario": scenario_label(scenario, rainfall_24h),
            "lat": lat,
            "lon": lon,
            "safety": _safety_summary(result.display_level, zone["in_region"]),
        }
    )
    return data


def _safety_summary(display_level: str, in_region: bool) -> dict:
    if not in_region:
        status = "unknown"
    elif display_level in ("HIGH", "CRITICAL"):
        status = "danger"
    elif display_level == "MODERATE":
        status = "caution"
    else:
        status = "safe"
    headline = {
        "danger": "Landslide warning for your area",
        "caution": "Stay alert — moderate risk",
        "safe": "You are in a lower-risk area",
        "unknown": "Outside monitored region",
    }[status]
    return {"status": status, "headline": headline, "instruction": _SAFETY[status]}


@router.get("/sos")
def list_sos(
    scenario: str | None = Query(None, description="normal | heavy | extreme"),
    rainfall_24h: float | None = Query(None, ge=0, description="override 24h rainfall (mm)"),
    db: Session = Depends(get_db),
) -> dict:
    """All SOS incidents as a GeoJSON FeatureCollection (newest first)."""

    override = resolve_override(scenario, rainfall_24h)
    rows = db.execute(
        _sos_select().order_by(FieldReport.created_at.desc(), FieldReport.id.desc())
    ).mappings().all()
    features = [_build_sos_feature(db, row, override) for row in rows]
    fc = make_feature_collection(features)
    fc["count"] = len(features)
    fc["scenario"] = scenario_label(scenario, rainfall_24h)
    return fc


@router.post("/sos", status_code=201)
def create_sos(payload: SosIn, db: Session = Depends(get_db)) -> dict:
    """Raise a citizen SOS; returns the incident as a GeoJSON Feature with triage.

    **Idempotent on ``client_uuid``** so an offline client can safely re-sync a
    queued SOS any number of times without creating duplicate incidents. This is
    enforced on the server, not trusted from the client, at two layers:

    1. a pre-insert lookup that returns the existing incident on a repeat, and
    2. the ``field_reports.client_uuid`` **unique constraint** as the source of
       truth — if two syncs of the same SOS race past the lookup, the second
       ``INSERT`` raises :class:`IntegrityError`; we roll back and return the
       row the winner created. Same event id in, same incident out — never a
       500, never a duplicate.
    """

    def _existing_id() -> int | None:
        if not payload.client_uuid:
            return None
        return db.execute(
            select(FieldReport.id).where(FieldReport.client_uuid == payload.client_uuid)
        ).scalar_one_or_none()

    existing = _existing_id()
    if existing is not None:
        return _feature_by_id(db, existing, None)  # type: ignore[return-value]

    attrs = SosAttrs(
        people_affected=payload.people_affected or 0,
        trapped=payload.trapped,
        medical=payload.medical,
    )
    # Persist an initial severity from the priority computed under current
    # conditions (the read path recomputes, so this only seeds the raw row).
    computed = _compute_triage(db, payload.lat, payload.lon, attrs, None)
    severity = SEVERITY_BY_PRIORITY[computed["triage"]["priority"]]

    cv = {
        "sos": {
            "people_affected": attrs.people_affected,
            "trapped": attrs.trapped,
            "medical": attrs.medical,
        },
        "source": "CITIZEN",
    }
    report = FieldReport(
        category=FieldReportCategory.sos,
        description=payload.description,
        severity=severity,
        reporter_type="citizen",
        status=FieldReportStatus.pending,
        client_uuid=payload.client_uuid,
        cv_classification=cv,
        geom=func.ST_SetSRID(func.ST_MakePoint(payload.lon, payload.lat), 4326),
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent sync of the same client_uuid won the race and the unique
        # constraint rejected this insert. Return the incident that now exists
        # so the retry stays idempotent.
        db.rollback()
        existing = _existing_id()
        if existing is not None:
            return _feature_by_id(db, existing, None)  # type: ignore[return-value]
        raise
    db.refresh(report)
    return _feature_by_id(db, report.id, None)  # type: ignore[return-value]


@router.post("/sos/{report_id}/assign")
def assign_sos(report_id: int, payload: AssignIn, db: Session = Depends(get_db)) -> dict:
    """Assign a response team to an SOS incident (PENDING → ASSIGNED)."""

    report = db.get(FieldReport, report_id)
    if report is None or report.category != FieldReportCategory.sos:
        raise HTTPException(status_code=404, detail="SOS incident not found")

    if payload.team_id:
        team = get_resource(payload.team_id)
        if team is None:
            raise HTTPException(status_code=400, detail=f"Unknown team '{payload.team_id}'")
    else:
        # No team specified → assign the recommended one.
        lon = db.execute(select(func.ST_X(FieldReport.geom)).where(FieldReport.id == report_id)).scalar()
        lat = db.execute(select(func.ST_Y(FieldReport.geom)).where(FieldReport.id == report_id)).scalar()
        attrs = _attrs_from_cv(report.cv_classification)
        recommendation = _compute_triage(db, lat, lon, attrs, None)["recommendation"]
        if recommendation is None:
            raise HTTPException(status_code=409, detail="No response team available to assign")
        team = get_resource(recommendation["team_id"])

    # Reassign a fresh dict so SQLAlchemy tracks the JSONB change.
    cv = dict(report.cv_classification or {})
    cv["assignment"] = {
        "team_id": team.id,
        "team_name": team.name,
        "kind": team.kind,
        "status": "ASSIGNED",  # entry point of the responder lifecycle
        "assigned_at": datetime.now(timezone.utc).isoformat(),
    }
    report.cv_classification = cv
    report.status = FieldReportStatus.assigned
    db.commit()

    return _feature_by_id(db, report_id, None)  # type: ignore[return-value]


@router.patch("/sos/{report_id}/status")
def update_sos_status(
    report_id: int,
    payload: StatusIn,
    x_responder_id: str | None = Header(None, alias="X-Responder-Id"),
    db: Session = Depends(get_db),
) -> dict:
    """Advance an assigned incident along the responder lifecycle.

    The state machine is **forward-only and deterministic**:
    ``ASSIGNED → ACKNOWLEDGED → EN_ROUTE → ON_SITE → RESOLVED``. Only the single
    legal next transition is accepted; backwards moves, skips, repeats of the
    current state and unknown states are all rejected. Every transition is
    stamped with a **server-generated** timestamp — client-supplied times are
    never trusted.

    Authorization is demo-grade (§5 — not production auth): the ``X-Responder-Id``
    header must equal the ``team_id`` this incident was assigned to, so one
    responder cannot advance another's incident (IDOR protection).
    """

    report = db.get(FieldReport, report_id)
    if report is None or report.category != FieldReportCategory.sos:
        raise HTTPException(status_code=404, detail="SOS incident not found")

    # The lifecycle only exists once a team is assigned.
    assignment = dict((report.cv_classification or {}).get("assignment") or {})
    if not assignment:
        raise HTTPException(status_code=409, detail="Incident has no assigned team yet")

    # Demo-grade authorization: the caller must be the assigned responder.
    if not x_responder_id:
        raise HTTPException(status_code=401, detail="Responder identity required (X-Responder-Id)")
    if x_responder_id != assignment.get("team_id"):
        raise HTTPException(status_code=403, detail="Not the responder assigned to this incident")

    target = (payload.status or "").strip().upper()
    if target not in RESPONDER_FLOW:
        raise HTTPException(status_code=422, detail=f"Unknown responder status '{payload.status}'")

    # Missing/legacy assignments (pre-lifecycle) are treated as ASSIGNED.
    current = (assignment.get("status") or "ASSIGNED").upper()
    if _NEXT_STATUS.get(current) != target:
        # Rejects backwards moves, skips, repeats of the current state, and any
        # move out of the terminal RESOLVED state — one consistent 409.
        raise HTTPException(
            status_code=409, detail=f"Invalid transition {current} → {target}"
        )

    # Server-generated timestamp — never trust the client's clock.
    assignment["status"] = target
    assignment[_STATUS_TS_FIELD[target]] = datetime.now(timezone.utc).isoformat()

    # Reassign a fresh dict so SQLAlchemy tracks the JSONB change.
    cv = dict(report.cv_classification or {})
    cv["assignment"] = assignment
    report.cv_classification = cv
    db.commit()

    return _feature_by_id(db, report_id, None)  # type: ignore[return-value]


@router.post("/sos/{report_id}/escalate")
def escalate_sos(
    report_id: int,
    payload: EscalateIn | None = Body(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Escalate an SOS to the recommended response network (DEMO / SIMULATED).

    The command center hands a high-severity incident to the wider response
    network. The response **category, network and providers are recomputed on the
    server** from the incident's current triage — the client cannot choose or
    fake them (§5) — and the escalation is recorded additively under a new
    ``cv_classification["escalation"]`` namespace (no new table, no migration),
    parallel to ``assignment``. The dispatch itself is **simulated**: no real
    NDRF / 108 / NGO API is contacted (§9, §18).

    Idempotent: escalating an already-escalated incident returns it unchanged, so
    the original ``escalated_at`` and dispatch reference are preserved and a
    repeated click is a safe no-op.
    """

    report = db.get(FieldReport, report_id)
    if report is None or report.category != FieldReportCategory.sos:
        raise HTTPException(status_code=404, detail="SOS incident not found")

    cv = dict(report.cv_classification or {})
    if cv.get("escalation"):
        return _feature_by_id(db, report_id, None)  # type: ignore[return-value]

    # Recompute the routing recommendation server-side (never trust the client).
    lon = db.execute(select(func.ST_X(FieldReport.geom)).where(FieldReport.id == report_id)).scalar()
    lat = db.execute(select(func.ST_Y(FieldReport.geom)).where(FieldReport.id == report_id)).scalar()
    attrs = _attrs_from_cv(report.cv_classification)
    computed = _compute_triage(db, lat, lon, attrs, None)
    triage = computed["triage"]

    dispatcher = get_dispatcher()
    recommendation = dispatcher.recommend(
        priority=triage["priority"],
        needs=triage["needs"],
        display_level=computed["display_level"],
    )
    acknowledgement = dispatcher.dispatch(incident_id=report_id, recommendation=recommendation)

    escalation = {
        "status": "ESCALATED",
        "escalated_at": datetime.now(timezone.utc).isoformat(),
        "priority": triage["priority"],
        "escalation_level": recommendation["escalation_level"],
        "escalation_level_label": recommendation["escalation_level_label"],
        "escalation_network": recommendation["escalation_network"],
        "primary_category": recommendation["primary_category"],
        "providers": recommendation["providers"],
        "supporting": recommendation["supporting"],
        "reason": recommendation["reason"],
        "dispatch": acknowledgement,
        "is_simulated": True,
    }
    if payload and payload.note:
        escalation["note"] = payload.note

    # Reassign a fresh dict so SQLAlchemy tracks the JSONB change.
    cv["escalation"] = escalation
    report.cv_classification = cv
    db.commit()

    return _feature_by_id(db, report_id, None)  # type: ignore[return-value]
