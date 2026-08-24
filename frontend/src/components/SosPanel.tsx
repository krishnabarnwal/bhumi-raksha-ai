import { useState } from "react";
import type { Capability, ResponseResource, SosFeature } from "../types";

interface SosPanelProps {
  sos: SosFeature | null;
  resources: ResponseResource[];
  assigning: boolean;
  onAssign: (id: number, teamId?: string) => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  P1: "#c62828",
  P2: "#ef6c00",
  P3: "#f9a825",
  P4: "#2e7d32",
};

const LEVEL_COLOR: Record<string, string> = {
  LOW: "#2e7d32",
  MODERATE: "#f9a825",
  HIGH: "#ef6c00",
  CRITICAL: "#c62828",
};

const CAPABILITY_LABEL: Record<Capability, string> = {
  search_rescue: "Search & rescue",
  medical: "Medical",
  field_verification: "Field verification",
  relief: "Relief",
  engineering: "Engineering",
};

const capLabel = (c: Capability) => CAPABILITY_LABEL[c] ?? String(c).replace(/_/g, " ");

function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SosPanel({ sos, resources, assigning, onAssign }: SosPanelProps) {
  const [pick, setPick] = useState("");

  if (!sos) {
    return (
      <div className="panel sos-detail">
        <div className="panel-title">SOS incident</div>
        <div className="empty">
          Select an SOS marker on the map to see its severity, AI priority and the
          recommended response.
        </div>
      </div>
    );
  }

  const p = sos.properties;
  const priColor = PRIORITY_COLOR[p.priority] ?? "#607d8b";
  const risk = p.risk;
  const rec = p.recommendation;
  const assignment = p.assignment;
  const assigned = p.status === "assigned" && assignment != null;
  const createdAt = timeLabel(p.created_at);
  const riskInRegion = risk != null && risk.in_region;

  return (
    <div className="panel sos-detail">
      <div className="panel-title">
        SOS incident
        <span className="badge-sim">DEMO / SIMULATED</span>
      </div>

      <div className="sos-detail-head">
        <div className="sos-detail-id">
          Incident #{p.id}
          <span className={`sos-status sos-status-${p.status}`}>{p.status}</span>
        </div>
        <div className="pri-chip" style={{ background: priColor }}>
          {p.priority}
        </div>
      </div>

      <div className="sos-facts">
        <div className="sos-fact">
          <span className="sos-fact-k">Location</span>
          <span className="sos-fact-v">
            {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
            {risk?.zone_name ? ` · ${risk.zone_name}` : ""}
          </span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">Reported</span>
          <span className="sos-fact-v">{createdAt ?? "—"}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">Severity</span>
          <span className="sos-fact-v sos-sev">{p.severity}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">Current risk</span>
          <span className="sos-fact-v">
            {riskInRegion && risk ? (
              <span className="sos-risk-chip" style={{ color: LEVEL_COLOR[risk.display_level] }}>
                {risk.display_level} · {Math.round(risk.risk_score)}/100
              </span>
            ) : (
              <span className="sos-risk-chip muted">outside monitored region</span>
            )}
          </span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">People affected</span>
          <span className="sos-fact-v">{p.people_affected}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">Trapped</span>
          <span className="sos-fact-v">{p.trapped ? "Yes" : "No"}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">Medical</span>
          <span className="sos-fact-v">{p.medical ? "Yes" : "No"}</span>
        </div>
      </div>

      {p.description && <div className="sos-desc">“{p.description}”</div>}

      {/* F4 — transparent AI priority breakdown */}
      <div className="pri-breakdown">
        <div className="pri-breakdown-title">
          AI priority
          <span className="pri-inline-chip" style={{ background: priColor }}>
            {p.priority}
          </span>
          <span className="pri-score">score {p.priority_score}/100</span>
        </div>
        <div className="pri-factors">
          {p.priority_factors.map((f, i) => (
            <div className="pri-factor" key={i}>
              <span className="pri-factor-label">{f.label}</span>
              <span className="pri-factor-pts">
                {f.points > 0 ? `+${f.points}` : "—"}
              </span>
            </div>
          ))}
        </div>
        <div className="pri-note">
          Deterministic, explainable score — not an ML prediction.
        </div>
      </div>

      {/* F6 — recommended response */}
      <div className="rec-block">
        <div className="rec-title">Recommended response</div>
        {rec ? (
          <>
            <div className="rec-team">
              <span className="rec-team-name">{rec.team_name}</span>
              <span className={`rec-avail rec-avail-${rec.status}`}>{rec.status}</span>
            </div>
            <div className="rec-caps">
              {rec.capabilities.map((c) => (
                <span
                  key={c}
                  className={`cap-chip ${rec.capability_match.includes(c) ? "cap-match" : ""}`}
                >
                  {capLabel(c)}
                </span>
              ))}
            </div>
            <div className="rec-meta">
              <span>~{rec.distance_km} km (estimated distance)</span>
              <span>· from {rec.base}</span>
              <span>· coverage {Math.round(rec.coverage * 100)}%</span>
            </div>
            <div className="rec-reason">{rec.reason}</div>
          </>
        ) : (
          <div className="empty">No available team matches this incident yet.</div>
        )}
      </div>

      {/* status PENDING → ASSIGNED */}
      {assigned ? (
        <div className="assign-done">
          ✓ Assigned to <strong>{assignment!.team_name}</strong>
          {timeLabel(assignment!.assigned_at) ? ` at ${timeLabel(assignment!.assigned_at)}` : ""}
        </div>
      ) : (
        <div className="assign-actions">
          <button
            className="assign-btn"
            disabled={assigning || !rec}
            onClick={() => onAssign(p.id)}
          >
            {assigning ? "Assigning…" : rec ? `Assign ${rec.team_name}` : "No team to assign"}
          </button>
          <div className="assign-override">
            <select
              className="field-input"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">Override — pick a team…</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id} disabled={!r.available}>
                  {r.name}
                  {r.available ? "" : " (unavailable)"}
                </option>
              ))}
            </select>
            <button
              className="assign-btn-secondary"
              disabled={assigning || !pick}
              onClick={() => onAssign(p.id, pick)}
            >
              Assign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
