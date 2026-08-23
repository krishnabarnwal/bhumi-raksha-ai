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
