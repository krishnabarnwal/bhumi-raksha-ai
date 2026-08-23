"""Database engine, session factory, and the declarative Base.

Synchronous SQLAlchemy 2.0 (see plan): the simplest correct path with Alembic +
GeoAlchemy2. FastAPI runs sync DB work in its threadpool. The engine is created
lazily so that importing application modules (and running unit tests) never
requires a reachable database or the DB driver to be installed.
"""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


@lru_cache
def get_engine() -> Engine:
    """Create (once) and return the SQLAlchemy engine.

    Lazy + cached: nothing connects until this is first called.
    """

    settings = get_settings()
    # libpq connect_timeout bounds how long a failed connection blocks; only
    # applicable to PostgreSQL URLs (guarded so sqlite/other test DBs still work).
    connect_args: dict = {}
    if settings.DATABASE_URL.startswith("postgresql"):
        connect_args["connect_timeout"] = settings.DB_CONNECT_TIMEOUT
    return create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        future=True,
        connect_args=connect_args,
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    """Return the cached session factory bound to the engine."""

    return sessionmaker(
        bind=get_engine(),
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped session that is always closed."""

    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()
