"""Seed the Sikkim DEMO/SIMULATED dataset for the SIH prototype.

Idempotent: re-running is a no-op once Sikkim data exists (pass ``--reset`` to
wipe and reseed the demo tables). Run after ``alembic upgrade head``::

    python -m app.seed.seed_sikkim
    python -m app.seed.seed_sikkim --reset

EVERYTHING seeded here is **DEMO / SIMULATED** data over real Sikkim geography
(rule §18) — never presented as live government/observation data. Geometry uses
real Sikkim coordinates (lon ≈ 88.1–88.9, lat ≈ 27.1–28.1), SRID 4326.

Design note (schema is frozen — Phase 1): each risk zone's full engine input
snapshot is stored in ``RiskPrediction.contributing_factors["inputs"]`` so the
live risk API can reconstruct inputs and apply rainfall scenarios without any
new columns. Current levels are computed by the risk engine itself, so the
seeded map state and the engine always agree.
"""

from __future__ import annotations

import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, func, select

from app.core.db import get_sessionmaker
from app.models.geo import District, Infrastructure, InfrastructureType, Road, Village
from app.models.hazard import (
    IncidentSource,
    LandslideIncident,
    RiskPrediction,
    RiskZone,
    TerrainData,
)
from app.services.risk_engine import RiskInputs, compute_risk

SRID = 4326
DEMO_SOURCE = "DEMO/SIMULATED"


# --- WKT builders (WKT is "lon lat" / X Y order) -----------------------------

def _point(lon: float, lat: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=SRID)


def _bbox_multipolygon(lon: float, lat: float, half: float = 0.03) -> WKTElement:
    minx, maxx = lon - half, lon + half
    miny, maxy = lat - half, lat + half
    ring = (
        f"{minx} {miny}, {maxx} {miny}, {maxx} {maxy}, "
        f"{minx} {maxy}, {minx} {miny}"
    )
    return WKTElement(f"MULTIPOLYGON((({ring})))", srid=SRID)


def _district_multipolygon(minx, miny, maxx, maxy) -> WKTElement:
    ring = (
        f"{minx} {miny}, {maxx} {miny}, {maxx} {maxy}, "
        f"{minx} {maxy}, {minx} {miny}"
    )
    return WKTElement(f"MULTIPOLYGON((({ring})))", srid=SRID)


def _multilinestring(coords: list[tuple[float, float]]) -> WKTElement:
    pts = ", ".join(f"{lon} {lat}" for lon, lat in coords)
    return WKTElement(f"MULTILINESTRING(({pts}))", srid=SRID)


# --- reference data ----------------------------------------------------------

# key -> (name, code, bbox minx, miny, maxx, maxy)
DISTRICTS = {
    "north": ("Mangan (North Sikkim)", "SK-MG", 88.30, 27.55, 88.92, 28.13),
    "east": ("Gangtok (East Sikkim)", "SK-GT", 88.45, 27.20, 88.90, 27.58),
    "south": ("Namchi (South Sikkim)", "SK-NM", 88.25, 27.10, 88.58, 27.32),
    "west": ("Gyalshing (West Sikkim)", "SK-GY", 88.10, 27.15, 88.42, 27.42),
}

