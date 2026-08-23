"""Deterministic mock weather provider (DEMO / SIMULATED data).

Produces stable pseudo-values from a hash of the inputs so demos and tests are
reproducible. Every record is labelled ``is_simulated=True`` with a
``DEMO/SIMULATED`` source per project rule §18 — this data must never be
presented as real.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta, timezone

from app.providers.base import WeatherProvider
from app.providers.schemas import ForecastPoint, RainfallForecast, RainfallObservation

DEMO_SOURCE = "DEMO/SIMULATED"


class MockWeatherProvider(WeatherProvider):
    """Deterministic, offline stand-in for a real weather API."""

    name = DEMO_SOURCE
    is_simulated = True

    @staticmethod
    def _unit(*parts: object) -> float:
        """Deterministic pseudo-random float in ``[0, 1)`` from the given parts."""
        key = "|".join(
            f"{p:.4f}" if isinstance(p, float) else str(p) for p in parts
        )
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return int(digest[:8], 16) / 0xFFFFFFFF

    def get_current_rainfall(self, lat: float, lon: float) -> RainfallObservation:
        r1 = round(self._unit(lat, lon, "1h") * 12.0, 1)
        r24 = round(r1 + self._unit(lat, lon, "24h") * 60.0, 1)
        r72 = round(r24 + self._unit(lat, lon, "72h") * 90.0, 1)
        return RainfallObservation(
            lat=lat,
            lon=lon,
            observed_at=datetime.now(timezone.utc),
            rainfall_mm_1h=r1,
            rainfall_mm_24h=r24,
            rainfall_mm_72h=r72,
            antecedent_index=round(r72 * 0.6, 1),
            temp_c=round(12.0 + self._unit(lat, lon, "temp") * 14.0, 1),
            humidity_pct=round(70.0 + self._unit(lat, lon, "hum") * 28.0, 1),
            source=self.name,
            is_simulated=True,
        )

    def get_rainfall_forecast(
        self, lat: float, lon: float, hours: int = 48
    ) -> RainfallForecast:
        issued = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        points = [
            ForecastPoint(
                timestamp=issued + timedelta(hours=h),
                rainfall_mm=round(self._unit(lat, lon, "fc", h) * 8.0, 1),
            )
            for h in range(1, hours + 1)
        ]
        return RainfallForecast(
            lat=lat,
            lon=lon,
            issued_at=issued,
            points=points,
            source=self.name,
            is_simulated=True,
        )

    def get_historical_rainfall(
        self, lat: float, lon: float, start: date, end: date
    ) -> list[RainfallObservation]:
        observations: list[RainfallObservation] = []
        day = start
        while day <= end:
            daily = round(self._unit(lat, lon, "hist", day.isoformat()) * 70.0, 1)
            observations.append(
                RainfallObservation(
                    lat=lat,
                    lon=lon,
                    observed_at=datetime(
                        day.year, day.month, day.day, tzinfo=timezone.utc
                    ),
                    rainfall_mm_24h=daily,
                    source=self.name,
                    is_simulated=True,
                )
            )
            day += timedelta(days=1)
        return observations
