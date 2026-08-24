"""SOS triage — deterministic, explainable priority + response recommendation.

Two pure functions power the emergency-response loop; both are fully
transparent and reproducible (same inputs → same output), NOT an ML/LLM model
(§10), and never emit a "guaranteed" claim (§5):

- :func:`sos_priority` turns the current landslide risk at the incident plus the
  citizen-reported attributes (trapped / medical / people affected) into a P1–P4
  tier with a per-factor point breakdown, so a command-center user can see
  *why* an incident is P1.
- :func:`recommend_response` picks the best available team for the incident's
  needs — weighing capability match and availability first, then proximity, so
  it is explicitly **not** "just the nearest team" (§6). Distance is a
  deterministic great-circle **estimated distance** (haversine), never a faked
  travel-time ETA (§5).

Kept free of any database/ORM import so it is unit-testable without Postgres.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

from app.services.response_resources import ResponseResource, capability_label

# --- points model (transparent; every point is attributable to a factor) ------

# Risk at the incident location, by display level.
RISK_POINTS: dict[str, int] = {"CRITICAL": 40, "HIGH": 30, "MODERATE": 15, "LOW": 5}
RISK_POINTS_UNKNOWN = 10  # location outside the monitored demo region

SOS_BASE_POINTS = 10       # an active citizen SOS is inherently life-safety
TRAPPED_POINTS = 30
MEDICAL_POINTS = 20
PER_PERSON_POINTS = 2
MAX_PERSON_POINTS = 20     # caps the "people affected" contribution (10+ people)

# Tier thresholds on the capped 0–100 score.
_TIER_THRESHOLDS = ((70, "P1"), (45, "P2"), (25, "P3"))
FLOOR_TIER = "P3"          # an active SOS is never triaged below this
_TIER_ORDER = {"P1": 1, "P2": 2, "P3": 3, "P4": 4}


@dataclass
class SosAttrs:
    """Citizen-reported SOS attributes. All optional — an SOS scores without them."""

    people_affected: int = 0
    trapped: bool = False
    medical: bool = False


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two WGS84 points (deterministic)."""

    radius_km = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return radius_km * 2 * math.asin(math.sqrt(a))


def _tier_for_score(score: float) -> str:
    for threshold, tier in _TIER_THRESHOLDS:
        if score >= threshold:
            return tier
    return "P4"


def sos_priority(display_level: str | None, attrs: SosAttrs) -> dict:
    """Compute an explainable P1–P4 priority for an SOS incident.

    Returns ``{priority, score, factors, needs, floored}`` where ``factors`` is
    an ordered list of ``{label, points}`` that sums to the (pre-cap) score, so
    the command center can show exactly why an incident ranks where it does.
    """

    level = (display_level or "").upper()
    factors: list[dict] = []

    if level in RISK_POINTS:
        risk_pts = RISK_POINTS[level]
        factors.append({"label": f"{level.title()} landslide risk at location", "points": risk_pts})
    else:
        risk_pts = RISK_POINTS_UNKNOWN
        factors.append({"label": "Risk unknown (outside monitored region)", "points": risk_pts})

    factors.append({"label": "Active citizen SOS (life-safety)", "points": SOS_BASE_POINTS})
    total = risk_pts + SOS_BASE_POINTS

    if attrs.trapped:
        factors.append({"label": "People reported trapped", "points": TRAPPED_POINTS})
        total += TRAPPED_POINTS
    if attrs.medical:
        factors.append({"label": "Medical emergency reported", "points": MEDICAL_POINTS})
        total += MEDICAL_POINTS
    if attrs.people_affected and attrs.people_affected > 0:
        pts = min(attrs.people_affected * PER_PERSON_POINTS, MAX_PERSON_POINTS)
        label = f"{attrs.people_affected} people affected"
        factors.append({"label": label, "points": pts})
        total += pts

    score = min(total, 100)
    tier = _tier_for_score(score)

    # Life-safety floor: an active SOS always warrants at least a field response.
    floored = False
    if _TIER_ORDER[tier] > _TIER_ORDER[FLOOR_TIER]:
        tier = FLOOR_TIER
        floored = True
        factors.append({"label": "Life-safety floor (active SOS ⇒ min P3)", "points": 0})

    needs: list[str] = []
    if attrs.trapped:
        needs.append("search_rescue")
    if attrs.medical:
        needs.append("medical")
    if not needs:
        needs.append("field_verification")

    return {
        "priority": tier,
        "score": score,
        "factors": factors,
        "needs": needs,
        "floored": floored,
    }


def _caps_phrase(slugs: Iterable[str]) -> str:
    labels = [capability_label(s) for s in slugs]
    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    return f"{', '.join(labels[:-1])} and {labels[-1]}"


def recommend_response(
    resources: Iterable[ResponseResource],
    lat: float,
    lon: float,
    needs: Iterable[str],
    priority: str | None = None,
) -> dict | None:
    """Recommend the best available team for an incident.

    Selection order: highest capability coverage of ``needs`` first, then
    shortest estimated distance. This deliberately lets a capable-but-farther
    team beat a nearer team that cannot do the job. Returns ``None`` when no team
    is available (honest — we do not invent capacity).
    """

    needs_set = list(dict.fromkeys(needs))  # de-dup, preserve order
    need_keys = set(needs_set)

    candidates = []
    for resource in resources:
        if not resource.available:
            continue
        covered = need_keys & set(resource.capabilities)
        coverage = (len(covered) / len(need_keys)) if need_keys else 0.0
        distance = haversine_km(lat, lon, resource.lat, resource.lon)
        candidates.append((coverage, distance, resource, covered))

    if not candidates:
        return None

    candidates.sort(key=lambda item: (-item[0], item[1]))
    coverage, distance, best, covered = candidates[0]
    nearest = min(candidates, key=lambda item: item[1])[2]

    matched = [s for s in needs_set if s in covered]
    unmet = [s for s in needs_set if s not in covered]
    prioritized_over_nearest = best.id != nearest.id and coverage > 0

    reason = _build_reason(best, coverage, distance, matched, unmet, prioritized_over_nearest, nearest)

    return {
        "team_id": best.id,
        "team_name": best.name,
        "kind": best.kind,
        "capabilities": list(best.capabilities),
        "capability_match": matched,
        "unmet_needs": unmet,
        "coverage": round(coverage, 2),
        "distance_km": round(distance, 1),
        "status": best.status,
        "base": best.base,
        "lat": best.lat,
        "lon": best.lon,
        "reason": reason,
        "is_simulated": True,
    }


def _build_reason(
    best: ResponseResource,
    coverage: float,
    distance: float,
    matched: list[str],
    unmet: list[str],
    prioritized_over_nearest: bool,
    nearest: ResponseResource,
) -> str:
    dist = f"~{round(distance, 1)} km (estimated distance)"
    if coverage >= 1.0:
        reason = f"Available team covering the required {_caps_phrase(matched)} capability, {dist}."
    elif coverage > 0.0:
        reason = (
            f"Nearest available team with partial capability ({_caps_phrase(matched)}); "
            f"{_caps_phrase(unmet)} still needs tasking, {dist}."
        )
    else:
        reason = f"No available team matches the required capability; nearest team tasked for triage, {dist}."

    if prioritized_over_nearest:
        reason += f" Chosen over the closer {nearest.name} because it matches the incident's needs."
    return reason