# Risk zones over real Sikkim towns. A monsoon cell sits over North Sikkim, so
# "rain" (current 24h mm) is highest there — Chungthang lands CRITICAL, the
# corridor of the real Oct-2023 Teesta disaster. `terrain`/`exposure`/`hist`
# are 0-100 indices; `slope` in degrees; `rain`/`antecedent` in mm.
ZONES = [
    # key         name                 district  lon     lat    slope elev  twi  curv rain  ante  hist terr expo litho          land       area
    ("chungthang", "Chungthang",        "north", 88.640, 27.600, 40, 1790, 8.5, 1.2, 145,  55,  88,  82,  45, "Granitic gneiss", "Forest",    38),
    ("lachen",     "Lachen",            "north", 88.552, 27.718, 38, 2750, 7.0, 0.9, 130,  48,  72,  78,  30, "Gneiss",          "Alpine",    42),
    ("lachung",    "Lachung",           "north", 88.742, 27.692, 38, 2650, 6.5, 0.8, 125,  46,  70,  76,  32, "Gneiss",          "Alpine",    40),
    ("mangan",     "Mangan",            "north", 88.530, 27.510, 30,  950, 9.0, 0.5, 110,  52,  55,  60,  48, "Phyllite",        "Forest",    36),
    ("dikchu",     "Dikchu",            "east",  88.512, 27.420, 35,  700, 9.5, 0.7,  95,  50,  68,  70,  40, "Phyllite",        "Forest",    30),
    ("gangtok",    "Gangtok",           "east",  88.612, 27.335, 28, 1650, 7.5, 0.4,  60,  42,  50,  55,  95, "Schist",          "Urban",     34),
    ("singtam",    "Singtam",           "east",  88.500, 27.232, 33,  350, 10.0, 0.6, 70,  52,  66,  68,  70, "Phyllite",        "Mixed",     28),
    ("rangpo",     "Rangpo",            "south", 88.532, 27.172, 26,  300, 9.0, 0.3,  55,  40,  48,  50,  72, "Alluvium",        "Urban",     26),
    ("namchi",     "Namchi",            "south", 88.360, 27.170, 20, 1300, 6.0, 0.2,  35,  30,  30,  38,  60, "Schist",          "Agriculture", 30),
    ("pelling",    "Pelling",           "west",  88.240, 27.300, 22, 2100, 6.5, 0.3,  30,  32,  34,  42,  45, "Gneiss",          "Forest",    28),
    ("ravangla",   "Ravangla",          "south", 88.360, 27.310, 15, 2000, 5.8, 0.2,  28,  24,  22,  32,  35, "Schist",          "Forest",    26),
    ("yuksom",     "Yuksom",            "west",  88.220, 27.370, 16, 1780, 5.5, 0.2,  25,  22,  20,  30,  25, "Gneiss",          "Forest",    24),
]

# name, population, lon, lat, district
VILLAGES = [
    ("Gangtok",    100286, 88.612, 27.335, "east"),
    ("Singtam",      5868, 88.500, 27.232, "east"),
    ("Rangpo",       9701, 88.532, 27.172, "south"),
    ("Namchi",      12190, 88.360, 27.170, "south"),
    ("Mangan",       4644, 88.530, 27.510, "north"),
    ("Chungthang",   3021, 88.640, 27.600, "north"),
    ("Lachen",       2000, 88.552, 27.718, "north"),
    ("Lachung",      2500, 88.742, 27.692, "north"),
    ("Dikchu",       2200, 88.512, 27.420, "east"),
    ("Pelling",      5000, 88.240, 27.300, "west"),
    ("Ravangla",     3500, 88.360, 27.310, "south"),
    ("Yuksom",       1951, 88.220, 27.370, "west"),
]

# name, type, criticality, lon, lat, district
INFRASTRUCTURE = [
    ("STNM Hospital",               InfrastructureType.hospital, "critical", 88.606, 27.335, "east"),
    ("District Hospital Mangan",    InfrastructureType.hospital, "high",     88.531, 27.511, "north"),
    ("Namchi District Hospital",    InfrastructureType.hospital, "high",     88.362, 27.168, "south"),
    ("Teesta Bridge, Singtam",      InfrastructureType.bridge,   "critical", 88.501, 27.231, "east"),
    ("Rangpo Bridge (NH10)",        InfrastructureType.bridge,   "high",     88.533, 27.171, "south"),
    ("Teesta-III Dam, Chungthang",  InfrastructureType.power,    "critical", 88.645, 27.605, "north"),
    ("Tashi Namgyal Academy",       InfrastructureType.school,   "medium",   88.615, 27.332, "east"),
    ("Mangan Relief Shelter",       InfrastructureType.shelter,  "high",     88.535, 27.512, "north"),
    ("Lachen Community Shelter",    InfrastructureType.shelter,  "medium",   88.553, 27.720, "north"),
    ("Chungthang Relief Shelter",   InfrastructureType.shelter,  "high",     88.641, 27.601, "north"),
]

