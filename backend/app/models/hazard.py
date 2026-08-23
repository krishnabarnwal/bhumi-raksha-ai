"""Hazard-domain entities: risk zones, model predictions, weather observations,
terrain conditioning factors, sensor readings, and the landslide inventory.

Provenance flags (``is_simulated`` / ``is_training_label``) enforce the data-
realism rule (§18): simulated values are never silently presented as real.
"""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
import enum

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import IDMixin, RiskLevel, TimestampMixin, enum_column


class SensorType(str, enum.Enum):
    tiltmeter = "tiltmeter"
    piezometer = "piezometer"
    rain_gauge = "rain_gauge"
    soil_moisture = "soil_moisture"


class IncidentSource(str, enum.Enum):
    gsi = "gsi"
    coolr = "coolr"
    academic = "academic"
    field = "field"


class RiskZone(IDMixin, TimestampMixin, Base):
    """The spatial unit over which risk is scored."""

    __tablename__ = "risk_zones"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    area_km2: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_risk_level: Mapped[RiskLevel] = mapped_column(
        enum_column(RiskLevel, name="ck_risk_zone_level"),
        nullable=False,
        server_default=text("'green'"),
    )
    district_id: Mapped[int | None] = mapped_column(
        ForeignKey("districts.id"), index=True, nullable=True
    )
    geom = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True)

    district: Mapped["District"] = relationship("District")
    predictions: Mapped[list["RiskPrediction"]] = relationship(
        "RiskPrediction", back_populates="risk_zone"
    )
    terrain_data: Mapped[list["TerrainData"]] = relationship(
        "TerrainData", back_populates="risk_zone"
    )


class RiskPrediction(IDMixin, TimestampMixin, Base):
    """A single model output for a risk zone over a validity window."""

    __tablename__ = "risk_predictions"

    risk_zone_id: Mapped[int] = mapped_column(ForeignKey("risk_zones.id"), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0..100
    risk_level: Mapped[RiskLevel] = mapped_column(
        enum_column(RiskLevel, name="ck_risk_prediction_level"), nullable=False
    )
    prediction_window: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g. "24h"
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0..1
    contributing_factors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # SHAP-style
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    risk_zone: Mapped["RiskZone"] = relationship("RiskZone", back_populates="predictions")

    __table_args__ = (
        Index("ix_risk_predictions_zone_valid_to", "risk_zone_id", "valid_to"),
    )


class WeatherObservation(IDMixin, TimestampMixin, Base):
    __tablename__ = "weather_observations"

    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id"), index=True, nullable=True
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    rainfall_mm_1h: Mapped[float | None] = mapped_column(Float, nullable=True)
    rainfall_mm_24h: Mapped[float | None] = mapped_column(Float, nullable=True)
    rainfall_mm_72h: Mapped[float | None] = mapped_column(Float, nullable=True)
    antecedent_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    temp_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_simulated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    location: Mapped["Location"] = relationship("Location")


class TerrainData(IDMixin, TimestampMixin, Base):
    """Static terrain conditioning factors for a risk zone."""

    __tablename__ = "terrain_data"

    risk_zone_id: Mapped[int | None] = mapped_column(
        ForeignKey("risk_zones.id"), index=True, nullable=True
    )
    slope_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    aspect_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    curvature: Mapped[float | None] = mapped_column(Float, nullable=True)
    twi: Mapped[float | None] = mapped_column(Float, nullable=True)  # topographic wetness index
    lithology: Mapped[str | None] = mapped_column(String(120), nullable=True)
    land_cover: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source: Mapped[str | None] = mapped_column(String(120), nullable=True)

    risk_zone: Mapped["RiskZone"] = relationship("RiskZone", back_populates="terrain_data")


class SensorReading(IDMixin, TimestampMixin, Base):
    __tablename__ = "sensor_readings"

    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id"), index=True, nullable=True
    )
    sensor_type: Mapped[SensorType] = mapped_column(
        enum_column(SensorType, name="ck_sensor_type"), nullable=False
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    location: Mapped["Location"] = relationship("Location")


class LandslideIncident(IDMixin, TimestampMixin, Base):
    """Historical inventory record; doubles as an ML training label."""

    __tablename__ = "landslide_incidents"

    district_id: Mapped[int | None] = mapped_column(
        ForeignKey("districts.id"), index=True, nullable=True
    )
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[IncidentSource] = mapped_column(
        enum_column(IncidentSource, name="ck_incident_source"), nullable=False
    )
    severity: Mapped[str | None] = mapped_column(String(30), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_training_label: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)

    district: Mapped["District"] = relationship("District")
