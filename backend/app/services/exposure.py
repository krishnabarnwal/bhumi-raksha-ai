"""Spatial exposure: which people and assets fall inside a risk zone.

PostGIS ``ST_Intersects`` against the zone polygon — villages, infrastructure
(points) and roads (lines) whose geometry intersects the zone are "exposed".
Reused by the alerts API (affected assets) and the priorities API (population
at risk). All inputs here are DEMO/SIMULATED (§18).
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.geo import Infrastructure, Road, Village
from app.models.hazard import RiskZone


def zone_exposure(db: Session, zone_id: int) -> dict:
    """Return villages / infrastructure / roads intersecting the given zone."""

    zone_geom = select(RiskZone.geom).where(RiskZone.id == zone_id).scalar_subquery()

    villages = db.execute(
        select(Village.id, Village.name, Village.population)
        .where(Village.geom.isnot(None))
        .where(func.ST_Intersects(Village.geom, zone_geom))
        .order_by(Village.population.desc())
    ).mappings().all()

    infrastructure = db.execute(
        select(
            Infrastructure.id,
            Infrastructure.name,
            Infrastructure.type,
            Infrastructure.criticality,
        )
        .where(Infrastructure.geom.isnot(None))
        .where(func.ST_Intersects(Infrastructure.geom, zone_geom))
    ).mappings().all()

    roads = db.execute(
        select(Road.id, Road.name, Road.ref, Road.importance)
        .where(Road.geom.isnot(None))
        .where(func.ST_Intersects(Road.geom, zone_geom))
    ).mappings().all()

    population = sum((row["population"] or 0) for row in villages)

    return {
        "villages": [dict(row) for row in villages],
        "infrastructure": [dict(row) for row in infrastructure],
        "roads": [dict(row) for row in roads],
        "population_affected": population,
        "counts": {
            "villages": len(villages),
            "infrastructure": len(infrastructure),
            "roads": len(roads),
        },
    }
