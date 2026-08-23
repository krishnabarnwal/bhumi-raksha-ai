"""Response prioritization — where to send limited resources first.

Ranks every risk zone by a blend of its (scenario-aware) risk score and the
population/assets exposed inside it, then assigns a P1–P4 response tier. The tier
follows the risk level (CRITICAL→P1 … LOW→P4) so it always agrees with the map
colour and the alerts; the ordering *within* the queue additionally weighs how
many people are exposed, so a densely-populated HIGH zone can be actioned ahead
of a remote one. Purely derived from existing data — DEMO/SIMULATED decision
support, never a guaranteed prediction (§5/§18).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.base import RiskLevel
from app.models.hazard import RiskZone
from app.services.exposure import zone_exposure
from app.services.risk_state import (
    LEVEL_COLOR,
    resolve_override,
    scenario_label,
    zone_result,
)

router = APIRouter(prefix="/api", tags=["priorities"])

# Response tier follows the risk level, keeping priority ↔ map colour in sync.
PRIORITY_BY_LEVEL = {
    RiskLevel.red: "P1",
    RiskLevel.orange: "P2",
    RiskLevel.yellow: "P3",
    RiskLevel.green: "P4",
}

_EMPTY_EXPOSURE = {
    "villages": [],
    "infrastructure": [],
    "roads": [],
    "population_affected": 0,
}


def _priority_index(risk_score: float, population: int) -> float:
    """Blend risk and exposure: risk dominates, population escalates up to 2x."""

    return round(risk_score * (1 + min(population, 10000) / 10000), 1)


@router.get("/priorities")
def list_priorities(
    scenario: str | None = Query(None, description="normal | heavy | extreme"),
    rainfall_24h: float | None = Query(None, ge=0, description="override 24h rainfall (mm)"),
    db: Session = Depends(get_db),
) -> dict:
    override = resolve_override(scenario, rainfall_24h)
    zones = db.execute(select(RiskZone).order_by(RiskZone.name)).scalars().all()

    items: list[dict] = []
    for zone in zones:
        result = zone_result(db, zone.id, override)
        try:
            exposure = zone_exposure(db, zone.id)
        except Exception:  # noqa: BLE001 - exposure is best-effort for ranking
            exposure = dict(_EMPTY_EXPOSURE)

        population = exposure["population_affected"]
        items.append(
            {
                "zone_id": zone.id,
                "zone": zone.name,
                "priority": PRIORITY_BY_LEVEL[result.risk_level],
                "priority_index": _priority_index(result.risk_score, population),
                "risk_score": result.risk_score,
                "risk_level": result.risk_level.value,
                "display_level": result.display_level,
                "color": LEVEL_COLOR[result.risk_level],
                "population_affected": population,
                "villages": len(exposure["villages"]),
                "infrastructure": len(exposure["infrastructure"]),
                "roads": len(exposure["roads"]),
                "recommended_action": result.recommended_action,
            }
        )

    items.sort(key=lambda it: (-it["priority_index"], -(it["risk_score"] or 0)))
    for rank, item in enumerate(items, start=1):
        item["rank"] = rank

    return {
        "scenario": scenario_label(scenario, rainfall_24h),
        "count": len(items),
        "priorities": items,
        "disclaimer": "DEMO/SIMULATED prioritization — decision support, not a guaranteed prediction.",
    }
