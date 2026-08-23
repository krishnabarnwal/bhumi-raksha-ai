import type { Priority } from "../types";

interface PriorityListProps {
  items: Priority[];
  selectedZoneId: number | null;
  onSelect: (zoneId: number) => void;
}

// Tier badge colours mirror the risk levels (P1≈CRITICAL … P4≈LOW).
const TIER_COLOR: Record<string, string> = {
  P1: "#c62828",
  P2: "#ef6c00",
  P3: "#f9a825",
  P4: "#2e7d32",
};

export default function PriorityList(props: PriorityListProps) {
  const { items } = props;
  return (
    <div className="panel">
      <div className="panel-title">
        Response Priority
        <span className="hint">risk × exposure</span>
        {items.length > 0 && <span className="count-pill">{items.length}</span>}
      </div>

      {items.length === 0 ? (
        <div className="empty">No zones to prioritize yet.</div>
      ) : (
        <ol className="priority-list">
          {items.map((p) => (
            <li key={p.zone_id}>
              <button
                className={`priority-row ${props.selectedZoneId === p.zone_id ? "active" : ""}`}
                onClick={() => props.onSelect(p.zone_id)}
                title={p.recommended_action}
              >
                <span className="priority-rank">{p.rank}</span>
                <span
                  className="priority-tier"
                  style={{ background: TIER_COLOR[p.priority] ?? "#607d8b" }}
                >
                  {p.priority}
                </span>
                <span className="priority-body">
                  <span className="priority-zone">{p.zone}</span>
                  <span className="priority-meta">
                    {p.display_level} · score {p.risk_score} ·{" "}
                    {p.population_affected.toLocaleString()} exposed
                  </span>
                </span>
                <span className="priority-index" style={{ color: p.color }}>
                  {p.priority_index}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="disclaimer">
        DEMO / SIMULATED prioritization — decision support, not a guaranteed prediction.
      </div>
    </div>
  );
}
