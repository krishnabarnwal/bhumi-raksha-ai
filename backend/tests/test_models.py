"""ORM integrity: mappers configure, the full §15 schema is registered, and
geometry / special columns are wired as intended."""

from geoalchemy2 import Geometry
from sqlalchemy.orm import configure_mappers

import app.models  # noqa: F401  (registers all models on Base.metadata)
from app.core.db import Base
from app.models.audit import AuditLog

EXPECTED_GEOM_TABLES = {
    "districts",
    "villages",
    "roads",
    "infrastructure",
    "locations",
    "risk_zones",
    "landslide_incidents",
    "field_reports",
    "media_assets",
}


def test_all_models_configure_and_register():
    configure_mappers()  # raises if any relationship/mapping is broken
    tables = set(Base.metadata.tables)
    assert len(tables) == 18
    for expected in ("districts", "users", "risk_zones", "field_reports", "audit_logs"):
        assert expected in tables


def test_geometry_columns_present():
    geom_tables = {
        name
        for name, table in Base.metadata.tables.items()
        if any(isinstance(col.type, Geometry) for col in table.columns)
    }
    assert geom_tables == EXPECTED_GEOM_TABLES


def test_audit_log_metadata_column_mapping():
    # ORM attribute is `meta`; the DB column is named `metadata` (avoids the
    # reserved SQLAlchemy `Base.metadata`).
    column_names = {col.name for col in AuditLog.__table__.columns}
    assert "metadata" in column_names
    assert hasattr(AuditLog, "meta")
