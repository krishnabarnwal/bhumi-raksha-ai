"""Logging configuration.

Minimal, dependency-free setup for Phase 1. Structured/JSON logging and request
correlation IDs are a later concern; this keeps the foundation runnable and
readable without over-engineering (project rule §23).
"""

from __future__ import annotations

import logging

_CONFIGURED = False


def configure_logging(level: str = "INFO") -> None:
    """Configure root logging once, idempotently."""

    global _CONFIGURED
    if _CONFIGURED:
        return

    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    _CONFIGURED = True
