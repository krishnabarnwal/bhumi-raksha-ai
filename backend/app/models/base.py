"""Shared model building blocks: PK/timestamp mixins, the RiskLevel enum, and an
enum-column helper.

Enum columns use ``native_enum=False`` (a VARCHAR + CHECK constraint) rather than
native PostgreSQL enum types, which are painful to evolve under Alembic. Stored
values are the enum *values* (via ``values_callable``).
"""

import enum
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column


class RiskLevel(str, enum.Enum):
    """Shared four-level risk colour scale."""

    green = "green"
    yellow = "yellow"
    orange = "orange"
    red = "red"


def enum_column(py_enum: type[enum.Enum], *, name: str, length: int = 32, **kwargs) -> sa.Enum:
    """Return a VARCHAR-backed :class:`sqlalchemy.Enum` for ``py_enum``.

    - ``native_enum=False`` → stored as ``VARCHAR(length)`` (no native PG enum
      type to migrate). The ORM still validates values against ``py_enum``.
    - ``create_constraint=False`` (the 2.0 default, made explicit) → no CHECK
      constraint, so adding enum members later needs no schema migration.
    - Fixed ``length`` (default 32) decouples column width from the current
      longest value, leaving headroom for new members.

    ``name`` is retained as the type/constraint name for readability and in case
    a CHECK is enabled later.
    """

    return sa.Enum(
        py_enum,
        name=name,
        native_enum=False,
        create_constraint=False,
        length=length,
        values_callable=lambda e: [m.value for m in e],
        **kwargs,
    )


class IDMixin:
    """BigInteger surrogate primary key."""

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True, autoincrement=True)


class TimestampMixin:
    """``created_at`` / ``updated_at`` timestamps managed by the database."""

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
        nullable=False,
    )
