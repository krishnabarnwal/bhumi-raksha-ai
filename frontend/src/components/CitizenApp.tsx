import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type {
  FieldReportCategory,
  RiskAtResult,
  Scenario,
  SosFeature,
} from "../types";
import { useOfflineSos } from "../hooks/useOfflineSos";
import type { QueuedSos } from "../offline/sosOutbox";
import { addReport, loadReports, saveReports } from "../citizen/reportLog";
import type { MyReport } from "../citizen/reportLog";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

interface CitizenAppProps {
  // Shared with the command center so a rainfall scenario set there also drives
  // what the citizen sees (the demo increases rainfall, then shows this view).
  scenario: Scenario;
  // Fired after a successful SOS so the command center can refresh immediately.
  onSosCreated: (feature: SosFeature) => void;
  onError: (msg: string) => void;
}

// P2 — the Citizen App is a small multi-page mobile experience. Pages are
// switched by lightweight internal state (no router): the SOS lives on Home so
// it stays one tap away, hazard reporting and history get their own pages, and
// Safety carries app-authored preparedness guidance.
type CitizenPage = "home" | "report" | "reports" | "info";

const NAV: { page: CitizenPage; icon: string; labelKey: TranslationKey }[] = [
  { page: "home", icon: "🏠", labelKey: "citizen.nav.home" },
  { page: "report", icon: "⚠️", labelKey: "citizen.nav.report" },
  { page: "reports", icon: "📋", labelKey: "citizen.nav.reports" },
  { page: "info", icon: "🛟", labelKey: "citizen.nav.info" },
];

// F8 — "Demo Location Simulator". Sikkim presets plus one out-of-region point
// so the honest "outside monitored region" path is demonstrable. Place names are
// proper nouns (kept as-is); the sub-label is localised via its translation key.
const PRESETS: { name: string; subKey: TranslationKey; lat: number; lon: number }[] = [
  { name: "Chungthang", subKey: "citizen.loc.sub.north", lat: 27.6, lon: 88.64 },
  { name: "Gangtok", subKey: "citizen.loc.sub.capital", lat: 27.335, lon: 88.612 },
  { name: "Mangan", subKey: "citizen.loc.sub.north", lat: 27.51, lon: 88.53 },
  { name: "Guwahati", subKey: "citizen.loc.sub.outside", lat: 26.14, lon: 91.74 },
];

// F2 — citizen hazard categories (Flood is report-only, like the others).
const HAZARDS: { icon: string; labelKey: TranslationKey; category: FieldReportCategory }[] = [
  { icon: "🏔️", labelKey: "citizen.hazard.landslide", category: "landslide" },
  { icon: "🌊", labelKey: "citizen.hazard.flood", category: "flood" },
  { icon: "🚧", labelKey: "citizen.hazard.road", category: "road_blockage" },
  { icon: "⚠️", labelKey: "citizen.hazard.other", category: "other" },
];

// Icon lookup so a logged hazard shows the same glyph in "My Reports" while its
// label re-localises from the stored translation key.
const HAZARD_ICON: Partial<Record<TranslationKey, string>> = Object.fromEntries(
  HAZARDS.map((h) => [h.labelKey, h.icon]),
);

const SAFETY_ICON: Record<string, string> = {
  danger: "🚨",
  caution: "⚠️",
  safe: "✅",
  unknown: "❓",
};

