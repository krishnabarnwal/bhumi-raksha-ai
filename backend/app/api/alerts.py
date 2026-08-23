"""Early-warning alerts derived from HIGH/CRITICAL risk zones.

Every zone is scored through :mod:`app.services.risk_state` under the requested
scenario; those that land at orange (HIGH) or red (CRITICAL) raise an alert with
its location, severity, the top contributing factors (the "reason"), the
affected assets (via spatial exposure) and a recommended action. Because alerts
use the *same* compute path as the map and the risk panel, the severity, score
and factors shown here always agree with them. Purely derived — no new tables.
DEMO/SIMULATED decision support, never a guaranteed prediction (§5/§18).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.base import RiskLevel
from app.models.hazard import RiskZone
from app.services.exposure import zone_exposure
from app.services.risk_state import resolve_override, scenario_label, zone_result

router = APIRouter(prefix="/api", tags=["alerts"])

# Only these levels raise an early warning.
ALERT_LEVELS = (RiskLevel.orange, RiskLevel.red)
_SEVERITY_ORDER = {RiskLevel.red.value: 0, RiskLevel.orange.value: 1}

_EMPTY_EXPOSURE = {
    "villages": [],
    "infrastructure": [],
    "roads": [],
    "population_affected": 0,
}


def _reason(factors: list[dict]) -> str:
    """Build a short human reason from the top contributing factors."""

    ranked = [f for f in factors if f.get("impact") in ("HIGH", "MEDIUM")]
    top = (ranked or factors)[:3]
    parts = [f"{f['name']} {f['value']}{f.get('unit', '')}".strip() for f in top]
    return ", ".join(parts) if parts else "Elevated combined risk factors"


@router.get("/alerts")
def list_alerts(
    scenario: str | None = Query(None, description="normal | heavy | extreme"),
    rainfall_24h: float | None = Query(None, ge=0, description="override 24h rainfall (mm)"),
    db: Session = Depends(get_db),
) -> dict:
    override = resolve_override(scenario, rainfall_24h)
    zones = db.execute(select(RiskZone).order_by(RiskZone.name)).scalars().all()

    alerts: list[dict] = []
    for zone in zones:
        result = zone_result(db, zone.id, override)
        if result.risk_level not in ALERT_LEVELS:
            continue

        factors = [f.to_dict() for f in result.factors]
        try:
            exposure = zone_exposure(db, zone.id)
        except Exception:  # noqa: BLE001 - exposure is best-effort for the alert
            exposure = dict(_EMPTY_EXPOSURE)

        alerts.append(
            {
                "zone_id": zone.id,
                "title": f"{result.display_level} landslide risk — {zone.name}",
                "location": zone.name,
                "severity": result.risk_level.value,
                "display_level": result.display_level,
                "risk_score": result.risk_score,
                "reason": _reason(factors),
                "affected": {
                    "population": exposure["population_affected"],
                    "villages": [v["name"] for v in exposure["villages"]],
                    "infrastructure": [i["name"] for i in exposure["infrastructure"]],
                    "roads": [r["name"] for r in exposure["roads"]],
                },
                "recommended_action": result.recommended_action,
                "is_simulated": True,
            }
        )

    alerts.sort(
        key=lambda a: (_SEVERITY_ORDER.get(a["severity"], 9), -(a["risk_score"] or 0))
    )
    return {
        "scenario": scenario_label(scenario, rainfall_24h),
        "count": len(alerts),
        "alerts": alerts,
        "disclaimer": "DEMO/SIMULATED early-warning — decision support, not a guaranteed prediction.",
    }
