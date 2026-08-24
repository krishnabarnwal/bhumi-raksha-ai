"""DEMO response resources — a small, clearly-labeled set of emergency teams.

These are **SIMULATED / DEMONSTRATION** resources (§9, §18): they are NOT real
NDRF, SDRF, NGO or government units, and their positions are illustrative. The
dataset lives in code (not the database) because it is fixed demo scaffolding,
not user/field data — keeping it here avoids a schema change and keeps the seed
focused on the risk domain. Every serialized record carries ``is_simulated``.

Capabilities vocabulary (matched against an SOS incident's ``needs`` in
:mod:`app.services.sos_triage`):

    search_rescue      — extraction of trapped / stranded people
    medical            — on-site medical / casualty care
    field_verification — assess and confirm ground conditions
    relief             — shelter, food, water, logistics
    engineering        — debris / road clearing, slope stabilization

Positions are chosen so the recommender must weigh *capability* and
*availability*, not merely distance: for a trapped+medical SOS in the north
(Chungthang), the nearest team (Team C, field verification, based at Mangan)
cannot perform the rescue, so Team B (medical + rescue, Gangtok) is the correct
recommendation even though it is farther away.
"""

from __future__ import annotations

from dataclasses import dataclass

# Human-readable labels for the capability slugs (used to build reasons/UI).
CAPABILITY_LABELS: dict[str, str] = {
    "search_rescue": "search & rescue",
    "medical": "medical",
    "field_verification": "field verification",
    "relief": "relief",
    "engineering": "engineering",
}


@dataclass(frozen=True)
class ResponseResource:
    """One simulated emergency-response team."""

    id: str
    name: str
    kind: str                       # short human label of the team's role
    capabilities: tuple[str, ...]
    base: str                       # home-base settlement (illustrative)
    lat: float
    lon: float
    available: bool                 # False = currently committed elsewhere
    status: str                     # "available" | "deployed" | "standby"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "capabilities": list(self.capabilities),
            "base": self.base,
            "lat": self.lat,
            "lon": self.lon,
            "available": self.available,
            "status": self.status,
            "is_simulated": True,
        }


DEMO_RESPONSE_RESOURCES: tuple[ResponseResource, ...] = (
    ResponseResource(
        id="team-a",
        name="Team A · Search & Rescue",
        kind="Search & Rescue",
        capabilities=("search_rescue",),
        base="Singtam",
        lat=27.235,
        lon=88.500,
        available=True,
        status="available",
    ),
    ResponseResource(
        id="team-b",
        name="Team B · Medical & Rescue",
        kind="Medical + Search & Rescue",
        capabilities=("medical", "search_rescue"),
        base="Gangtok",
        lat=27.335,
        lon=88.612,
        available=True,
        status="available",
    ),
    ResponseResource(
        id="team-c",
        name="Team C · Field Verification",
        kind="Field Verification",
        capabilities=("field_verification",),
        base="Mangan",
        lat=27.510,
        lon=88.530,
        available=True,
        status="available",
    ),
    ResponseResource(
        id="team-d",
        name="Team D · Local Relief",
        kind="Local Relief",
        capabilities=("relief",),
        base="Namchi",
        lat=27.170,
        lon=88.360,
        available=True,
        status="available",
    ),
    ResponseResource(
        id="team-e",
        name="Team E · Engineering / Road Clearing",
        kind="Engineering / Road Clearing",
        capabilities=("engineering", "search_rescue"),
        base="Rangpo",
        lat=27.170,
        lon=88.530,
        available=False,          # committed elsewhere — recommender must skip it
        status="deployed",
    ),
)


def capability_label(slug: str) -> str:
    return CAPABILITY_LABELS.get(slug, slug.replace("_", " "))


def all_resources() -> list[ResponseResource]:
    return list(DEMO_RESPONSE_RESOURCES)


def available_resources() -> list[ResponseResource]:
    return [r for r in DEMO_RESPONSE_RESOURCES if r.available]


def get_resource(resource_id: str) -> ResponseResource | None:
    for resource in DEMO_RESPONSE_RESOURCES:
        if resource.id == resource_id:
            return resource
    return None
