// P2 — device-local "My Reports" log for the Citizen App.
//
// A lightweight, privacy-respecting record of what THIS device has submitted
// (SOS signals and hazard reports), kept in localStorage so a citizen can see
// their own history without any account or extra server round-trip. This is NOT
// the authoritative store — the backend owns the real incidents; this is only a
// local convenience mirror, labelled "Saved on this device" in the UI.
//
// Pure functions + a thin localStorage read/write pair, so the list logic stays
// unit-testable without a browser.

export type MyReportKind = "sos" | "hazard";

export interface MyReport {
  kind: MyReportKind;
  id: string; // server incident id, or a short client id when queued offline
  at: string; // ISO timestamp of the real user action on this device
  labelKey?: string; // i18n key for a hazard's label (re-localised at render)
  priority?: string; // server-assigned SOS priority (P1..P4), when known
  offline?: boolean; // true when the SOS was queued offline (not yet delivered)
}

export const MY_REPORTS_KEY = "bhumi.myreports";
const MAX_REPORTS = 50;

// Prepend the newest entry and cap the list so the log can't grow unbounded.
export function addReport(list: MyReport[], entry: MyReport): MyReport[] {
  return [entry, ...list].slice(0, MAX_REPORTS);
}

function isMyReport(v: unknown): v is MyReport {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (r.kind === "sos" || r.kind === "hazard") &&
    typeof r.id === "string" &&
    typeof r.at === "string"
  );
}

// Defensive parse: tolerate absent/corrupt storage and drop malformed entries
// rather than throwing (a broken log must never break the app).
export function parseReports(raw: string | null): MyReport[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(isMyReport).slice(0, MAX_REPORTS);
}

export function loadReports(): MyReport[] {
  try {
    return typeof localStorage !== "undefined"
      ? parseReports(localStorage.getItem(MY_REPORTS_KEY))
      : [];
  } catch {
    return [];
  }
}

export function saveReports(list: MyReport[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(list));
    }
  } catch {
    /* storage full / unavailable — the log is best-effort */
  }
}
