"""GIS layer endpoints — reference geography as GeoJSON FeatureCollections.

Districts, roads, villages, infrastructure and the historical landslide
inventory. PostGIS ``ST_AsGeoJSON`` does the geometry conversion in-query. All
records are DEMO/SIMULATED over real Sikkim geography (§18).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.geo import District, Infrastructure, Road, Village
from app.models.hazard import LandslideIncident
from app.services.geojson import mappings_to_feature_collection

router = APIRouter(prefix="/api", tags=["layers"])


@router.get("/districts")
def districts(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(
            District.id,
            District.name,
            District.state,
            District.code,
            func.ST_AsGeoJSON(District.geom).label("geometry"),
        ).order_by(District.name)
    ).mappings().all()
    return mappings_to_feature_collection(rows, prop_keys=["name", "state", "code"])


@router.get("/roads")
def roads(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(
            Road.id,
            Road.name,
            Road.ref,
            Road.road_class,
            Road.importance,
            func.ST_AsGeoJSON(Road.geom).label("geometry"),
        ).order_by(Road.name)
    ).mappings().all()
    return mappings_to_feature_collection(
        rows, prop_keys=["name", "ref", "road_class", "importance"]
    )


@router.get("/villages")
def villages(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(
            Village.id,
            Village.name,
            Village.population,
            Village.district_id,
            func.ST_AsGeoJSON(Village.geom).label("geometry"),
        ).order_by(Village.name)
    ).mappings().all()
    return mappings_to_feature_collection(
        rows, prop_keys=["name", "population", "district_id"]
    )


@router.get("/infrastructure")
def infrastructure(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(
            Infrastructure.id,
            Infrastructure.name,
            Infrastructure.type,
            Infrastructure.criticality,
            func.ST_AsGeoJSON(Infrastructure.geom).label("geometry"),
        ).order_by(Infrastructure.name)
    ).mappings().all()
    return mappings_to_feature_collection(
        rows, prop_keys=["name", "type", "criticality"]
    )


@router.get("/incidents")
def incidents(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(
            LandslideIncident.id,
            LandslideIncident.source,
            LandslideIncident.severity,
            LandslideIncident.occurred_at,
            LandslideIncident.description,
            func.ST_AsGeoJSON(LandslideIncident.geom).label("geometry"),
        ).order_by(LandslideIncident.occurred_at.desc())
    ).mappings().all()
    return mappings_to_feature_collection(
        rows, prop_keys=["source", "severity", "occurred_at", "description"]
    )
