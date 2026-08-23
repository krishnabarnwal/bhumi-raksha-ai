"""Provider seam: factory selection, §18 labelling, contract, and Open-Meteo
mapping (against a mocked httpx transport — no live network)."""

from datetime import date

import httpx
import pytest

from app.core.config import Settings
from app.providers import WeatherProvider, get_weather_provider
from app.providers.weather.mock import MockWeatherProvider
from app.providers.weather.open_meteo import OpenMeteoWeatherProvider


# --- factory -----------------------------------------------------------------
def test_factory_selects_mock_by_default():
    provider = get_weather_provider(Settings(WEATHER_PROVIDER="mock"))
    assert isinstance(provider, MockWeatherProvider)


@pytest.mark.parametrize("value", ["open_meteo", "open-meteo", "OpenMeteo"])
def test_factory_selects_open_meteo(value):
    provider = get_weather_provider(Settings(WEATHER_PROVIDER=value))
    assert isinstance(provider, OpenMeteoWeatherProvider)


def test_factory_rejects_unknown():
    with pytest.raises(ValueError):
        get_weather_provider(Settings(WEATHER_PROVIDER="nope"))


# --- contract ----------------------------------------------------------------
def test_providers_satisfy_interface():
    assert isinstance(MockWeatherProvider(), WeatherProvider)
    assert isinstance(OpenMeteoWeatherProvider(), WeatherProvider)


# --- mock: §18 labelling + determinism ---------------------------------------
def test_mock_is_labelled_simulated():
    obs = MockWeatherProvider().get_current_rainfall(27.33, 88.61)
    assert obs.is_simulated is True
    assert obs.source == "DEMO/SIMULATED"


def test_mock_is_deterministic():
    m = MockWeatherProvider()

    def values(o):
        return (o.rainfall_mm_1h, o.rainfall_mm_24h, o.rainfall_mm_72h, o.temp_c, o.humidity_pct)

    assert values(m.get_current_rainfall(27.33, 88.61)) == values(
        m.get_current_rainfall(27.33, 88.61)
    )


def test_mock_forecast_and_history_shapes():
    m = MockWeatherProvider()
    fc = m.get_rainfall_forecast(27.33, 88.61, hours=6)
    assert len(fc.points) == 6
    assert fc.is_simulated is True
    hist = m.get_historical_rainfall(27.33, 88.61, date(2024, 6, 1), date(2024, 6, 3))
    assert len(hist) == 3
    assert all(h.is_simulated for h in hist)


# --- open-meteo: mapping against a mocked transport --------------------------
def _mock_client() -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        if "archive" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "hourly": {
                        "time": ["2024-06-01T00:00", "2024-06-01T01:00", "2024-06-02T00:00"],
                        "precipitation": [1.0, 2.0, 4.0],
                    }
                },
            )
        return httpx.Response(
            200,
            json={
                "current": {
                    "time": "2024-06-01T05:00",
                    "precipitation": 0.5,
                    "temperature_2m": 18.2,
                    "relative_humidity_2m": 88,
                },
                "hourly": {
                    "time": ["2024-06-01T03:00", "2024-06-01T04:00", "2024-06-01T05:00"],
                    "precipitation": [1.0, 2.0, 3.0],
                },
            },
        )

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_open_meteo_maps_current():
    om = OpenMeteoWeatherProvider(client=_mock_client())
    cur = om.get_current_rainfall(27.33, 88.61)
    assert cur.is_simulated is False
    assert cur.source == "open-meteo"
    assert cur.rainfall_mm_1h == 0.5
    assert cur.rainfall_mm_24h == 6.0  # 1+2+3 within trailing 24h window
    assert cur.temp_c == 18.2
    assert cur.humidity_pct == 88.0


def test_open_meteo_maps_history_to_daily():
    om = OpenMeteoWeatherProvider(client=_mock_client())
    hist = om.get_historical_rainfall(27.33, 88.61, date(2024, 6, 1), date(2024, 6, 2))
    assert [o.rainfall_mm_24h for o in hist] == [3.0, 4.0]  # daily sums
    assert all(o.is_simulated is False for o in hist)
