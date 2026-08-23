"""Field reporting — citizen / field-officer ground-truth submissions.

- ``POST /api/field-reports``            create a geo-tagged report (lat/lon → POINT)
- ``GET  /api/field-reports``            all reports as a GeoJSON FeatureCollection
- ``POST /api/field-reports/{id}/media`` attach a validated image to a report

Reports are *ground truth from the field*, not model output or government data —
they complement the risk map (§18 still applies to all base layers). Image
uploads are validated defensively (type / size / magic bytes) in
:mod:`app.services.storage` (§14). Geometry is written with PostGIS
``ST_SetSRID(ST_MakePoint(lon, lat), 4326)`` and read back as GeoJSON.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models.field import FieldReport, FieldReportCategory, MediaAsset
from app.services.geojson import make_feature, make_feature_collection, parse_geometry
from app.services.storage import StorageError, get_storage

router = APIRouter(prefix="/api", tags=["field-reports"])


class FieldReportIn(BaseModel):
    """Payload for a new field report."""

    lat: float = Field(..., ge=-90, le=90, description="latitude (WGS84)")
    lon: float = Field(..., ge=-180, le=180, description="longitude (WGS84)")
    category: FieldReportCategory
    description: str | None = Field(None, max_length=2000)
    severity: str | None = Field(None, max_length=30, description="low | medium | high")
    reporter_type: str | None = Field(None, max_length=30, description="citizen | field_officer")
    client_uuid: str | None = Field(
        None, max_length=64, description="client id for idempotent (offline) sync"
    )


_MEDIA_COUNT = (
    select(func.count(MediaAsset.id))
    .where(MediaAsset.field_report_id == FieldReport.id)
    .correlate(FieldReport)
    .scalar_subquery()
)

_PROP_KEYS = (
    "id",
    "category",
    "severity",
    "status",
    "description",
    "reporter_type",
    "created_at",
    "media_count",
)


def _report_feature(db: Session, report_id: int) -> dict | None:
    """Return one field report as a GeoJSON Feature (or None if missing)."""

    row = db.execute(
        select(
            FieldReport.id,
            FieldReport.category,
            FieldReport.severity,
            FieldReport.status,
            FieldReport.description,
            FieldReport.reporter_type,
            FieldReport.created_at,
            _MEDIA_COUNT.label("media_count"),
            func.ST_AsGeoJSON(FieldReport.geom).label("geometry"),
        ).where(FieldReport.id == report_id)
    ).mappings().first()
    if row is None:
        return None
    props = {key: row[key] for key in _PROP_KEYS}
    return make_feature(parse_geometry(row["geometry"]), props, row["id"])


@router.get("/field-reports")
def list_field_reports(db: Session = Depends(get_db)) -> dict:
    """All field reports as a GeoJSON FeatureCollection (newest first)."""

    rows = db.execute(
        select(
            FieldReport.id,
            FieldReport.category,
            FieldReport.severity,
            FieldReport.status,
            FieldReport.description,
            FieldReport.reporter_type,
            FieldReport.created_at,
            _MEDIA_COUNT.label("media_count"),
            func.ST_AsGeoJSON(FieldReport.geom).label("geometry"),
        ).order_by(FieldReport.created_at.desc(), FieldReport.id.desc())
    ).mappings().all()

    features = [
        make_feature(
            parse_geometry(row["geometry"]),
            {key: row[key] for key in _PROP_KEYS},
            row["id"],
        )
        for row in rows
    ]
    return make_feature_collection(features)


@router.post("/field-reports", status_code=201)
def create_field_report(payload: FieldReportIn, db: Session = Depends(get_db)) -> dict:
    """Create a geo-tagged field report; returns it as a GeoJSON Feature.

    Idempotent on ``client_uuid`` so an offline client can safely re-sync a
    queued report without creating duplicates.
    """

    if payload.client_uuid:
        existing = db.execute(
            select(FieldReport.id).where(FieldReport.client_uuid == payload.client_uuid)
        ).scalar_one_or_none()
        if existing is not None:
            return _report_feature(db, existing)  # type: ignore[return-value]

    report = FieldReport(
        category=payload.category,
        description=payload.description,
        severity=payload.severity,
        reporter_type=payload.reporter_type or "citizen",
        client_uuid=payload.client_uuid,
        geom=func.ST_SetSRID(func.ST_MakePoint(payload.lon, payload.lat), 4326),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _report_feature(db, report.id)  # type: ignore[return-value]


@router.post("/field-reports/{report_id}/media")
def upload_field_report_media(
    report_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    """Attach a validated image to a report; returns the stored asset + URL."""

    report = db.get(FieldReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Field report not found")

    data = file.file.read()
    storage = get_storage(get_settings())
    try:
        obj = storage.save_image(
            data, file.content_type, prefix=f"field-reports/{report_id}"
        )
    except StorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    asset = MediaAsset(
        field_report_id=report_id,
        storage_key=obj.storage_key,
        media_type="image",
        content_type=obj.content_type,
        size_bytes=obj.size_bytes,
        checksum=obj.checksum,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    return {
        "id": asset.id,
        "field_report_id": report_id,
        "url": obj.url,
        "content_type": obj.content_type,
        "size_bytes": obj.size_bytes,
    }
