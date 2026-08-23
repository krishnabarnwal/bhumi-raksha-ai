"""The weather provider seam.

``WeatherProvider`` is the stable interface the rest of the system codes
against; concrete adapters (mock, Open-Meteo, and future providers) implement
it. This is the Mock->Real seam mandated by project rule §9 — swap the
implementation via configuration without touching call sites.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from app.providers.schemas import RainfallForecast, RainfallObservation


class WeatherProvider(ABC):
    """Abstract rainfall/weather data source."""

    #: Identifier stamped onto every DTO's ``source`` field.
    name: str = "unknown"
    #: Whether this provider emits simulated (non-real) data (§18 labelling).
    is_simulated: bool = False

    @abstractmethod
    def get_current_rainfall(self, lat: float, lon: float) -> RainfallObservation:
        """Return current rainfall (and 24h/72h antecedent totals) at a point."""

    @abstractmethod
    def get_rainfall_forecast(
        self, lat: float, lon: float, hours: int = 48
    ) -> RainfallForecast:
        """Return an hourly rainfall forecast for the next ``hours`` hours."""

    @abstractmethod
    def get_historical_rainfall(
        self, lat: float, lon: float, start: date, end: date
    ) -> list[RainfallObservation]:
        """Return daily rainfall totals for the inclusive ``start``..``end`` range."""
