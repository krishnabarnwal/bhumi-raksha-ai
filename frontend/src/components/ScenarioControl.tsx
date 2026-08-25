import type { Scenario } from "../types";
import { useT } from "../i18n";

interface Props {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  busy: boolean;
}

// Rainfall depth (mm/24h) is data, shown verbatim in every language.
const OPTIONS: { key: Scenario; mm: string }[] = [
  { key: "current", mm: "live event" },
  { key: "normal", mm: "20 mm / 24h" },
  { key: "heavy", mm: "90 mm / 24h" },
  { key: "extreme", mm: "160 mm / 24h" },
];

export default function ScenarioControl({ scenario, onChange, busy }: Props) {
  const { t } = useT();
  return (
    <div className="panel">
      <div className="panel-title">
        {t("scn.title")} <span className="hint">{t("scn.hint")}</span>
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
            <span className="scn-label">{t(`scenario.${o.key}`)}</span>
            <span className="scn-mm">{o.mm}</span>
          </button>
        ))}
      </div>
      <div className="scenario-status">
        {busy ? t("scn.recomputing") : t("scn.switchHint")}
      </div>
    </div>
  );
}
