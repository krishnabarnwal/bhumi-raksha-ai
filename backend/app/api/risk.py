"""Risk API — the demo's core.

- ``GET /api/zones``                     risk zones as a colored FeatureCollection;
                                         ``scenario`` / ``rainfall_24h`` recolor the
                                         whole map live (the headline demo moment).
- ``GET /api/zones/{id}/risk``           explainable risk for one zone; ``scenario``
                                         or ``rainfall_24h`` overrides drive the
                                         "change the rain, watch the score" demo.
- ``GET /api/zones/recompute``           recompute every zone under a scenario and
                                         *persist* the new levels (optional; the map
                                         itself recolors via the ``scenario`` query).

Every view (map, panel, alerts) computes through :mod:`app.services.risk_state`
from each zone's stored inputs (``contributing_factors["inputs"]``), so the map
colour, the panel score and the alert severity always agree — no schema change,
no persisted split-brain. All data is DEMO/SIMULATED (§18); output is an
explainable score, never a guaranteed prediction (§5).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.hazard import RiskZone
from app.services.geojson import make_feature, make_feature_collection, parse_geometry
from app.services.risk_engine import DISPLAY_LEVEL
from app.services.risk_state import (
    LEVEL_COLOR,
    color_for,
    resolve_override,
    scenario_label,
    zone_result,
)

router = APIRouter(prefix="/api", tags=["risk"])


@router.get("/zones")
def list_zones(
    scenario: str | None = Query(None, description="normal | heavy | extreme"),
    rainfall_24h: float | None = Query(None, ge=0, description="override 24h rainfall (mm)"),
    db: Session = Depends(get_db),
) -> dict:
    """All risk zones as a GeoJSON FeatureCollection, coloured by risk level.

    With no scenario the levels reflect each zone's stored current conditions;
    pass a scenario/rainfall to recolor the entire map under that hypothetical.
    """

    override = resolve_override(scenario, rainfall_24h)
    rows = db.execute(
        select(
            RiskZone.id,
            RiskZone.name,
            RiskZone.area_km2,
            RiskZone.district_id,
            func.ST_AsGeoJSON(RiskZone.geom).label("geometry"),
        ).order_by(RiskZone.name)
    ).mappings().all()

    features = []
    for row in rows:
        result = zone_result(db, row["id"], override)
        properties = {
            "id": row["id"],
            "name": row["name"],
            "area_km2": row["area_km2"],
            "district_id": row["district_id"],
            "risk_score": result.risk_score,
            "risk_level": result.risk_level.value,
            "display_level": result.display_level,
            "color": LEVEL_COLOR[result.risk_level],
            "is_simulated": True,
        }
        features.append(make_feature(parse_geometry(row["geometry"]), properties, row["id"]))
    return make_feature_collection(features)


@router.get("/zones/{zone_id}/risk")
def zone_risk(
    zone_id: int,
    scenario: str | None = Query(None, description="normal | heavy | extreme"),
    rainfall_24h: float | None = Query(None, ge=0, description="override 24h rainfall (mm)"),
    db: Session = Depends(get_db),
) -> dict:
    """Explainable risk for one zone, optionally under a rainfall scenario."""

    zone = db.get(RiskZone, zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail="Risk zone not found")

    override = resolve_override(scenario, rainfall_24h)
    result = zone_result(db, zone_id, override)

    payload = result.to_dict()
    payload["zone"] = {
        "id": zone.id,
        "name": zone.name,
        "district_id": zone.district_id,
        "area_km2": zone.area_km2,
    }
    payload["scenario"] = scenario_label(scenario, rainfall_24h)
    payload["color"] = color_for(result.risk_level)
    return payload


@router.get("/zones/recompute")
def recompute_zones(
    scenario: str | None = Query(None, description="normal | heavy | extreme"),
    rainfall_24h: float | None = Query(None, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Recompute every zone under a scenario and persist new levels.

    Optional convenience: the map recolors directly via ``GET /api/zones?scenario=``
    without persisting. This endpoint additionally writes ``current_risk_level``
    so the stored baseline stays meaningful. With no scenario it restores the
    baseline levels from each zone's stored current conditions.
    """

    override = resolve_override(scenario, rainfall_24h)
    zones = db.execute(select(RiskZone)).scalars().all()

    updated = []
    for zone in zones:
        result = zone_result(db, zone.id, override)
        zone.current_risk_level = result.risk_level
        updated.append(
            {
                "id": zone.id,
                "name": zone.name,
                "risk_score": result.risk_score,
                "risk_level": result.risk_level.value,
                "display_level": result.display_level,
                "color": LEVEL_COLOR[result.risk_level],
            }
        )
    db.commit()

    updated.sort(key=lambda item: item["risk_score"], reverse=True)
    return {
        "scenario": scenario_label(scenario, rainfall_24h),
        "rainfall_mm_24h": override,
        "count": len(updated),
        "zones": updated,
        "disclaimer": "DEMO/SIMULATED scenario recompute — prototype scores, not a forecast.",
    }
