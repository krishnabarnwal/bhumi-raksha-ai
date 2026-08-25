import type { Alert } from "../types";
import { useT } from "../i18n";

interface Props {
  alerts: Alert[];
  selectedZoneId: number | null;
  onSelect: (zoneId: number) => void;
}

const LEVEL_COLOR: Record<string, string> = {
  HIGH: "#ef6c00",
  CRITICAL: "#c62828",
};

export default function AlertsPanel({ alerts, selectedZoneId, onSelect }: Props) {
  const { t } = useT();
  return (
    <div className="panel alerts-panel">
      <div className="panel-title">
        {t("alerts.title")}
        <span className="count-pill">{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <div className="empty">{t("alerts.empty")}</div>
      ) : (
        <div className="alert-list">
          {alerts.map((a) => {
            const color = LEVEL_COLOR[a.display_level] ?? "#ef6c00";
            const active = a.zone_id === selectedZoneId;
            return (
              <button
                key={a.zone_id}
                type="button"
                className={`alert-card ${active ? "active" : ""}`}
                style={{ borderLeftColor: color }}
                onClick={() => onSelect(a.zone_id)}
              >
                <div className="alert-head">
                  <span className="alert-level" style={{ color }}>
                    {a.display_level}
                  </span>
                  {a.risk_score != null && (
                    <span className="alert-score">{Math.round(a.risk_score)}</span>
                  )}
                </div>
                <div className="alert-title">{a.title}</div>
                <div className="alert-reason">{a.reason}</div>
                <div className="alert-affected">
                  <span>👥 {a.affected.population.toLocaleString()}</span>
                  <span>🏘 {a.affected.villages.length}</span>
                  <span>🏥 {a.affected.infrastructure.length}</span>
                  <span>🛣 {a.affected.roads.length}</span>
                </div>
                <div className="alert-action">{a.recommended_action}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
