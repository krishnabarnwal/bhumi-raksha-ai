import type { RiskResult } from "../types";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

interface Props {
  risk: RiskResult | null;
  loading: boolean;
}

const LEVEL_COLOR: Record<string, string> = {
  LOW: "#2e7d32",
  MODERATE: "#f9a825",
  HIGH: "#ef6c00",
  CRITICAL: "#c62828",
};

const IMPACT_COLOR: Record<string, string> = {
  LOW: "#2e7d32",
  MEDIUM: "#f9a825",
  HIGH: "#c62828",
};

export default function RiskPanel({ risk, loading }: Props) {
  const { t } = useT();
  if (loading) {
    return (
      <div className="panel risk-panel">
        <div className="panel-title">{t("risk.title")}</div>
        <div className="empty">{t("risk.computing")}</div>
      </div>
    );
  }
  if (!risk) {
    return (
      <div className="panel risk-panel">
        <div className="panel-title">{t("risk.title")}</div>
        <div className="empty">{t("risk.empty")}</div>
      </div>
    );
  }

  const color = LEVEL_COLOR[risk.display_level] ?? "#607d8b";
  const score = Math.round(risk.risk_score);
  const confidencePct = Math.round(risk.confidence * 100);
  // computed_at is tz-aware (…+00:00) from the engine; show it as local time so
  // the audience sees the score was recomputed the instant they interacted.
  const computedAt = risk.computed_at ? new Date(risk.computed_at) : null;
  const computedLabel =
    computedAt && !Number.isNaN(computedAt.getTime())
      ? computedAt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;

  return (
    <div className="panel risk-panel">
      <div className="panel-title">
        {t("risk.title")}
        {risk.is_simulated && <span className="badge-sim">DEMO / SIMULATED</span>}
      </div>

      {risk.zone && <div className="risk-zone-name">{risk.zone.name}</div>}

      <div className="risk-headline">
        <div className="score-disc" style={{ borderColor: color, color }}>
          <span className="score-num">{score}</span>
          <span className="score-max">/100</span>
        </div>
        <div className="risk-headline-meta">
          <div className="level-chip" style={{ background: color }}>
            {risk.display_level}
          </div>
          <div className="confidence">
            {t("risk.confidence")} <strong>{confidencePct}%</strong>
          </div>
          {risk.scenario && (
            <div className="scenario-tag">
              {t("risk.scenarioTag", { scenario: t(`scenario.${risk.scenario}` as TranslationKey) })}
            </div>
          )}
          {computedLabel && (
            <div className="computed-at" title={computedAt!.toLocaleString()}>
              {t("risk.computed", { time: computedLabel })}
            </div>
          )}
        </div>
      </div>

      <div className="factors">
        <div className="factors-title">{t("risk.factorsTitle")}</div>
        {risk.factors.map((f) => (
          <div className="factor" key={f.key}>
            <div className="factor-row">
              <span className="factor-name">{f.name}</span>
              <span className="factor-value">
                {f.value}
                {f.unit ? ` ${f.unit}` : ""}
              </span>
            </div>
            <div className="factor-bar-track">
              <div
                className="factor-bar-fill"
                style={{
                  width: `${Math.min(100, f.normalized)}%`,
                  background: IMPACT_COLOR[f.impact] ?? "#607d8b",
                }}
              />
            </div>
            <div className="factor-foot">
              <span
                className="impact-chip"
                style={{ color: IMPACT_COLOR[f.impact] ?? "#607d8b" }}
              >
                {t("risk.impact", { impact: f.impact })}
              </span>
              <span className="factor-weight">{t("risk.weight", { weight: f.weight })}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="recommended">
        <div className="recommended-title">{t("risk.recommendedTitle")}</div>
        <div className="recommended-body">{risk.recommended_action}</div>
      </div>

      <div className="disclaimer">{risk.disclaimer}</div>
    </div>
  );
}
