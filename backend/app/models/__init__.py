"""Model package.

Importing this package registers every ORM model on ``Base.metadata`` — Alembic
and any metadata-driven tooling import ``app.models`` to see the full schema.
"""

from app.core.db import Base
from app.models.alert import Alert, AlertStatus, EmergencyPriority, PriorityRank
from app.models.audit import AuditLog
from app.models.field import (
    FieldReport,
    FieldReportCategory,
    FieldReportStatus,
    MediaAsset,
)
from app.models.geo import (
    District,
    Infrastructure,
    InfrastructureType,
    Location,
    Road,
    Village,
)
from app.models.hazard import (
    IncidentSource,
    LandslideIncident,
    RiskPrediction,
    RiskZone,
    SensorReading,
    SensorType,
    TerrainData,
    WeatherObservation,
)
from app.models.base import RiskLevel
from app.models.organization import Role, RoleName, User

__all__ = [
    "Base",
    # organization
    "Role",
    "RoleName",
    "User",
    # geo
    "District",
    "Village",
    "Road",
    "Infrastructure",
    "InfrastructureType",
    "Location",
    # hazard
    "RiskZone",
    "RiskLevel",
    "RiskPrediction",
    "WeatherObservation",
    "TerrainData",
    "SensorReading",
    "SensorType",
    "LandslideIncident",
    "IncidentSource",
    # field
    "FieldReport",
    "FieldReportCategory",
    "FieldReportStatus",
    "MediaAsset",
    # alert
    "Alert",
    "AlertStatus",
    "EmergencyPriority",
    "PriorityRank",
    # audit
    "AuditLog",
]
