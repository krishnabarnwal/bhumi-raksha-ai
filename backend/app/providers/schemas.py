"""Normalized weather DTOs returned by every :class:`WeatherProvider`.

Per project rule §18 (data realism), **every** record carries ``source`` and
``is_simulated`` so simulated demo data can never be silently presented as real
government/observed data downstream.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ForecastPoint(BaseModel):
    """A single hourly precipitation forecast step."""

    timestamp: datetime
    rainfall_mm: float


class RainfallObservation(BaseModel):
    """Observed/current rainfall (and basic weather) at a point."""

    lat: float
    lon: float
    observed_at: datetime
    rainfall_mm_1h: float | None = None
    rainfall_mm_24h: float | None = None
    rainfall_mm_72h: float | None = None
    antecedent_index: float | None = None
    temp_c: float | None = None
    humidity_pct: float | None = None

    # §18 provenance — always present.
    source: str
    is_simulated: bool


class RainfallForecast(BaseModel):
    """An hourly rainfall forecast series for a point."""

    lat: float
    lon: float
    issued_at: datetime
    points: list[ForecastPoint] = Field(default_factory=list)

    # §18 provenance — always present.
    source: str
    is_simulated: bool
