// Command-center metrics — pure, deterministic aggregation over the live SOS
// feed. No React, no DOM: unit-testable in node (see metrics.test.ts). Counts
// mirror the lifecycle state machine so the dashboard can never disagree with
// the incident panel. Response-time analytics are computed ONLY from real
// server-stamped assignment timestamps — never fabricated (returns null +
// sample=0 when there is not enough data, which the UI renders as "—").

import type { Assignment, SosFeature } from "../types";
import { currentStatus } from "./lifecycle";

// The five headline counts shown in the metrics bar.
export interface CommandMetrics {
  total: number; // all SOS incidents in the feed
  critical: number; // P1 incidents (highest AI priority tier)
  pending: number; // awaiting team assignment
  active: number; // assigned + in the responder lifecycle, not yet resolved
  resolved: number; // responder lifecycle reached RESOLVED
}

// An average duration plus the number of incidents it was averaged over. A null
// average (sample 0) means "not enough real data" — shown as "—", never faked.
export interface DurationStat {
  avgMs: number | null;
  samples: number;
}

// Response-time analytics, each measured from the assignment instant using the
// server-generated lifecycle timestamps.
export interface ResponseAnalytics {
  acknowledge: DurationStat; // assigned → acknowledged
  onSite: DurationStat; // assigned → on site
  resolve: DurationStat; // assigned → resolved
}

// The five headline counts. `pending`/`active`/`resolved` are mutually exclusive
// and sum to `total`; `critical` cross-cuts them (a P1 can be pending or active).
export function commandMetrics(features: SosFeature[]): CommandMetrics {
  let critical = 0;
  let pending = 0;
  let active = 0;
  let resolved = 0;

  for (const f of features) {
    const p = f.properties;
    if (p.priority === "P1") critical += 1;

    if (p.status === "pending") {
      pending += 1;
    } else if (currentStatus(p.assignment) === "RESOLVED") {
      resolved += 1;
    } else {
      // assigned and somewhere in ASSIGNED…ON_SITE — an open, worked incident.
      active += 1;
    }
  }

  return { total: features.length, critical, pending, active, resolved };
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

// Elapsed ms between two lifecycle stamps, or null if either is missing/invalid
// or the pair is out of order (guards against clock skew — we never show a
// negative response time).
function duration(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const a = parseTime(from);
  const b = parseTime(to);
  if (a == null || b == null) return null;
  const d = b - a;
  return d >= 0 ? d : null;
}

function mean(values: number[]): DurationStat {
  if (values.length === 0) return { avgMs: null, samples: 0 };
  const sum = values.reduce((acc, v) => acc + v, 0);
  return { avgMs: sum / values.length, samples: values.length };
}

// Average acknowledge / on-site / resolve times across every incident that has
// the required real timestamps. Incidents without them are simply not sampled.
export function responseAnalytics(features: SosFeature[]): ResponseAnalytics {
  const ack: number[] = [];
  const onSite: number[] = [];
  const resolve: number[] = [];

  for (const f of features) {
    const a: Assignment | null = f.properties.assignment;
    if (!a) continue;
    const dAck = duration(a.assigned_at, a.acknowledged_at);
    if (dAck != null) ack.push(dAck);
    const dSite = duration(a.assigned_at, a.on_site_at);
    if (dSite != null) onSite.push(dSite);
    const dRes = duration(a.assigned_at, a.resolved_at);
    if (dRes != null) resolve.push(dRes);
  }

  return { acknowledge: mean(ack), onSite: mean(onSite), resolve: mean(resolve) };
}

// Compact human duration: "45s", "3m", "3m 20s", "1h 5m". "—" when null (no
// real data). Rounds to whole seconds — never invents sub-second precision.
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${hr}h ${m}m` : `${hr}h`;
}
