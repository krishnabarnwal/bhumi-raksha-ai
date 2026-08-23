"""Warnings and emergency prioritisation.

Alerts carry multilingual translations (``languages``) and a CAP XML payload
(``cap_xml``) for SACHET-compatible dissemination (built in a later phase)."""

from datetime import datetime
import enum

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import IDMixin, RiskLevel, TimestampMixin, enum_column


class AlertStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    updated = "updated"
    cancelled = "cancelled"
    expired = "expired"


class PriorityRank(str, enum.Enum):
    p1 = "P1"
    p2 = "P2"
    p3 = "P3"
    p4 = "P4"


class Alert(IDMixin, TimestampMixin, Base):
    __tablename__ = "alerts"

    risk_zone_id: Mapped[int | None] = mapped_column(
        ForeignKey("risk_zones.id"), index=True, nullable=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    severity: Mapped[RiskLevel] = mapped_column(
        enum_column(RiskLevel, name="ck_alert_severity"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    languages: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # {lang: translation}
    cap_xml: Mapped[str | None] = mapped_column(Text, nullable=True)
    channels: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # ["sms", "app", ...]
    status: Mapped[AlertStatus] = mapped_column(
        enum_column(AlertStatus, name="ck_alert_status"),
        nullable=False,
        server_default=text("'draft'"),
    )
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    risk_zone: Mapped["RiskZone"] = relationship("RiskZone")
    created_by_user: Mapped["User"] = relationship("User")


class EmergencyPriority(IDMixin, TimestampMixin, Base):
    """P1–P4 triage ranking, optionally tied to a zone / report / road."""

    __tablename__ = "emergency_priorities"

    risk_zone_id: Mapped[int | None] = mapped_column(
        ForeignKey("risk_zones.id"), nullable=True
    )
    field_report_id: Mapped[int | None] = mapped_column(
        ForeignKey("field_reports.id"), nullable=True
    )
    road_id: Mapped[int | None] = mapped_column(ForeignKey("roads.id"), nullable=True)
    priority_rank: Mapped[PriorityRank] = mapped_column(
        enum_column(PriorityRank, name="ck_priority_rank"), nullable=False
    )
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    population_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rationale: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str | None] = mapped_column(String(30), nullable=True)
