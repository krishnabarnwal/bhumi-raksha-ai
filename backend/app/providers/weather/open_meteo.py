"""Real, keyless weather provider backed by Open-Meteo.

Open-Meteo (https://open-meteo.com) offers free, no-API-key forecast and
historical archive endpoints. Responses are mapped to the normalized DTOs with
``is_simulated=False`` and ``source="open-meteo"``.

The ``httpx.Client`` can be injected (constructor arg) so unit tests can supply
a mocked transport with no live network — see ``tests/test_providers.py``.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timezone

import httpx

from app.providers.base import WeatherProvider
from app.providers.schemas import ForecastPoint, RainfallForecast, RainfallObservation


def _as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _parse_dt(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _window_sum(
    times: list, precip: list, ref_iso: object, hours: int
) -> float | None:
    """Sum the ``hours`` hourly values ending at (inclusive) ``ref_iso``."""
    if not times or not precip:
        return None
    idx = times.index(ref_iso) if ref_iso in times else len(precip) - 1
    lo = max(0, idx - hours + 1)
    vals = [v for v in precip[lo : idx + 1] if isinstance(v, (int, float))]
    return round(float(sum(vals)), 1) if vals else None


class OpenMeteoWeatherProvider(WeatherProvider):
    """Adapter over the Open-Meteo forecast + archive APIs."""

    name = "open-meteo"
    is_simulated = False

    FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
    ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

    def __init__(
        self, client: httpx.Client | None = None, timeout: float = 10.0
    ) -> None:
        self._client = client
        self._timeout = timeout

    def _get(self, url: str, params: dict) -> dict:
        if self._client is not None:
            resp = self._client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()

    def get_current_rainfall(self, lat: float, lon: float) -> RainfallObservation:
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "precipitation,temperature_2m,relative_humidity_2m",
            "hourly": "precipitation",
            "past_days": 3,
            "forecast_days": 1,
            "timezone": "UTC",
        }
        data = self._get(self.FORECAST_URL, params)
        current = data.get("current") or {}
        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        precip = hourly.get("precipitation") or []
        ref = current.get("time")
        return RainfallObservation(
            lat=lat,
            lon=lon,
            observed_at=_parse_dt(ref) or datetime.now(timezone.utc),
            rainfall_mm_1h=_as_float(current.get("precipitation")),
            rainfall_mm_24h=_window_sum(times, precip, ref, 24),
            rainfall_mm_72h=_window_sum(times, precip, ref, 72),
            temp_c=_as_float(current.get("temperature_2m")),
            humidity_pct=_as_float(current.get("relative_humidity_2m")),
            source=self.name,
            is_simulated=False,
        )

    def get_rainfall_forecast(
        self, lat: float, lon: float, hours: int = 48
    ) -> RainfallForecast:
        days = min(16, max(1, math.ceil(hours / 24)))
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "precipitation",
            "forecast_days": days,
            "timezone": "UTC",
        }
        data = self._get(self.FORECAST_URL, params)
        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        precip = hourly.get("precipitation") or []
        points = [
            ForecastPoint(
                timestamp=_parse_dt(t) or datetime.now(timezone.utc),
                rainfall_mm=max(0.0, _as_float(p) or 0.0),
            )
            for t, p in list(zip(times, precip))[:hours]
        ]
        issued = points[0].timestamp if points else datetime.now(timezone.utc)
        return RainfallForecast(
            lat=lat,
            lon=lon,
            issued_at=issued,
            points=points,
            source=self.name,
            is_simulated=False,
        )

    def get_historical_rainfall(
        self, lat: float, lon: float, start: date, end: date
    ) -> list[RainfallObservation]:
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "precipitation",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "timezone": "UTC",
        }
        data = self._get(self.ARCHIVE_URL, params)
        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        precip = hourly.get("precipitation") or []

        daily: dict[str, float] = {}
        for t, p in zip(times, precip):
            if not isinstance(t, str) or not isinstance(p, (int, float)):
                continue
            day = t[:10]
            daily[day] = daily.get(day, 0.0) + float(p)

        return [
            RainfallObservation(
                lat=lat,
                lon=lon,
                observed_at=_parse_dt(f"{day}T00:00") or datetime.now(timezone.utc),
                rainfall_mm_24h=round(total, 1),
                source=self.name,
                is_simulated=False,
            )
            for day, total in sorted(daily.items())
        ]
