// Unit tests for the pure command-center metrics aggregation (no browser).
// Proves the dashboard counts mirror the lifecycle state machine and that the
// response-time analytics are computed only from real timestamps (never faked,
// "—" when insufficient).

import { describe, expect, it } from "vitest";
import type { Assignment, SosFeature, SosProperties } from "../types";
import {
  commandMetrics,
  formatDuration,
  responseAnalytics,
} from "./metrics";

// Minimal SOS feature builder — only the fields the metrics read matter; the
// rest carry harmless defaults.
function feat(overrides: Partial<SosProperties> = {}): SosFeature {
  const properties = {
    id: 1,
    category: "sos",
    status: "pending",
    created_at: "2026-08-24T06:00:00+00:00",
    reporter_type: "citizen",
    description: null,
    source: "citizen_app",
    people_affected: 0,
    trapped: false,
    medical: false,
    severity: "high",
    priority: "P3",
    priority_score: 50,
    priority_factors: [],
    priority_floored: false,
    needs: [],
    risk: null,
    recommendation: null,
    response_routing: undefined,
    escalation: null,
    assignment: null,
    lat: 27.6,
    lon: 88.6,
    is_simulated: true,
    ...overrides,
  } as unknown as SosProperties;
  return { type: "Feature", geometry: null, properties };
}

const assign = (extra: Partial<Assignment> = {}): Assignment => ({
  team_id: "team-b",
  team_name: "Team B",
  kind: "medical",
  assigned_at: "2026-08-24T06:00:00+00:00",
  status: "ASSIGNED",
  ...extra,
});

describe("commandMetrics — headline counts", () => {
  it("is all zeros for an empty feed", () => {
    expect(commandMetrics([])).toEqual({
      total: 0,
      critical: 0,
      pending: 0,
      active: 0,
      resolved: 0,
    });
  });

  it("classifies pending / active / resolved and counts P1 as critical", () => {
    const feats = [
      feat({ id: 1, status: "pending", priority: "P1" }), // pending + critical
      feat({ id: 2, status: "assigned", priority: "P2", assignment: assign({ status: "EN_ROUTE" }) }), // active
      feat({
        id: 3,
        status: "assigned",
        priority: "P1",
        assignment: assign({ status: "RESOLVED", resolved_at: "2026-08-24T06:05:00+00:00" }),
      }), // resolved + critical
      feat({ id: 4, status: "pending", priority: "P3" }), // pending
    ];
    expect(commandMetrics(feats)).toEqual({
      total: 4,
      critical: 2,
      pending: 2,
      active: 1,
      resolved: 1,
    });
  });

  it("treats an assigned incident with no explicit lifecycle status as active (legacy-safe)", () => {
    const feats = [feat({ id: 9, status: "assigned", assignment: assign({ status: undefined }) })];
    const m = commandMetrics(feats);
    expect(m.active).toBe(1);
    expect(m.resolved).toBe(0);
  });

  it("keeps pending/active/resolved mutually exclusive and summing to total", () => {
    const feats = [
      feat({ id: 1, status: "pending" }),
      feat({ id: 2, status: "assigned", assignment: assign({ status: "ON_SITE" }) }),
      feat({ id: 3, status: "assigned", assignment: assign({ status: "RESOLVED" }) }),
    ];
    const m = commandMetrics(feats);
    expect(m.pending + m.active + m.resolved).toBe(m.total);
  });
});

describe("responseAnalytics — real timestamps only", () => {
  it("returns null averages (0 samples) when nothing is assigned", () => {
    const a = responseAnalytics([feat(), feat({ id: 2 })]);
    expect(a.acknowledge).toEqual({ avgMs: null, samples: 0 });
    expect(a.onSite).toEqual({ avgMs: null, samples: 0 });
    expect(a.resolve).toEqual({ avgMs: null, samples: 0 });
  });

  it("averages acknowledge / on-site / resolve across incidents that have the stamps", () => {
    const feats = [
      feat({
        id: 1,
        status: "assigned",
        assignment: assign({
          status: "RESOLVED",
          acknowledged_at: "2026-08-24T06:00:30+00:00", // +30s
          on_site_at: "2026-08-24T06:02:00+00:00", // +120s
          resolved_at: "2026-08-24T06:05:00+00:00", // +300s
        }),
      }),
      feat({
        id: 2,
        status: "assigned",
        assignment: assign({
          status: "RESOLVED",
          acknowledged_at: "2026-08-24T06:01:30+00:00", // +90s
          on_site_at: "2026-08-24T06:04:00+00:00", // +240s
          resolved_at: "2026-08-24T06:10:00+00:00", // +600s
        }),
      }),
    ];
    const a = responseAnalytics(feats);
    expect(a.acknowledge).toEqual({ avgMs: 60_000, samples: 2 }); // (30+90)/2 = 60s
    expect(a.onSite).toEqual({ avgMs: 180_000, samples: 2 }); // (120+240)/2 = 180s
    expect(a.resolve).toEqual({ avgMs: 450_000, samples: 2 }); // (300+600)/2 = 450s
  });

  it("samples only the stamps that exist (partial lifecycle)", () => {
    const feats = [
      feat({
        id: 1,
        status: "assigned",
        assignment: assign({ status: "ACKNOWLEDGED", acknowledged_at: "2026-08-24T06:00:20+00:00" }),
      }),
    ];
    const a = responseAnalytics(feats);
    expect(a.acknowledge).toEqual({ avgMs: 20_000, samples: 1 });
    expect(a.onSite).toEqual({ avgMs: null, samples: 0 });
    expect(a.resolve).toEqual({ avgMs: null, samples: 0 });
  });

  it("ignores out-of-order timestamps (never reports a negative response time)", () => {
    const feats = [
      feat({
        id: 1,
        status: "assigned",
        assignment: assign({ acknowledged_at: "2026-08-24T05:59:00+00:00" }), // before assigned_at
      }),
    ];
    expect(responseAnalytics(feats).acknowledge).toEqual({ avgMs: null, samples: 0 });
  });
});

describe("formatDuration", () => {
  it("renders '—' for null (no data)", () => {
    expect(formatDuration(null)).toBe("—");
  });
  it("renders seconds under a minute", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
  });
  it("renders minutes and minutes+seconds", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(200_000)).toBe("3m 20s");
  });
  it("renders hours and hours+minutes", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_900_000)).toBe("1h 5m");
  });
});
