"""Application configuration.

Settings are loaded from environment variables (and an optional local ``.env``)
via pydantic-settings. Secrets are NEVER hard-coded here — the defaults below are
safe local-development values only, and real deployments override them through the
environment (project rule §14).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
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

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def _normalize_db_scheme(cls, value: str) -> str:
        """Normalize hosted-provider DB URLs to the psycopg 3 driver scheme.

        Managed Postgres (Render, Railway, Neon, Supabase, Heroku, …) hands out a
        bare ``postgres://`` or ``postgresql://`` connection string, but this app
        talks to the database through psycopg 3, which SQLAlchemy selects only via
        the explicit ``postgresql+psycopg://`` scheme. Rewrite those two bare
        schemes so a copy-pasted provider URL works as-is; leave any URL that
        already names a driver (``postgresql+psycopg``, ``postgresql+asyncpg``, …)
        or a non-Postgres backend (e.g. ``sqlite://``) untouched. Idempotent.
        """

        if value.startswith("postgresql+"):
            return value  # already driver-qualified — nothing to do
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value[len("postgresql://") :]
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value[len("postgres://") :]
        return value

    # --- Data-provider seam ---
    # "mock" -> DEMO / SIMULATED data (default) | "open_meteo" -> real keyless API
    WEATHER_PROVIDER: str = "mock"

    # --- Object storage (MinIO / S3-compatible) ---
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "bhumi-media"

    # --- Local media storage (demo: field-report photos on local disk) ---
    # LocalStorage writes here and StaticFiles serves it at MEDIA_URL_PREFIX.
    # MinIO/S3 is the integration-ready alternative (§9); swap the backend, not
    # the API. Path is relative to the backend working directory.
    MEDIA_ROOT: str = "media"
    MEDIA_URL_PREFIX: str = "/media"
    MAX_UPLOAD_BYTES: int = 8 * 1024 * 1024  # 8 MB hard cap on uploads (§14)

    # --- CORS (frontend origins allowed to call this API) ---
    # The React/Vite dashboard runs on a separate origin in dev and calls this API.
    # In production, override with the deployed frontend origin(s).
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # --- Risk engine weights (PROTOTYPE demo weights — NOT government-standard) ---
    # Relative importance of each factor; auto-normalized to sum to 1 at use time
    # (project rule §5/§9: explainable, configurable — never a "certified" model).
    RISK_W_RAINFALL: float = 0.30
    RISK_W_SLOPE: float = 0.25
    RISK_W_HISTORICAL: float = 0.20
    RISK_W_SOIL: float = 0.10
    RISK_W_TERRAIN: float = 0.05
    RISK_W_EXPOSURE: float = 0.10

    def risk_weights(self) -> dict[str, float]:
        """Return the six factor weights normalized to sum to 1.0.

        These are prototype demo weights, not validated government thresholds.
        Any ``RISK_W_*`` can be overridden via the environment.
        """

        raw = {
            "rainfall": self.RISK_W_RAINFALL,
            "slope": self.RISK_W_SLOPE,
            "historical": self.RISK_W_HISTORICAL,
            "soil": self.RISK_W_SOIL,
            "terrain": self.RISK_W_TERRAIN,
            "exposure": self.RISK_W_EXPOSURE,
        }
        total = sum(raw.values()) or 1.0
        return {key: value / total for key, value in raw.items()}


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (one load per process)."""

    return Settings()
