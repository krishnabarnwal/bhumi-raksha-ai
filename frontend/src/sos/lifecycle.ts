// Responder status lifecycle — pure, deterministic view logic, mirroring the
// backend state machine in app/api/sos.py. No React, no DOM: unit-testable in
// node (see lifecycle.test.ts). The Command Center renders from these helpers so
// it can never offer an invalid action or a backwards step.

import type { Assignment, ResponderStatus } from "../types";

// The forward-only flow. Index order == progression order.
export const RESPONDER_FLOW: ResponderStatus[] = [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "EN_ROUTE",
  "ON_SITE",
  "RESOLVED",
];

// Human labels for each state (the checklist rows).
export const STATUS_LABEL: Record<ResponderStatus, string> = {
  ASSIGNED: "Assigned",
  ACKNOWLEDGED: "Acknowledged",
  EN_ROUTE: "En route",
  ON_SITE: "On site",
  RESOLVED: "Resolved",
};

// The button label to advance FROM a given state (null for the terminal state).
const ACTION_LABEL: Record<ResponderStatus, string | null> = {
  ASSIGNED: "Acknowledge",
  ACKNOWLEDGED: "Mark en route",
  EN_ROUTE: "Mark on site",
  ON_SITE: "Resolve incident",
  RESOLVED: null,
};

// The timestamp field on the assignment that records when each state was reached.
const TS_FIELD: Record<ResponderStatus, keyof Assignment> = {
  ASSIGNED: "assigned_at",
  ACKNOWLEDGED: "acknowledged_at",
  EN_ROUTE: "en_route_at",
  ON_SITE: "on_site_at",
  RESOLVED: "resolved_at",
};

// Current responder status, defaulting a legacy/missing value to ASSIGNED.
export function currentStatus(a: Assignment | null | undefined): ResponderStatus {
  const s = a?.status;
  return s && RESPONDER_FLOW.includes(s) ? s : "ASSIGNED";
}

// The single legal successor of a state, or null at the terminal state.
export function nextStatus(cur: ResponderStatus): ResponderStatus | null {
  const i = RESPONDER_FLOW.indexOf(cur);
  return i >= 0 && i < RESPONDER_FLOW.length - 1 ? RESPONDER_FLOW[i + 1] : null;
}

export interface NextAction {
  target: ResponderStatus;
  label: string;
}

// The one action a responder may take next — or null when RESOLVED. Only ever
// exposes a single forward step, so an invalid action can't be offered.
export function nextAction(a: Assignment | null | undefined): NextAction | null {
  const cur = currentStatus(a);
  const target = nextStatus(cur);
  const label = ACTION_LABEL[cur];
  return target && label ? { target, label } : null;
}

export type StepState = "done" | "current" | "upcoming";

export interface LifecycleStep {
  status: ResponderStatus;
  label: string;
  state: StepState;
  at: string | null; // ISO timestamp if this step has been reached
}

// The full 5-row checklist with per-step state and timestamp. "done"/"current"
// steps have been reached (rendered with a ✓); "upcoming" steps have not (○).
export function lifecycleSteps(a: Assignment | null | undefined): LifecycleStep[] {
  const curIdx = RESPONDER_FLOW.indexOf(currentStatus(a));
  return RESPONDER_FLOW.map((status, i) => {
    const at = a ? ((a[TS_FIELD[status]] as string | undefined) ?? null) : null;
    const state: StepState = i < curIdx ? "done" : i === curIdx ? "current" : "upcoming";
    return { status, label: STATUS_LABEL[status], state, at };
  });
}

export interface TimelineEntry {
  status: ResponderStatus;
  text: string;
  at: string | null;
}

// A short phrase for the audit timeline (one line per reached state).
function auditText(status: ResponderStatus, team: string): string {
  switch (status) {
    case "ASSIGNED":
      return `Assigned to ${team}`;
    case "ACKNOWLEDGED":
      return `${team} acknowledged`;
    case "EN_ROUTE":
      return `${team} en route`;
    case "ON_SITE":
      return `${team} arrived on site`;
    case "RESOLVED":
      return "Incident resolved";
  }
}

// The audit trail: only the states actually reached, oldest-first, each with the
// server-stamped time it happened. Derived entirely from the assignment data —
// no separate history subsystem.
export function timeline(a: Assignment | null | undefined): TimelineEntry[] {
  if (!a) return [];
  const team = a.team_name || "Team";
  const curIdx = RESPONDER_FLOW.indexOf(currentStatus(a));
  return RESPONDER_FLOW.slice(0, curIdx + 1).map((status) => ({
    status,
    text: auditText(status, team),
    at: (a[TS_FIELD[status]] as string | undefined) ?? null,
  }));
}
