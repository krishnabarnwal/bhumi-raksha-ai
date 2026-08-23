"""Geographic reference entities: districts, villages, roads, infrastructure,
and lightweight point locations. All geometries are SRID 4326 (WGS84)."""

import enum

from geoalchemy2 import Geometry
from sqlalchemy import ForeignKey, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import IDMixin, TimestampMixin, enum_column


class InfrastructureType(str, enum.Enum):
    hospital = "hospital"
    bridge = "bridge"
    school = "school"
    shelter = "shelter"
    power = "power"
    other = "other"


class District(IDMixin, TimestampMixin, Base):
    __tablename__ = "districts"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False, server_default=text("'Sikkim'"))
    code: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    geom = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True)

    villages: Mapped[list["Village"]] = relationship("Village", back_populates="district")
    roads: Mapped[list["Road"]] = relationship("Road", back_populates="district")
    infrastructure: Mapped[list["Infrastructure"]] = relationship(
        "Infrastructure", back_populates="district"
    )


class Village(IDMixin, TimestampMixin, Base):
    __tablename__ = "villages"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    census_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    district_id: Mapped[int | None] = mapped_column(
        ForeignKey("districts.id"), index=True, nullable=True
    )
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    district: Mapped["District"] = relationship("District", back_populates="villages")


class Road(IDMixin, TimestampMixin, Base):
    __tablename__ = "roads"

    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ref: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g. NH10
    road_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    importance: Mapped[str | None] = mapped_column(String(30), nullable=True)
    district_id: Mapped[int | None] = mapped_column(
        ForeignKey("districts.id"), index=True, nullable=True
    )
    geom = mapped_column(Geometry(geometry_type="MULTILINESTRING", srid=4326), nullable=True)

    district: Mapped["District"] = relationship("District", back_populates="roads")


class Infrastructure(IDMixin, TimestampMixin, Base):
    __tablename__ = "infrastructure"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[InfrastructureType] = mapped_column(
        enum_column(InfrastructureType, name="ck_infrastructure_type"), nullable=False
    )
    criticality: Mapped[str | None] = mapped_column(String(20), nullable=True)
    district_id: Mapped[int | None] = mapped_column(
        ForeignKey("districts.id"), index=True, nullable=True
    )
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    district: Mapped["District"] = relationship("District", back_populates="infrastructure")


class Location(IDMixin, TimestampMixin, Base):
    """Lightweight geo-reference point used by observations and sensor readings."""

    __tablename__ = "locations"

    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