# name, ref, road_class, importance, district, coordinate path
ROADS = [
    (
        "NH10 (Teesta Corridor)", "NH10", "national", "high", "east",
        [(88.532, 27.172), (88.510, 27.200), (88.500, 27.232),
         (88.520, 27.270), (88.550, 27.300), (88.612, 27.335)],
    ),
    (
        "North Sikkim Highway (Gangtok–Chungthang–Lachen)", "NH510", "national", "high", "north",
        [(88.612, 27.335), (88.550, 27.420), (88.530, 27.510),
         (88.600, 27.570), (88.640, 27.600), (88.552, 27.718)],
    ),
    (
        "Chungthang–Lachung Road", None, "state", "medium", "north",
        [(88.640, 27.600), (88.700, 27.650), (88.742, 27.692)],
    ),
]

# lon, lat, occurred (Y,M,D), source, severity, district, description
INCIDENTS = [
    (88.645, 27.602, (2023, 10, 4), IncidentSource.gsi, "severe", "north",
     "Teesta basin flash-flood & slope failures corridor"),
    (88.552, 27.718, (2016, 7, 12), IncidentSource.academic, "moderate", "north",
     "Monsoon-triggered slope failure near Lachen"),
    (88.505, 27.232, (2019, 6, 24), IncidentSource.gsi, "severe", "east",
     "NH10 landslide blocking the Teesta corridor at Singtam"),
    (88.512, 27.421, (2021, 8, 15), IncidentSource.academic, "moderate", "east",
     "Debris slide near Dikchu after heavy rainfall"),
    (88.612, 27.332, (2015, 9, 1), IncidentSource.gsi, "minor", "east",
     "Cut-slope failure on a Gangtok hill road"),
    (88.532, 27.512, (2018, 7, 20), IncidentSource.academic, "moderate", "north",
     "Road slip near Mangan during monsoon"),
    (88.742, 27.692, (2020, 8, 5), IncidentSource.academic, "moderate", "north",
     "Debris flow above Lachung"),
    (88.532, 27.172, (2022, 6, 18), IncidentSource.gsi, "moderate", "south",
     "NH10 slip near Rangpo"),
]

# Tables we own for the demo, child → parent (safe delete order for --reset).
_DEMO_TABLES = [
    RiskPrediction, TerrainData, RiskZone,
    LandslideIncident, Infrastructure, Road, Village, District,
]


def _reset(session) -> None:
    for model in _DEMO_TABLES:
        session.execute(delete(model))
    session.commit()
    print("Reset: cleared existing demo tables.")


