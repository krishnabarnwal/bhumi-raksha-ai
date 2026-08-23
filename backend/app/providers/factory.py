"""Provider selection.

``get_weather_provider`` returns the configured :class:`WeatherProvider` based
on ``settings.WEATHER_PROVIDER`` (default ``mock``). This is the single place
that decides mock vs. real — the pattern extends to future ``TerrainProvider`` /
``SatelliteProvider`` / ``InventoryProvider`` seams.
"""

from __future__ import annotations

from app.core.config import Settings, get_settings
from app.providers.base import WeatherProvider
from app.providers.weather.mock import MockWeatherProvider
from app.providers.weather.open_meteo import OpenMeteoWeatherProvider

_MOCK_ALIASES = {"mock", "demo", "simulated", "demo/simulated"}
_OPEN_METEO_ALIASES = {"open_meteo", "open-meteo", "openmeteo"}


def get_weather_provider(settings: Settings | None = None) -> WeatherProvider:
    settings = settings or get_settings()
    choice = (settings.WEATHER_PROVIDER or "mock").strip().lower()
    if choice in _MOCK_ALIASES:
        return MockWeatherProvider()
    if choice in _OPEN_METEO_ALIASES:
        return OpenMeteoWeatherProvider()
    raise ValueError(
        f"Unknown WEATHER_PROVIDER {settings.WEATHER_PROVIDER!r}; "
        "expected one of: mock, open_meteo"
    )
