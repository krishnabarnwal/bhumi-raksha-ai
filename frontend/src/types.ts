// Shared types for the Bhumi-Raksha AI dashboard API.

export type DisplayLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type Scenario = "current" | "normal" | "heavy" | "extreme";

export interface RiskFactor {
  key: string;
  name: string;
  value: number;
  unit: string;
  normalized: number;
  weight: number;
  contribution: number;
  impact: "LOW" | "MEDIUM" | "HIGH";
}

export interface RiskResult {
  risk_score: number;
  risk_level: string;
  display_level: DisplayLevel;
  confidence: number;
  factors: RiskFactor[];
  is_simulated: boolean;
  model_version: string;
  computed_at: string;
  recommended_action: string;
  disclaimer: string;
  zone?: {
    id: number;
    name: string;
    district_id: number | null;
    area_km2: number | null;
  };
  scenario?: string;
  color?: string;
}

export interface Alert {
  zone_id: number;
  title: string;
  location: string;
  severity: string;
  display_level: DisplayLevel;
  risk_score: number | null;
  reason: string;
  affected: {
    population: number;
    villages: string[];
    infrastructure: string[];
    roads: string[];
  };
  recommended_action: string;
  is_simulated: boolean;
}

export interface AlertsResponse {
  count: number;
  alerts: Alert[];
  disclaimer: string;
}

// --- field reporting (P1) ---
export type FieldReportCategory =
  | "slope_crack"
  | "road_blockage"
  | "rockfall"
  | "water_seepage"
  | "slope_movement"
  | "landslide"
  | "flood"
  | "other";

export interface CreateFieldReport {
  lat: number;
  lon: number;
  category: FieldReportCategory;
  description?: string;
  severity?: string;
  reporter_type?: string;
  client_uuid?: string;
}

export interface MediaUploadResult {
  id: number;
  field_report_id: number;
  url: string;
  content_type: string;
  size_bytes: number;
}

// --- response prioritization (P1) ---
export type PriorityTier = "P1" | "P2" | "P3" | "P4";

export interface Priority {
  rank: number;
  zone_id: number;
  zone: string;
  priority: PriorityTier;
  priority_index: number;
  risk_score: number;
  risk_level: string;
  display_level: DisplayLevel;
  color: string;
  population_affected: number;
  villages: number;
  infrastructure: number;
  roads: number;
  recommended_action: string;
}

export interface PrioritiesResponse {
  scenario: string;
  count: number;
  priorities: Priority[];
  disclaimer: string;
}

// --- emergency SOS (F1–F6) ---
// The RISK → WARNING → SOS → INCIDENT → PRIORITY → RESPONSE loop. Priority is a
// deterministic, explainable score (not ML); teams are DEMO/SIMULATED; distance
// is an "estimated distance" (haversine), never a faked ETA.
export type SosPriority = "P1" | "P2" | "P3" | "P4";
export type Capability =
  | "search_rescue"
  | "medical"
  | "field_verification"
  | "relief"
  | "engineering";
export type SafetyStatus = "danger" | "caution" | "safe" | "unknown";

// One transparent line of the priority breakdown ("People reported trapped" +30).
export interface PriorityFactor {
  label: string;
  points: number;
}

// Citizen-facing safety copy for a point (from GET /api/risk-at).
export interface SafetySummary {
  status: SafetyStatus;
  headline: string;
  instruction: string;
}

// Risk at an SOS point: a RiskResult plus the zone locator fields the SOS
// compute path attaches. `null` when the point has no usable risk data.
export interface SosRisk extends RiskResult {
  zone_id: number;
  zone_name: string;
  in_region: boolean;
  distance_km: number;
}

// GET /api/risk-at — RiskResult + zone locator + citizen safety summary.
export interface RiskAtResult extends RiskResult {
  zone_id: number;
  zone_name: string;
  in_region: boolean;
  distance_km: number;
  scenario: string;
  lat: number;
  lon: number;
  safety: SafetySummary;
}

// A DEMO/SIMULATED response team (GET /api/response-resources).
export interface ResponseResource {
  id: string;
  name: string;
  kind: string;
  capabilities: Capability[];
  base: string;
  lat: number;
  lon: number;
  available: boolean;
  status: string;
  is_simulated: boolean;
}

export interface ResponseResourcesResponse {
  count: number;
  available: number;
  resources: ResponseResource[];
  disclaimer: string;
}

// The recommended team for an incident — capability-matched first, then nearest.
export interface Recommendation {
  team_id: string;
  team_name: string;
  kind: string;
  capabilities: Capability[];
  capability_match: Capability[];
  unmet_needs: Capability[];
  coverage: number;
  distance_km: number;
  status: string;
  base: string;
  lat: number;
  lon: number;
  reason: string;
  is_simulated: boolean;
}

// The team the command center has assigned (after POST /api/sos/{id}/assign).
export interface Assignment {
  team_id: string;
  team_name: string;
  kind: string;
  assigned_at: string;
}

// Properties on every SOS GeoJSON feature (GET/POST /api/sos).
export interface SosProperties {
  id: number;
  category: "sos";
  status: string;
  created_at: string;
  reporter_type: string;
  description: string | null;
  source: string;
  people_affected: number;
  trapped: boolean;
  medical: boolean;
  severity: string;
  priority: SosPriority;
  priority_score: number;
  priority_factors: PriorityFactor[];
  priority_floored: boolean;
  needs: Capability[];
  risk: SosRisk | null;
  recommendation: Recommendation | null;
  assignment: Assignment | null;
  lat: number;
  lon: number;
  is_simulated: boolean;
}

export interface SosFeature {
  type: "Feature";
  id?: number | string;
  geometry: unknown;
  properties: SosProperties;
}

export interface SosCollection {
  type: "FeatureCollection";
  features: SosFeature[];
  count: number;
  scenario: string;
}

// POST /api/sos body. Only lat/lon are required — an SOS must send even when
// every optional field is unavailable.
export interface CreateSos {
  lat: number;
  lon: number;
  people_affected?: number;
  trapped?: boolean;
  medical?: boolean;
  description?: string;
  client_uuid?: string;
}

// Minimal GeoJSON shapes (we only touch a few fields).
export interface Feature {
  type: "Feature";
  id?: number | string;
  geometry: unknown;
  properties: Record<string, unknown>;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}
