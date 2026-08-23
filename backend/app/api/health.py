"""Health & readiness endpoints.

- ``GET /health``        liveness: process is up (no dependencies checked).
- ``GET /health/ready``  readiness: verifies the database answers ``SELECT 1``;
  returns 503 if not, so orchestrators can gate traffic.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.core.db import get_engine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok"}


@router.get("/health/ready")
def ready(response: Response) -> dict:
    """Readiness probe — confirms the database is reachable."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - any failure means "not ready"
        logger.warning("Readiness check failed: database unreachable (%s)", exc)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "db": "error"}
    return {"status": "ok", "db": "ok"}
