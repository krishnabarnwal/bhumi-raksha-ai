"""Application configuration.

Settings are loaded from environment variables (and an optional local ``.env``)
via pydantic-settings. Secrets are NEVER hard-coded here — the defaults below are
safe local-development values only, and real deployments override them through the
environment (project rule §14).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- General ---
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    API_TITLE: str = "Bhumi-Raksha AI API"
    API_VERSION: str = "0.1.0"

    # --- Database (PostgreSQL + PostGIS via psycopg 3) ---
    DATABASE_URL: str = "postgresql+psycopg://bhumi:bhumi@localhost:5432/bhumi_raksha"
    # Max seconds to wait establishing a DB connection before failing (keeps the
    # readiness probe fast when the database is unreachable).
    DB_CONNECT_TIMEOUT: int = 5

    # --- Data-provider seam ---
    # "mock" -> DEMO / SIMULATED data (default) | "open_meteo" -> real keyless API
    WEATHER_PROVIDER: str = "mock"

    # --- Object storage (MinIO / S3-compatible) ---
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "bhumi-media"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (one load per process)."""

    return Settings()
