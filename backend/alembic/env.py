"""Alembic environment.

- Reads the database URL from application settings (``DATABASE_URL``), never from
  ``alembic.ini`` (keeps secrets out of source).
- Registers every ORM model by importing ``app.models`` so autogenerate sees the
  full schema.
- Wires GeoAlchemy2's Alembic helpers so PostGIS geometry types render correctly
  and PostGIS-managed objects don't produce spurious autogenerate diffs.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

import app.models  # noqa: F401  (registers models on Base.metadata)
from app.core.config import get_settings
from app.core.db import Base

# GeoAlchemy2 Alembic integration (geometry rendering + diff filtering).
from geoalchemy2 import alembic_helpers

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# PostGIS ships managed tables/views that must never appear in migrations.
EXCLUDED_TABLES = {
    "spatial_ref_sys",
    "geometry_columns",
    "geography_columns",
    "raster_columns",
    "raster_overviews",
}


def _include_name(name, type_, parent_names):
    if type_ == "table":
        return name not in EXCLUDED_TABLES
    return True


def _get_url() -> str:
    return get_settings().DATABASE_URL


def _common_kwargs() -> dict:
    return {
        "target_metadata": target_metadata,
        "compare_type": True,
        "include_name": _include_name,
        # GeoAlchemy2: keep geometry types + spatial indexes sane in autogenerate.
        "include_object": alembic_helpers.include_object,
        "render_item": alembic_helpers.render_item,
        "process_revision_directives": alembic_helpers.writer,
    }


def run_migrations_offline() -> None:
    context.configure(
        url=_get_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_common_kwargs(),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_get_url(), poolclass=pool.NullPool, future=True)
    with connectable.connect() as connection:
        context.configure(connection=connection, **_common_kwargs())
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
