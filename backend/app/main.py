"""FastAPI application entrypoint.

Builds the app via a factory (``create_app``) so tests can construct isolated
instances. Wires the health probes plus the Phase 2 demo APIs (risk, GIS
layers, alerts, field reports, priorities) and the emergency-response SOS API,
plus CORS for the React/MapLibre dashboard, and serves uploaded field-report
media as static files.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.alerts import router as alerts_router
from app.api.field_reports import router as field_reports_router
from app.api.health import router as health_router
from app.api.layers import router as layers_router
from app.api.priorities import router as priorities_router
from app.api.risk import router as risk_router
from app.api.sos import router as sos_router
from app.core.config import get_settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)

    app = FastAPI(title=settings.API_TITLE, version=settings.API_VERSION)

    # The dashboard runs on a separate dev origin (:5173) and calls this API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(risk_router)
    app.include_router(layers_router)
    app.include_router(alerts_router)
    app.include_router(field_reports_router)
    app.include_router(priorities_router)
    app.include_router(sos_router)

    # Serve uploaded field-report photos. The directory is created on startup so
    # a fresh checkout (no uploads yet) does not fail to mount.
    media_root = Path(settings.MEDIA_ROOT)
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount(
        settings.MEDIA_URL_PREFIX,
        StaticFiles(directory=str(media_root)),
        name="media",
    )
    return app


app = create_app()
