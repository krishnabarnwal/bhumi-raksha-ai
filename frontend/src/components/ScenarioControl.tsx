import type { Scenario } from "../types";

interface Props {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  busy: boolean;
}

const OPTIONS: { key: Scenario; label: string; mm: string }[] = [
  { key: "current", label: "Current", mm: "live event" },
  { key: "normal", label: "Normal", mm: "20 mm / 24h" },
  { key: "heavy", label: "Heavy", mm: "90 mm / 24h" },
  { key: "extreme", label: "Extreme", mm: "160 mm / 24h" },
];

export default function ScenarioControl({ scenario, onChange, busy }: Props) {
  return (
    <div className="panel">
      <div className="panel-title">
        Rainfall scenario <span className="hint">drives live risk</span>
      </div>
      <div className="scenario-buttons">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`scn scn-${o.key} ${scenario === o.key ? "active" : ""}`}
            onClick={() => onChange(o.key)}
            disabled={busy}
          >
            <span className="scn-label">{o.label}</span>
            <span className="scn-mm">{o.mm}</span>
          </button>
        ))}
      </div>
      <div className="scenario-status">
        {busy ? "Recomputing risk across all zones…" : "Switch scenario to re-run the risk engine."}
      </div>
    </div>
  );
}
