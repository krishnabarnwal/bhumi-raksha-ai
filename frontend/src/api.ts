// Thin typed fetch wrappers around the Bhumi-Raksha AI API.
import type {
  AlertsResponse,
  CreateFieldReport,
  Feature,
  FeatureCollection,
  MediaUploadResult,
  PrioritiesResponse,
  RiskResult,
  Scenario,
} from "./types";

const RAW_BASE =
  (import.meta.env as { VITE_API_BASE?: string }).VITE_API_BASE ??
  "http://localhost:8000";
const BASE = RAW_BASE.replace(/\/$/, "");

// Pull a human-readable message out of a failed response (FastAPI puts a
// string in `detail`; pydantic validation errors put an array of {msg}).
async function errorDetail(res: Response, path: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const d = body?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const msgs = d
        .map((item) => (item as { msg?: string })?.msg)
        .filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
  } catch {
    /* body was not JSON */
  }
  return `Request failed: ${path} -> ${res.status}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await errorDetail(res, path));
  return (await res.json()) as T;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorDetail(res, path));
  return (await res.json()) as T;
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  // No explicit Content-Type: the browser sets the multipart boundary.
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorDetail(res, path));
  return (await res.json()) as T;
}

const scenarioQuery = (scenario: Scenario) =>
  scenario && scenario !== "current" ? `?scenario=${scenario}` : "";

export const api = {
  base: BASE,
  zones: (scenario: Scenario = "current") =>
    get<FeatureCollection>(`/api/zones${scenarioQuery(scenario)}`),
  layer: (name: string) => get<FeatureCollection>(`/api/${name}`),
  zoneRisk: (id: number, scenario: Scenario) =>
    get<RiskResult>(`/api/zones/${id}/risk${scenarioQuery(scenario)}`),
  alerts: (scenario: Scenario = "current") =>
    get<AlertsResponse>(`/api/alerts${scenarioQuery(scenario)}`),
  priorities: (scenario: Scenario = "current") =>
    get<PrioritiesResponse>(`/api/priorities${scenarioQuery(scenario)}`),

  // --- field reporting ---
  fieldReports: () => get<FeatureCollection>(`/api/field-reports`),
  createFieldReport: (payload: CreateFieldReport) =>
    postJSON<Feature>(`/api/field-reports`, payload),
  uploadMedia: (reportId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return postForm<MediaUploadResult>(
      `/api/field-reports/${reportId}/media`,
      form,
    );
  },

  // Absolute URL for a media path returned by the API (served by StaticFiles).
  mediaUrl: (path: string) => (path.startsWith("http") ? path : `${BASE}${path}`),
};
