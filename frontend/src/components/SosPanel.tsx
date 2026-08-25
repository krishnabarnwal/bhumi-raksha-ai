import { useState } from "react";
import type { ResponderStatus, ResponseResource, SosFeature } from "../types";
import { currentStatus, lifecycleSteps, nextAction, timeline } from "../sos/lifecycle";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

interface SosPanelProps {
  sos: SosFeature | null;
  resources: ResponseResource[];
  assigning: boolean;
  advancing: boolean;
  escalating: boolean;
  onAssign: (id: number, teamId?: string) => void;
  onAdvance: (id: number, target: ResponderStatus, responderId: string) => void;
  onEscalate: (id: number) => void;
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

function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SosPanel({
  sos,
  resources,
  assigning,
  advancing,
  escalating,
  onAssign,
  onAdvance,
  onEscalate,
}: SosPanelProps) {
  const { t } = useT();
  const [pick, setPick] = useState("");

  if (!sos) {
    return (
      <div className="panel sos-detail">
        <div className="panel-title">{t("sos.title")}</div>
        <div className="empty">{t("sos.empty")}</div>
      </div>
    );
  }

  const p = sos.properties;
  const priColor = PRIORITY_COLOR[p.priority] ?? "#607d8b";
  const risk = p.risk;
  const rec = p.recommendation;
  const routing = p.response_routing;
  const escalation = p.escalation;
  const assignment = p.assignment;
  const assigned = p.status === "assigned" && assignment != null;
  // Responder-lifecycle view state (derived from the assignment; pure logic).
  const respStatus = currentStatus(assignment);
  const steps = lifecycleSteps(assignment);
  const action = nextAction(assignment);
  const audit = timeline(assignment);
  const createdAt = timeLabel(p.created_at);
  const riskInRegion = risk != null && risk.in_region;

  return (
    <div className="panel sos-detail">
      <div className="panel-title">
        {t("sos.title")}
        <span className="badge-sim">DEMO / SIMULATED</span>
      </div>

      <div className="sos-detail-head">
        <div className="sos-detail-id">
          {t("sos.incident", { id: p.id })}
          <span className={`sos-status sos-status-${p.status}`}>{p.status}</span>
        </div>
        <div className="pri-chip" style={{ background: priColor }}>
          {p.priority}
        </div>
      </div>

      <div className="sos-facts">
        <div className="sos-fact">
          <span className="sos-fact-k">{t("sos.f.location")}</span>
          <span className="sos-fact-v">
            {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
            {risk?.zone_name ? ` · ${risk.zone_name}` : ""}
          </span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">{t("sos.f.reported")}</span>
          <span className="sos-fact-v">{createdAt ?? "—"}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">{t("sos.f.severity")}</span>
          <span className="sos-fact-v sos-sev">{p.severity}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">{t("sos.f.currentRisk")}</span>
          <span className="sos-fact-v">
            {riskInRegion && risk ? (
              <span className="sos-risk-chip" style={{ color: LEVEL_COLOR[risk.display_level] }}>
                {risk.display_level} · {Math.round(risk.risk_score)}/100
              </span>
            ) : (
              <span className="sos-risk-chip muted">{t("sos.outsideRegion")}</span>
            )}
          </span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">{t("sos.f.people")}</span>
          <span className="sos-fact-v">{p.people_affected}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">{t("sos.f.trapped")}</span>
          <span className="sos-fact-v">{p.trapped ? t("sos.yes") : t("sos.no")}</span>
        </div>
        <div className="sos-fact">
          <span className="sos-fact-k">{t("sos.f.medical")}</span>
          <span className="sos-fact-v">{p.medical ? t("sos.yes") : t("sos.no")}</span>
        </div>
      </div>

      {p.description && <div className="sos-desc">“{p.description}”</div>}

      {/* F4 — transparent AI priority breakdown */}
      <div className="pri-breakdown">
        <div className="pri-breakdown-title">
          {t("sos.aiPriority")}
          <span className="pri-inline-chip" style={{ background: priColor }}>
            {p.priority}
          </span>
          <span className="pri-score">{t("sos.priScore", { score: p.priority_score })}</span>
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
        <div className="pri-note">{t("sos.deterministicNote")}</div>
      </div>

      {/* F6 — recommended response */}
      <div className="rec-block">
        <div className="rec-title">{t("sos.recommendedResponse")}</div>
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
                  {t(`cap.${c}` as TranslationKey)}
                </span>
              ))}
            </div>
            <div className="rec-meta">
              <span>{t("sos.estDistance", { km: rec.distance_km })}</span>
              <span>{t("sos.fromBase", { base: rec.base })}</span>
              <span>{t("sos.coverage", { pct: Math.round(rec.coverage * 100) })}</span>
            </div>
            <div className="rec-reason">{rec.reason}</div>
          </>
        ) : (
          <div className="empty">{t("sos.noTeamMatch")}</div>
        )}
      </div>

      {/* Response routing & escalation — DEMO / SIMULATED (no real agency API) */}
      {routing && (
        <div className="routing-block">
          <div className="routing-title">
            {t("sos.responseNetwork")}
            <span className="badge-sim">SIMULATED</span>
          </div>
          <div className="routing-row">
            <span className="routing-k">{t("sos.routeRecommended")}</span>
            <span className="route-cat-chip">{routing.primary_category.label}</span>
          </div>
          <div className="routing-row">
            <span className="routing-k">{t("sos.escalateToLabel")}</span>
            <span className="routing-v">
              {routing.escalation_network}
              <span
                className={`route-level route-level-${routing.escalation_level.toLowerCase()}`}
              >
                {routing.escalation_level}
              </span>
            </span>
          </div>
          {routing.supporting.length > 0 && (
            <div className="route-support">
              <span className="route-support-k">{t("sos.supporting")}</span>
              {routing.supporting.map((s) => (
                <span key={s.key} className="route-support-chip">
                  {s.label}
                </span>
              ))}
            </div>
          )}
          <div className="rec-reason">{routing.reason}</div>

          {escalation ? (
            <div className="escalated">
              <div className="escalated-head">
                <span className="escalated-badge">{t("sos.escalated")}</span>
                <span className="escalated-time">
                  {timeLabel(escalation.escalated_at) ?? ""}
                </span>
              </div>
              <div className="escalated-net">{escalation.escalation_network}</div>
              <div className="escalated-providers">
                {escalation.providers.map((pv) => (
                  <span key={pv} className="provider-chip">
                    {pv}
                  </span>
                ))}
              </div>
              <div className="escalated-ref">
                {t("sos.ref", { ref: escalation.dispatch.reference })} · {escalation.dispatch.note}
              </div>
            </div>
          ) : (
            <button
              className="escalate-btn"
              disabled={escalating}
              onClick={() => onEscalate(p.id)}
            >
              {escalating ? t("sos.escalating") : t("sos.escalateBtn")}
            </button>
          )}
        </div>
      )}

      {/* status PENDING → ASSIGNED, then the responder lifecycle */}
      {assigned ? (
        <div className="lifecycle">
          <div className="lifecycle-head">
            <span className="lifecycle-team">
              {t("sos.responseTeam")} · <strong>{assignment!.team_name}</strong>
            </span>
            <span className={`resp-chip resp-${respStatus.toLowerCase()}`}>
              {t(`status.${respStatus.toLowerCase()}` as TranslationKey)}
            </span>
          </div>

          <ol className="lifecycle-steps">
            {steps.map((s) => (
              <li key={s.status} className={`lc-step lc-${s.state}`}>
                <span className="lc-dot">{s.state === "upcoming" ? "○" : "✓"}</span>
                <span className="lc-label">
                  {t(`status.${s.status.toLowerCase()}` as TranslationKey)}
                </span>
                <span className="lc-time">{timeLabel(s.at) ?? ""}</span>
              </li>
            ))}
          </ol>

          {action ? (
            <button
              className="lifecycle-btn"
              disabled={advancing}
              onClick={() => onAdvance(p.id, action.target, assignment!.team_id)}
            >
              {advancing
                ? t("sos.updating")
                : t(`sos.action.${action.target.toLowerCase()}` as TranslationKey)}
            </button>
          ) : (
            <div className="lifecycle-resolved">{t("sos.incidentResolved")}</div>
          )}

          <details className="lifecycle-audit">
            <summary>{t("sos.timeline")}</summary>
            <ul className="audit-list">
              {audit.map((e) => (
                <li key={e.status} className="audit-item">
                  <span className="audit-time">{timeLabel(e.at) ?? "—"}</span>
                  <span className="audit-text">{e.text}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <div className="assign-actions">
          <button
            className="assign-btn"
            disabled={assigning || !rec}
            onClick={() => onAssign(p.id)}
          >
            {assigning
              ? t("sos.assigning")
              : rec
                ? t("sos.assignTeam", { team: rec.team_name })
                : t("sos.noTeamToAssign")}
          </button>
          <div className="assign-override">
            <select
              className="field-input"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">{t("sos.overridePick")}</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id} disabled={!r.available}>
                  {r.name}
                  {r.available ? "" : t("sos.unavailable")}
                </option>
              ))}
            </select>
            <button
              className="assign-btn-secondary"
              disabled={assigning || !pick}
              onClick={() => onAssign(p.id, pick)}
            >
              {t("sos.assign")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
