import type { SosCollection } from "../types";
import { commandMetrics, formatDuration, responseAnalytics } from "../sos/metrics";
import type { DurationStat } from "../sos/metrics";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

interface Props {
  sos: SosCollection | null;
}

// The five headline tiles. `key` maps to a CSS accent class so each number is
// colour-coded (critical red, pending amber, active blue, resolved green), and
// to the `ops.<key>` / `ops.<key>.tip` translation keys.
const TILES: { key: string; label: TranslationKey; title: TranslationKey }[] = [
  { key: "total", label: "ops.total", title: "ops.total.tip" },
  { key: "critical", label: "ops.critical", title: "ops.critical.tip" },
  { key: "pending", label: "ops.pending", title: "ops.pending.tip" },
  { key: "active", label: "ops.active", title: "ops.active.tip" },
  { key: "resolved", label: "ops.resolved", title: "ops.resolved.tip" },
];

// One analytics row — renders the real average, the sample size, or "—" when
// there is no recorded data yet (never a fabricated statistic).
function StatRow({ label, stat }: { label: string; stat: DurationStat }) {
  return (
    <div className="ops-stat">
      <span className="ops-stat-k">{label}</span>
      <span className="ops-stat-v">
        {formatDuration(stat.avgMs)}
        {stat.samples > 0 && <span className="ops-stat-n"> · n={stat.samples}</span>}
      </span>
    </div>
  );
}

// Command-center operations overview: live incident counts + response-time
// analytics, all derived from the real SOS feed. Purely presentational — it
// re-renders whenever the polled `sos` prop changes.
export default function CommandMetrics({ sos }: Props) {
  const { t } = useT();
  const features = sos?.features ?? [];
  const m = commandMetrics(features);
  const a = responseAnalytics(features);
  const values: Record<string, number> = {
    total: m.total,
    critical: m.critical,
    pending: m.pending,
    active: m.active,
    resolved: m.resolved,
  };
  const hasAnalytics =
    a.acknowledge.samples + a.onSite.samples + a.resolve.samples > 0;

  return (
    <div className="panel ops-panel">
      <div className="panel-title">
        {t("ops.title")}
        <span className="hint">{t("ops.hint")}</span>
      </div>

      <div className="ops-tiles">
        {TILES.map((tile) => (
          <div
            key={tile.key}
            className={`ops-tile ops-${tile.key}`}
            title={t(tile.title)}
          >
            <span className="ops-num">{values[tile.key]}</span>
            <span className="ops-lbl">{t(tile.label)}</span>
          </div>
        ))}
      </div>

      <div className="ops-analytics">
        <div className="ops-analytics-head">
          {t("ops.responseTimes")}
          <span className="hint">
            {hasAnalytics ? t("ops.fromTimestamps") : t("ops.noResponses")}
          </span>
        </div>
        <StatRow label={t("ops.acknowledge")} stat={a.acknowledge} />
        <StatRow label={t("ops.onSite")} stat={a.onSite} />
        <StatRow label={t("ops.resolve")} stat={a.resolve} />
      </div>
    </div>
  );
}
