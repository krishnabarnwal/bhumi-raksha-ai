"""Field reporting: citizen/field-officer submissions and their media assets.

Supports the offline-first flow (later phase) via ``client_uuid`` for idempotent
de-duplication of submissions synced from the field. Any computer-vision output
lives in ``cv_classification`` as *supporting evidence only* — never a predictor
(§10).
"""

from datetime import datetime
import enum

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import IDMixin, TimestampMixin, enum_column


class FieldReportCategory(str, enum.Enum):
    slope_crack = "slope_crack"
    road_blockage = "road_blockage"
    rockfall = "rockfall"
    water_seepage = "water_seepage"
    slope_movement = "slope_movement"
    landslide = "landslide"
    other = "other"


class FieldReportStatus(str, enum.Enum):
    submitted = "submitted"
    under_review = "under_review"
    verified = "verified"
    rejected = "rejected"
    resolved = "resolved"


class FieldReport(IDMixin, TimestampMixin, Base):
    __tablename__ = "field_reports"

    reporter_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=True
    )
    reporter_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    category: Mapped[FieldReportCategory] = mapped_column(
        enum_column(FieldReportCategory, name="ck_field_report_category"), nullable=False
    )
    severity: Mapped[str | None] = mapped_column(String(30), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[FieldReportStatus] = mapped_column(
        enum_column(FieldReportStatus, name="ck_field_report_status"),
        nullable=False,
        index=True,
        server_default=text("'submitted'"),
    )
    cv_classification: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    client_uuid: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    reporter: Mapped["User"] = relationship("User")
    media_assets: Mapped[list["MediaAsset"]] = relationship(
        "MediaAsset", back_populates="field_report"
    )


class MediaAsset(IDMixin, TimestampMixin, Base):
    """Photo/video stored in MinIO; only the object key is persisted here."""

    __tablename__ = "media_assets"

    field_report_id: Mapped[int] = mapped_column(
        ForeignKey("field_reports.id"), index=True, nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    media_type: Mapped[str | None] = mapped_column(String(30), nullable=True)  # image | video
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)  # MIME
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)  # e.g. sha256
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    field_report: Mapped["FieldReport"] = relationship(
        "FieldReport", back_populates="media_assets"
    )
