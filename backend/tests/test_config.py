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
