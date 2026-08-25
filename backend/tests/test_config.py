"""Settings load correctly from defaults and environment overrides."""

from app.core.config import Settings, get_settings


def test_defaults_are_sane():
    s = Settings()
    assert s.APP_ENV
    assert s.DATABASE_URL.startswith("postgresql+psycopg://")
    assert s.WEATHER_PROVIDER == "mock"  # safe default: DEMO/SIMULATED
    assert s.MINIO_BUCKET
    assert s.DB_CONNECT_TIMEOUT >= 1


def test_env_override(monkeypatch):
    monkeypatch.setenv("WEATHER_PROVIDER", "open_meteo")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    s = Settings()
    assert s.WEATHER_PROVIDER == "open_meteo"
    assert s.LOG_LEVEL == "DEBUG"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()


def test_database_url_scheme_normalized_for_hosted_providers():
    # Managed Postgres (Render/Railway/Neon/Supabase/Heroku) hands out a bare
    # postgres:// or postgresql:// URL; the app needs the explicit psycopg 3
    # driver scheme for SQLAlchemy, so a copy-pasted provider URL is rewritten.
    assert (
        Settings(DATABASE_URL="postgres://u:p@host:5432/db").DATABASE_URL
        == "postgresql+psycopg://u:p@host:5432/db"
    )
    assert (
        Settings(DATABASE_URL="postgresql://u:p@host:5432/db").DATABASE_URL
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_database_url_driver_scheme_left_untouched():
    # Already-qualified or non-Postgres URLs pass through unchanged (idempotent).
    for url in (
        "postgresql+psycopg://u:p@host/db",
        "postgresql+asyncpg://u:p@host/db",
        "sqlite:///./local.db",
    ):
        assert Settings(DATABASE_URL=url).DATABASE_URL == url
