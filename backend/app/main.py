"""FastAPI application entrypoint.

Builds the app via a factory (``create_app``) so tests can construct isolated
instances. Only health endpoints are wired in this phase — domain routers
(risk, GIS, field reports, alerts) attach in later phases.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import get_settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)

    app = FastAPI(title=settings.API_TITLE, version=settings.API_VERSION)
    app.include_router(health_router)
    return app


app = create_app()
