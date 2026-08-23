"""Provider-adapter seam (§9): stable interfaces with swappable Mock/Real
implementations, selected by configuration."""

from app.providers.base import WeatherProvider
from app.providers.factory import get_weather_provider
from app.providers.schemas import ForecastPoint, RainfallForecast, RainfallObservation

__all__ = [
    "WeatherProvider",
    "get_weather_provider",
    "ForecastPoint",
    "RainfallForecast",
    "RainfallObservation",
]