def seed(reset: bool = False) -> None:
    Session = get_sessionmaker()
    now = datetime.now(timezone.utc)
    valid_to = now + timedelta(hours=24)

    with Session() as session:
        if reset:
            _reset(session)

        already = session.scalar(
            select(func.count()).select_from(District).where(District.state == "Sikkim")
        )
        if already:
            print(
                f"Sikkim demo data already present ({already} districts) — skipping. "
                "Use --reset to wipe and reseed."
            )
            return

        # Districts ----------------------------------------------------------
        district_ids: dict[str, int] = {}
        for key, (name, code, minx, miny, maxx, maxy) in DISTRICTS.items():
            district = District(
                name=name,
                state="Sikkim",
                code=code,
                geom=_district_multipolygon(minx, miny, maxx, maxy),
            )
            session.add(district)
            session.flush()
            district_ids[key] = district.id

        # Risk zones (+ terrain + baseline prediction) -----------------------
        level_counts: dict[str, int] = {}
        for (
            _key, name, dkey, lon, lat, slope, elev, twi, curv,
            rain, ante, hist, terr, expo, litho, land, area,
        ) in ZONES:
            inputs = RiskInputs(
                rainfall_mm_24h=float(rain),
                antecedent_index=float(ante),
                slope_deg=float(slope),
                historical_susceptibility=float(hist),
                terrain_index=float(terr),
                exposure_index=float(expo),
                is_simulated=True,
            )
            result = compute_risk(inputs)
            level_counts[result.display_level] = level_counts.get(result.display_level, 0) + 1

            zone = RiskZone(
                name=name,
                area_km2=float(area),
                current_risk_level=result.risk_level,
                district_id=district_ids[dkey],
                geom=_bbox_multipolygon(lon, lat, half=0.03),
            )
            session.add(zone)
            session.flush()

            session.add(
                TerrainData(
                    risk_zone_id=zone.id,
                    slope_deg=float(slope),
                    aspect_deg=None,
                    elevation_m=float(elev),
                    curvature=float(curv),
                    twi=float(twi),
                    lithology=litho,
                    land_cover=land,
                    source=DEMO_SOURCE,
                )
            )
            session.add(
                RiskPrediction(
                    risk_zone_id=zone.id,
                    model_version=result.model_version,
                    risk_score=result.risk_score,
                    risk_level=result.risk_level,
                    prediction_window="24h",
                    confidence=result.confidence,
                    contributing_factors={
                        "inputs": asdict(inputs),
                        "factors": [factor.to_dict() for factor in result.factors],
                        "source": DEMO_SOURCE,
                    },
                    valid_from=now,
                    valid_to=valid_to,
                    is_simulated=True,
                )
            )

        # Villages -----------------------------------------------------------
        for name, pop, lon, lat, dkey in VILLAGES:
            session.add(
                Village(
                    name=name,
                    population=pop,
                    district_id=district_ids[dkey],
                    geom=_point(lon, lat),
                )
            )

        # Infrastructure -----------------------------------------------------
        for name, itype, crit, lon, lat, dkey in INFRASTRUCTURE:
            session.add(
                Infrastructure(
                    name=name,
                    type=itype,
                    criticality=crit,
                    district_id=district_ids[dkey],
                    geom=_point(lon, lat),
                )
            )

        # Roads --------------------------------------------------------------
        for name, ref, road_class, importance, dkey, coords in ROADS:
            session.add(
                Road(
                    name=name,
                    ref=ref,
                    road_class=road_class,
                    importance=importance,
                    district_id=district_ids[dkey],
                    geom=_multilinestring(coords),
                )
            )

        # Historical landslide inventory ------------------------------------
        for lon, lat, (yy, mm, dd), source, severity, dkey, desc in INCIDENTS:
            session.add(
                LandslideIncident(
                    district_id=district_ids[dkey],
                    occurred_at=datetime(yy, mm, dd, tzinfo=timezone.utc),
                    source=source,
                    severity=severity,
                    description=f"{DEMO_SOURCE}: {desc}",
                    is_training_label=True,
                    geom=_point(lon, lat),
                )
            )

        session.commit()

    breakdown = ", ".join(f"{lvl}={n}" for lvl, n in sorted(level_counts.items()))
    print("Seeded Sikkim DEMO/SIMULATED dataset:")
    print(f"  districts={len(DISTRICTS)}  zones={len(ZONES)}  villages={len(VILLAGES)}")
    print(f"  infrastructure={len(INFRASTRUCTURE)}  roads={len(ROADS)}  incidents={len(INCIDENTS)}")
    print(f"  zone risk levels: {breakdown}")


def main() -> None:
    reset = "--reset" in sys.argv[1:]
    try:
        seed(reset=reset)
    except Exception as exc:  # pragma: no cover - operator feedback path
        print(f"Seed failed: {exc}", file=sys.stderr)
        print(
            "Ensure the database is up and migrated: `alembic upgrade head`.",
            file=sys.stderr,
        )
        raise


if __name__ == "__main__":
    main()