function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older/insecure contexts — still unique enough to dedupe on.
  return `sos-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// Confirmation after pressing SOS: either delivered to the command center now,
// or saved to the offline outbox to be synced automatically on reconnect.
type SosConfirm =
  | { kind: "sent"; feature: SosFeature }
  | { kind: "queued"; item: QueuedSos };

export default function CitizenApp(props: CitizenAppProps) {
  const { scenario } = props;
  const { t } = useT();
  // F9 — offline-first SOS. The hook owns online/offline state, the IndexedDB
  // outbox and auto-sync; a queued SOS is delivered exactly once on reconnect
  // (idempotent on client_uuid, enforced server-side).
  const { online, queuedCount, submit } = useOfflineSos({
    onSynced: props.onSosCreated,
  });
  const [page, setPage] = useState<CitizenPage>("home");
  const [loc, setLoc] = useState(PRESETS[0]);
  const [risk, setRisk] = useState<RiskAtResult | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // Optional SOS attributes — an SOS sends fine with all of these untouched.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [people, setPeople] = useState("");
  const [trapped, setTrapped] = useState(false);
  const [medical, setMedical] = useState(false);
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<SosConfirm | null>(null);
  const [hazardMsg, setHazardMsg] = useState<string | null>(null);

  // P2 — device-local history of this citizen's own submissions (localStorage).
  const [myReports, setMyReports] = useState<MyReport[]>(() => loadReports());

  function logReport(entry: MyReport) {
    setMyReports((prev) => {
      const next = addReport(prev, entry);
      saveReports(next);
      return next;
    });
  }

  // Re-fetch the citizen's risk whenever the simulated location or the shared
  // rainfall scenario changes. A stale-guard keeps the latest response winning.
  const reqRef = useRef(0);
  useEffect(() => {
    if (!online) {
      // Offline: keep the last known safety status on screen rather than
      // erroring out. The connection status line already explains the state.
      setRiskLoading(false);
      return;
    }
    const seq = ++reqRef.current;
    setRiskLoading(true);
    (async () => {
      try {
        const r = await api.riskAt(loc.lat, loc.lon, scenario);
        if (seq === reqRef.current) setRisk(r);
      } catch (e) {
        if (seq === reqRef.current) {
          // Only surface an error if we still believe we're online; a network
          // blip is already accounted for by the offline status line.
          if (typeof navigator === "undefined" || navigator.onLine) {
            props.onError(e instanceof Error ? e.message : String(e));
            setRisk(null);
          }
        }
      } finally {
        if (seq === reqRef.current) setRiskLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, scenario, online]);

  function chooseLocation(preset: (typeof PRESETS)[number]) {
    setLoc(preset);
    setConfirm(null);
    setHazardMsg(null);
  }

  async function pressSos() {
    if (submitting) return;
    setSubmitting(true);
    setHazardMsg(null);
    try {
      const peopleNum = people.trim() === "" ? undefined : Math.max(0, Number(people));
      const result = await submit({
        lat: loc.lat,
        lon: loc.lon,
        people_affected: Number.isFinite(peopleNum as number) ? peopleNum : undefined,
        trapped,
        medical,
        description: description.trim() || undefined,
        client_uuid: newUuid(),
      });
      if (result.status === "sent") {
        setConfirm({ kind: "sent", feature: result.feature });
        props.onSosCreated(result.feature);
        logReport({
          kind: "sos",
          id: String(result.feature.properties.id),
          at: new Date().toISOString(),
          priority: result.feature.properties.priority,
        });
      } else {
        // Saved offline. It syncs automatically on reconnect; the hook's
        // onSynced then notifies the command center — we don't call it here.
        setConfirm({ kind: "queued", item: result.item });
        logReport({
          kind: "sos",
          id: result.item.client_uuid.slice(0, 8),
          at: new Date().toISOString(),
          offline: true,
        });
      }
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function reportHazard(category: FieldReportCategory, labelKey: TranslationKey) {
    setHazardMsg(null);
    try {
      const feature = await api.createFieldReport({
        lat: loc.lat,
        lon: loc.lon,
        category,
        reporter_type: "citizen",
        client_uuid: newUuid(),
      });
      logReport({
        kind: "hazard",
        id: String(feature.id ?? ""),
        at: new Date().toISOString(),
        labelKey,
      });
      setHazardMsg(t("citizen.hazard.reported", { label: t(labelKey), id: feature.id ?? "" }));
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    }
  }

  const safety = risk?.safety;
  const safetyStatus = safety?.status ?? "unknown";

  // --- page fragments -------------------------------------------------------

  const locationSimulator = (
    <div className="panel citizen-loc">
      <div className="panel-title">
        {t("citizen.loc.title")}
        <span className="badge-sim">DEMO</span>
      </div>
      <div className="loc-preset-grid">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`loc-preset-btn ${p.name === loc.name ? "active" : ""}`}
            onClick={() => chooseLocation(p)}
          >
            <span className="loc-name">{p.name}</span>
            <span className="loc-sub">{t(p.subKey)}</span>
          </button>
        ))}
      </div>
      <div className="gps-chip">
        <span className="gps-dot" /> {t("citizen.loc.gps")} ·{" "}
        {loc.lat.toFixed(4)}, {loc.lon.toFixed(4)}
        <span className="citizen-scenario-chip">
          {t("citizen.loc.conditions", {
            scenario: t(`scenario.${scenario}` as TranslationKey),
          })}
        </span>
      </div>
    </div>
  );

  const safetyCard = (
    <div className={`safety-card safety-${safetyStatus}`}>
      {riskLoading && !risk ? (
        <div className="safety-loading">{t("citizen.safety.checking")}</div>
      ) : safety ? (
        <>
          <div className="safety-head">
            <span className="safety-icon">{SAFETY_ICON[safetyStatus]}</span>
            <span className="safety-headline">{safety.headline}</span>
          </div>
          {risk && risk.in_region && (
            <div className="safety-meta">
              <span className="safety-level">{risk.display_level}</span>
              <span className="safety-score">
                {t("citizen.safety.risk", { score: Math.round(risk.risk_score) })}
              </span>
              {risk.computed_at && (
                <span className="safety-time">
                  {new Date(risk.computed_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}
          <div className="safety-instruction">{safety.instruction}</div>
          {(safetyStatus === "danger" || safetyStatus === "caution") && (
            <div className="safety-note">{t("citizen.safety.note")}</div>
          )}
        </>
      ) : (
        <div className="safety-loading">{t("citizen.safety.unavailable")}</div>
      )}
    </div>
  );

  // F1 — the SOS centerpiece (Home). Kept one tap from the default page.
  const sosSection =
    confirm?.kind === "sent" ? (
      <div className="panel sos-confirm">
        <div className="sos-confirm-badge">{t("citizen.sos.sentBadge")}</div>
        <div className="sos-confirm-id">
          {t("sos.incident", { id: confirm.feature.properties.id })} ·{" "}
          <span className="sos-confirm-priority">
            {confirm.feature.properties.priority}
          </span>
        </div>
        <div className="sos-confirm-body">{t("citizen.sos.sentBody")}</div>
        <button className="sos-again" onClick={() => setConfirm(null)}>
          {t("citizen.sos.sendAnother")}
        </button>
      </div>
    ) : confirm?.kind === "queued" ? (
      <div className="panel sos-confirm sos-confirm-queued">
        <div className={`sos-confirm-badge ${queuedCount === 0 ? "" : "queued"}`}>
          {queuedCount === 0 ? t("citizen.sos.deliveredBadge") : t("citizen.sos.savedBadge")}
        </div>
        {queuedCount === 0 ? (
          <div className="sos-confirm-body">{t("citizen.sos.deliveredBody")}</div>
        ) : (
          <>
            <div className="sos-confirm-body">{t("citizen.sos.savedBody")}</div>
            <div className="sos-queued-status">
              <span className="sos-queued-dot" />
              {t("citizen.sos.waitingSync", { count: queuedCount })}
            </div>
          </>
        )}
        <button className="sos-again" onClick={() => setConfirm(null)}>
          {queuedCount === 0 ? t("citizen.sos.sendAnother") : t("citizen.sos.addAnother")}
        </button>
      </div>
    ) : (
      <div className="sos-section">
        <button
          className="sos-button"
          onClick={pressSos}
          disabled={submitting}
          aria-label="Send SOS"
        >
          <span className="sos-button-label">
            {submitting ? t("citizen.sos.sending") : "SOS"}
          </span>
          <span className="sos-button-sub">{t("citizen.sos.pressHelp")}</span>
        </button>

        <button
          className="sos-details-toggle"
          onClick={() => setDetailsOpen((v) => !v)}
        >
          {detailsOpen ? t("citizen.sos.hideDetails") : t("citizen.sos.addDetails")}
        </button>

        {detailsOpen && (
          <div className="sos-details">
            <label className="field-label" htmlFor="sos-people">
              {t("citizen.sos.people")}
            </label>
            <input
              id="sos-people"
              className="field-input"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder={t("citizen.sos.peoplePlaceholder")}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
            />
            <label className="sos-check">
              <input
                type="checkbox"
                checked={trapped}
                onChange={(e) => setTrapped(e.target.checked)}
              />
              {t("citizen.sos.trapped")}
            </label>
            <label className="sos-check">
              <input
                type="checkbox"
                checked={medical}
                onChange={(e) => setMedical(e.target.checked)}
              />
              {t("citizen.sos.medical")}
            </label>
            <label className="field-label" htmlFor="sos-desc">
              {t("citizen.sos.description")}
            </label>
            <textarea
              id="sos-desc"
              className="field-input"
              rows={2}
              maxLength={2000}
              placeholder={t("citizen.sos.descPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        )}
      </div>
    );

  // F2 — hazard reporting (Report page).
  const hazardPanel = (
    <div className="panel hazard-panel">
      <div className="panel-title">{t("citizen.hazard.title")}</div>
      <div className="citizen-report-from">
        {t("citizen.report.from", { location: loc.name })}
      </div>
      <div className="hazard-grid">
        {HAZARDS.map((h) => (
          <button
            key={h.category}
            className="hazard-btn"
            onClick={() => reportHazard(h.category, h.labelKey)}
            disabled={!online}
          >
            <span className="hazard-icon">{h.icon}</span>
            <span className="hazard-label">{t(h.labelKey)}</span>
          </button>
        ))}
      </div>
      {!online && (
        <div className="hazard-offline-note">{t("citizen.hazard.offlineNote")}</div>
      )}
      {hazardMsg && <div className="report-ok">✓ {hazardMsg}</div>}
    </div>
  );

  // P2 — "My Reports": a device-local log of this citizen's own submissions.
  const myReportsPage = (
    <div className="panel">
      <div className="panel-title">
        {t("citizen.myReports.title")}
        <span className="myreports-note">{t("citizen.myReports.note")}</span>
      </div>
      {myReports.length === 0 ? (
        <div className="myreports-empty">{t("citizen.myReports.empty")}</div>
      ) : (
        <ul className="myreports-list">
          {myReports.map((r, i) => (
            <li className="myreport-row" key={`${r.kind}-${r.id}-${i}`}>
              <span className="myreport-icon">
                {r.kind === "sos"
                  ? "🆘"
                  : (r.labelKey && HAZARD_ICON[r.labelKey as TranslationKey]) || "⚠️"}
              </span>
              <span className="myreport-main">
                <span className="myreport-title">
                  {r.kind === "sos"
                    ? t("citizen.myReports.sos")
                    : r.labelKey
                      ? t(r.labelKey as TranslationKey)
                      : ""}
                  {r.id ? <span className="myreport-id"> #{r.id}</span> : null}
                </span>
                <span className="myreport-meta">
                  <span>
                    {new Date(r.at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {r.priority && (
                    <span className="myreport-badge">{r.priority}</span>
                  )}
                  {r.offline && (
                    <span className="myreport-badge offline">
                      {t("citizen.myReports.offline")}
                    </span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // P2 — "Safety": app-authored preparedness guidance. No external/official API
  // is called or implied; 112 is India's public emergency number, surfaced as a
  // plain dialer link and clearly framed as general reference.
  const infoPage = (
    <>
      <div className="panel info-panel">
        <div className="panel-title">{t("citizen.info.title")}</div>
        <div className="info-intro">{t("citizen.info.intro")}</div>
        <div className="info-emergency">
          <span className="info-emergency-label">
            {t("citizen.info.emergencyNumber")}
          </span>
          <a className="info-call" href="tel:112">
            📞 {t("citizen.info.call")}
          </a>
        </div>
      </div>

      <div className="panel info-panel">
        <div className="info-section-title">🏔️ {t("citizen.info.landslide.title")}</div>
        <ul className="info-list">
          <li>{t("citizen.info.landslide.1")}</li>
          <li>{t("citizen.info.landslide.2")}</li>
          <li>{t("citizen.info.landslide.3")}</li>
        </ul>
      </div>

      <div className="panel info-panel">
        <div className="info-section-title">🌊 {t("citizen.info.flood.title")}</div>
        <ul className="info-list">
          <li>{t("citizen.info.flood.1")}</li>
          <li>{t("citizen.info.flood.2")}</li>
          <li>{t("citizen.info.flood.3")}</li>
        </ul>
      </div>

      <div className="info-disclaimer">{t("citizen.info.disclaimer")}</div>
    </>
  );

  return (
    <div className="citizen-view">
      <div className="citizen-scroll">
        <div className="citizen-shell">
          {/* F9 — connectivity + offline SOS queue status (visible on every page) */}
          <div className={`conn-status ${online ? "online" : "offline"}`} role="status">
            <span className="conn-dot" />
            {online ? (
              queuedCount > 0 ? (
                <span>{t("citizen.conn.syncing", { count: queuedCount })}</span>
              ) : (
                <span>{t("citizen.conn.online")}</span>
              )
            ) : (
              <span>
                {queuedCount > 0
                  ? t("citizen.conn.offlineQueued", { count: queuedCount })
                  : t("citizen.conn.offline")}
              </span>
            )}
          </div>

          {page === "home" && (
            <>
              {locationSimulator}
              {safetyCard}
              {sosSection}
            </>
          )}
          {page === "report" && hazardPanel}
          {page === "reports" && myReportsPage}
          {page === "info" && infoPage}
        </div>
      </div>

      <nav className="citizen-nav" aria-label="Citizen navigation">
        <div className="citizen-nav-inner">
          {NAV.map((n) => (
            <button
              key={n.page}
              type="button"
              className={`citizen-nav-btn ${page === n.page ? "active" : ""}`}
              onClick={() => setPage(n.page)}
              aria-current={page === n.page ? "page" : undefined}
            >
              <span className="citizen-nav-icon">{n.icon}</span>
              <span className="citizen-nav-label">{t(n.labelKey)}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
