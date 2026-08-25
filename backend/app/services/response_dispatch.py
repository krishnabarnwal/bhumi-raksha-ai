"""Response routing & escalation — SIMULATED disaster-response dispatcher.

This is the "escalate to the wider response network" step of the command center.
Given a triaged SOS (its priority, its needs and the landslide risk at the
location) it deterministically decides:

- a **recommended response category** (e.g. Disaster Response, Medical /
  Ambulance, Municipal / Field Verification),
- the **escalation network** and reach (district → state → national) that
  category maps to, and
- the DEMO **providers** in that network.

**These are SIMULATED integrations (§9, §18).** There is *no* real connectivity
to NDRF, SDRF, Fire & Rescue, Police, 108 / ambulance, NGO or municipal systems.
Every provider name is suffixed ``(SIMULATED)`` and every payload carries
``is_simulated=True``.

The :class:`ResponseDispatcher` protocol is the **integration seam**: today the
default is :class:`DemoResponseDispatcher`, whose :meth:`dispatch` returns a
simulated acknowledgement and makes *no* network call. A real deployment would
drop in an ``NdrfApiDispatcher`` / ``EmergencyApiDispatcher`` implementing the
same two methods — ``recommend`` (routing logic, likely unchanged) and
``dispatch`` (the actual authenticated agency API call) — with nothing else in
the app needing to change.

Kept free of any database/ORM import so it is unit-testable without Postgres,
exactly like :mod:`app.services.sos_triage`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol, runtime_checkable

# --- response category catalog (DEMO / SIMULATED) ---------------------------


@dataclass(frozen=True)
class ResponseCategory:
    """One class of responder, and the DEMO network/providers it routes to."""

    key: str
    label: str                      # short UI label, e.g. "Disaster Response"
    network: str                    # the (simulated) org network it escalates to
    providers: tuple[str, ...]      # illustrative provider names — all SIMULATED


CATEGORIES: dict[str, ResponseCategory] = {
    "disaster_response": ResponseCategory(
        "disaster_response",
        "Disaster Response",
        "NDRF / SDRF — National & State Disaster Response Force",
        ("NDRF Battalion (SIMULATED)", "Sikkim SDRF (SIMULATED)"),
    ),
    "fire_rescue": ResponseCategory(
        "fire_rescue",
        "Fire & Rescue",
        "State Fire & Emergency Services",
        ("Sikkim Fire & Emergency Services (SIMULATED)",),
    ),
    "police": ResponseCategory(
        "police",
        "Police",
        "State Police / Emergency 112",
        ("District Police Control Room (SIMULATED)",),
    ),
    "medical": ResponseCategory(
        "medical",
        "Medical / Ambulance",
        "108 Emergency Medical Services",
        ("108 Ambulance Service (SIMULATED)", "District Hospital (SIMULATED)"),
    ),
    "relief": ResponseCategory(
        "relief",
        "NGO / Relief",
        "NGO & Relief Network",
        ("District Red Cross (SIMULATED)", "Local Relief NGO (SIMULATED)"),
    ),
    "field_verification": ResponseCategory(
        "field_verification",
        "Municipal / Field Verification",
        "District Administration & Municipal Field Teams",
        ("Block Field Team (SIMULATED)", "Municipal Rapid Assessment (SIMULATED)"),
    ),
}

# Priority tier → how far the incident should be escalated. P1 reaches the
# national network; P2 stays at state level; P3/P4 are handled district/locally.
_ESCALATION_LEVEL: dict[str, str] = {
    "P1": "NATIONAL",
    "P2": "STATE",
    "P3": "DISTRICT",
    "P4": "DISTRICT",
}
_LEVEL_LABEL: dict[str, str] = {
    "NATIONAL": "National response network",
    "STATE": "State response agencies",
    "DISTRICT": "District & local response",
}
_HIGH_RISK = {"CRITICAL", "HIGH"}


def _classify(needs: set[str], display_level: str | None) -> tuple[str, list[str]]:
    """Deterministically map (needs, risk) → (primary category, supporting).

    Rules, in order (fully transparent — no ML/LLM, §10):

    - **Trapped** (``search_rescue``) ⇒ primary **Disaster Response** (extraction
      is the lead capability); add Medical when also a medical case, and Police
      for scene access / crowd & traffic control.
    - **Medical only** ⇒ primary **Medical / Ambulance**; in high landslide risk
      also bring in Disaster Response for a possible technical evacuation.
    - **Neither** (field-verification default) ⇒ in high landslide risk this is a
      developing disaster, so primary **Disaster Response** with a Field
      Verification follow-up; otherwise a routine **Municipal / Field
      Verification** task.
    - **High landslide risk** additionally pulls in **Relief** (shelter/logistics).
    """

    level = (display_level or "").upper()
    high_risk = level in _HIGH_RISK
    supporting: list[str] = []

    if "search_rescue" in needs:
        primary = "disaster_response"
        if "medical" in needs:
            supporting.append("medical")
        supporting.append("police")
    elif "medical" in needs:
        primary = "medical"
        if high_risk:
            supporting.append("disaster_response")
    else:
        if high_risk:
            primary = "disaster_response"
            supporting.append("field_verification")
        else:
            primary = "field_verification"

    if high_risk:
        supporting.append("relief")

    # De-duplicate, preserve order, and never list the primary as supporting.
    seen = {primary}
    ordered: list[str] = []
    for key in supporting:
        if key not in seen:
            ordered.append(key)
            seen.add(key)
    return primary, ordered


def _reason(
    primary: ResponseCategory,
    level: str,
    priority: str | None,
    display_level: str | None,
    needs: set[str],
    supporting: list[ResponseCategory],
) -> str:
    """Human-readable, deterministic explanation of the routing decision."""

    bits: list[str] = []
    if priority:
        bits.append(priority)
    lvl = (display_level or "").upper()
    if lvl in _HIGH_RISK:
        bits.append(f"{lvl.title()} landslide risk")

    if "search_rescue" in needs and "medical" in needs:
        driver = "people trapped and casualties needing medical care"
    elif "search_rescue" in needs:
        driver = "people reported trapped"
    elif "medical" in needs:
        driver = "a medical emergency"
    else:
        driver = "field verification of the reported hazard"

    head = " · ".join(bits) if bits else "SOS"
    text = f"{head} — {driver}. Route to {primary.label} ({_LEVEL_LABEL[level]})."
    if supporting:
        text += " Supporting: " + ", ".join(c.label for c in supporting) + "."
    return text


def recommend_dispatch(
    priority: str | None,
    needs: Iterable[str],
    display_level: str | None,
) -> dict:
    """Recommend a response category + escalation network for a triaged SOS.

    Pure and deterministic (same inputs → same output). Returns a JSON-friendly
    dict; everything is labeled SIMULATED. This is *advice* computed on read — it
    persists nothing. Recording an escalation is :meth:`ResponseDispatcher.dispatch`.
    """

    needs_set = set(needs or [])
    primary_key, supporting_keys = _classify(needs_set, display_level)
    pri = (priority or "").upper()
    level = _ESCALATION_LEVEL.get(pri, "DISTRICT")
    primary = CATEGORIES[primary_key]
    supporting = [CATEGORIES[k] for k in supporting_keys]

    return {
        "primary_category": {"key": primary.key, "label": primary.label},
        "escalation_network": primary.network,
        "escalation_level": level,
        "escalation_level_label": _LEVEL_LABEL[level],
        "providers": list(primary.providers),
        "supporting": [
            {"key": c.key, "label": c.label, "network": c.network} for c in supporting
        ],
        "reason": _reason(primary, level, pri or None, display_level, needs_set, supporting),
        "is_simulated": True,
    }


# --- the dispatcher seam ----------------------------------------------------


@runtime_checkable
class ResponseDispatcher(Protocol):
    """The seam a real agency-API client would implement.

    ``recommend`` is the routing brain (deterministic, likely reused as-is);
    ``dispatch`` is the side-effecting hand-off — in a real system an
    authenticated POST to NDRF / 108 / municipal APIs, here a SIMULATION.
    """

    name: str

    def recommend(
        self, *, priority: str | None, needs: Iterable[str], display_level: str | None
    ) -> dict: ...

    def dispatch(self, *, incident_id: int, recommendation: dict) -> dict: ...


class DemoResponseDispatcher:
    """Default dispatcher — SIMULATED, makes no external network calls.

    :meth:`dispatch` returns a simulated acknowledgement so the demo can show an
    incident being handed to the response network, while being completely honest
    that no real agency was contacted. Swap this class for a real API client
    (same interface) to go live — nothing else in the app changes.
    """

    name = "demo"

    def recommend(
        self, *, priority: str | None, needs: Iterable[str], display_level: str | None
    ) -> dict:
        return recommend_dispatch(priority, needs, display_level)

    def dispatch(self, *, incident_id: int, recommendation: dict) -> dict:
        # A real dispatcher would perform an authenticated call to the agency API
        # here and return its acknowledgement. This is a simulation only.
        network = recommendation.get("escalation_network", "response network")
        return {
            "accepted": True,
            "reference": f"SIM-{incident_id}",
            "dispatcher": self.name,
            "network": network,
            "is_simulated": True,
            "note": "Simulated acknowledgement — no real agency was contacted.",
        }


_DISPATCHER: ResponseDispatcher = DemoResponseDispatcher()


def get_dispatcher() -> ResponseDispatcher:
    """Return the active response dispatcher (the DEMO one by default)."""

    return _DISPATCHER
