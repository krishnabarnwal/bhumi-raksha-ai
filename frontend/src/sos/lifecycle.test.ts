// Unit tests for the pure responder-lifecycle view logic (no browser). Proves
// the Command Center is fed the correct action, checklist and audit trail for
// every state — and that an invalid/backwards action is never offered.

import { describe, expect, it } from "vitest";
import type { Assignment } from "../types";
import {
  currentStatus,
  lifecycleSteps,
  nextAction,
  nextStatus,
  RESPONDER_FLOW,
  timeline,
} from "./lifecycle";

const base: Assignment = {
  team_id: "team-b",
  team_name: "Team B",
  kind: "medical",
  assigned_at: "2026-08-24T06:00:00+00:00",
};

const at = (status: Assignment["status"], extra: Partial<Assignment> = {}): Assignment => ({
  ...base,
  status,
  ...extra,
});

describe("currentStatus", () => {
  it("defaults a missing/legacy assignment to ASSIGNED", () => {
    expect(currentStatus(null)).toBe("ASSIGNED");
    expect(currentStatus(undefined)).toBe("ASSIGNED");
    expect(currentStatus(base)).toBe("ASSIGNED"); // no status field
  });
  it("returns the set status", () => {
    expect(currentStatus(at("EN_ROUTE"))).toBe("EN_ROUTE");
  });
});

describe("nextStatus", () => {
  it("advances one step along the flow", () => {
    expect(nextStatus("ASSIGNED")).toBe("ACKNOWLEDGED");
    expect(nextStatus("ACKNOWLEDGED")).toBe("EN_ROUTE");
    expect(nextStatus("EN_ROUTE")).toBe("ON_SITE");
    expect(nextStatus("ON_SITE")).toBe("RESOLVED");
  });
  it("has no successor for the terminal state", () => {
    expect(nextStatus("RESOLVED")).toBeNull();
  });
});

describe("nextAction — the one action a responder may take", () => {
  it("offers exactly the correct next action for each state", () => {
    expect(nextAction(at("ASSIGNED"))).toEqual({ target: "ACKNOWLEDGED", label: "Acknowledge" });
    expect(nextAction(at("ACKNOWLEDGED"))).toEqual({ target: "EN_ROUTE", label: "Mark en route" });
    expect(nextAction(at("EN_ROUTE"))).toEqual({ target: "ON_SITE", label: "Mark on site" });
    expect(nextAction(at("ON_SITE"))).toEqual({ target: "RESOLVED", label: "Resolve incident" });
  });
  it("offers NO action once resolved (invalid actions are never shown)", () => {
    expect(nextAction(at("RESOLVED"))).toBeNull();
  });
  it("treats a legacy assignment (no status) as ASSIGNED", () => {
    expect(nextAction(base)).toEqual({ target: "ACKNOWLEDGED", label: "Acknowledge" });
  });
});

describe("lifecycleSteps — the checklist", () => {
  it("marks reached steps done/current and the rest upcoming", () => {
    const steps = lifecycleSteps(
      at("EN_ROUTE", {
        acknowledged_at: "2026-08-24T06:05:00+00:00",
        en_route_at: "2026-08-24T06:10:00+00:00",
      }),
    );
    expect(steps.map((s) => s.state)).toEqual([
      "done", // ASSIGNED
      "done", // ACKNOWLEDGED
      "current", // EN_ROUTE
      "upcoming", // ON_SITE
      "upcoming", // RESOLVED
    ]);
    // Reached steps carry their timestamp; upcoming steps do not.
    expect(steps[0].at).toBe("2026-08-24T06:00:00+00:00");
    expect(steps[2].at).toBe("2026-08-24T06:10:00+00:00");
    expect(steps[3].at).toBeNull();
  });
  it("renders a fresh ASSIGNED incident with only the first step current", () => {
    const steps = lifecycleSteps(at("ASSIGNED"));
    expect(steps.map((s) => s.state)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });
  it("shows every step reached when resolved (resolved state renders correctly)", () => {
    const steps = lifecycleSteps(
      at("RESOLVED", {
        acknowledged_at: "2026-08-24T06:05:00+00:00",
        en_route_at: "2026-08-24T06:10:00+00:00",
        on_site_at: "2026-08-24T06:20:00+00:00",
        resolved_at: "2026-08-24T06:40:00+00:00",
      }),
    );
    expect(steps.filter((s) => s.state === "upcoming")).toHaveLength(0);
    expect(steps[4].state).toBe("current"); // RESOLVED is the terminal current
    expect(steps.every((s) => s.at)).toBe(true);
    expect(nextAction(at("RESOLVED"))).toBeNull(); // and no further action
  });
});

describe("timeline — the audit trail", () => {
  it("lists only reached states, oldest-first, with server timestamps", () => {
    const entries = timeline(
      at("EN_ROUTE", {
        acknowledged_at: "2026-08-24T06:05:00+00:00",
        en_route_at: "2026-08-24T06:10:00+00:00",
      }),
    );
    expect(entries.map((e) => e.status)).toEqual(["ASSIGNED", "ACKNOWLEDGED", "EN_ROUTE"]);
    expect(entries[0].text).toBe("Assigned to Team B");
    expect(entries[2].text).toBe("Team B en route");
    expect(entries[2].at).toBe("2026-08-24T06:10:00+00:00");
  });
  it("is empty when there is no assignment", () => {
    expect(timeline(null)).toEqual([]);
  });
});

describe("RESPONDER_FLOW", () => {
  it("is the canonical forward-only order", () => {
    expect(RESPONDER_FLOW).toEqual([
      "ASSIGNED",
      "ACKNOWLEDGED",
      "EN_ROUTE",
      "ON_SITE",
      "RESOLVED",
    ]);
  });
});
