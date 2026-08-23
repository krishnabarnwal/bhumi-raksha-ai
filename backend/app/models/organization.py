"""Accounts and RBAC roles.

Phase 1 creates the tables only — authentication/authorisation *logic* (JWT,
RBAC enforcement) is a later phase (see plan). No passwords are stored here;
``hashed_password`` is populated by that later auth layer.
"""

import enum

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import IDMixin, TimestampMixin, enum_column


class RoleName(str, enum.Enum):
    district_admin = "district_admin"
    dm_officer = "dm_officer"
    field_officer = "field_officer"
    citizen = "citizen"
    sys_admin = "sys_admin"


class Role(IDMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    name: Mapped[RoleName] = mapped_column(
        enum_column(RoleName, name="ck_role_name"), unique=True, nullable=False
    )
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    users: Mapped[list["User"]] = relationship("User", back_populates="role")


class User(IDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    preferred_language: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'en'")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True, nullable=False)

    role: Mapped["Role"] = relationship("Role", back_populates="users")
