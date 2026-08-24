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

interface CitizenAppProps {
  // Shared with the command center so a rainfall scenario set there also drives
  // what the citizen sees (the demo increases rainfall, then shows this view).
  scenario: Scenario;
  // Fired after a successful SOS so the command center can refresh immediately.
  onSosCreated: (feature: SosFeature) => void;
  onError: (msg: string) => void;
}

// F8 — "Demo Location Simulator". Sikkim presets plus one out-of-region point
// so the honest "outside monitored region" path is demonstrable.
const PRESETS: { name: string; sub: string; lat: number; lon: number }[] = [
  { name: "Chungthang", sub: "North Sikkim", lat: 27.6, lon: 88.64 },
  { name: "Gangtok", sub: "Capital", lat: 27.335, lon: 88.612 },
  { name: "Mangan", sub: "North Sikkim", lat: 27.51, lon: 88.53 },
  { name: "Guwahati", sub: "Outside region", lat: 26.14, lon: 91.74 },
];

// F2 — citizen hazard categories (Flood is report-only, like the others).
const HAZARDS: { icon: string; label: string; category: FieldReportCategory }[] = [
  { icon: "🏔️", label: "Landslide", category: "landslide" },
  { icon: "🌊", label: "Flood", category: "flood" },
  { icon: "🚧", label: "Road Blocked", category: "road_blockage" },
  { icon: "⚠️", label: "Other", category: "other" },
];

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
  // F9 — offline-first SOS. The hook owns online/offline state, the IndexedDB
  // outbox and auto-sync; a queued SOS is delivered exactly once on reconnect
  // (idempotent on client_uuid, enforced server-side).
  const { online, queuedCount, submit } = useOfflineSos({
    onSynced: props.onSosCreated,
  });
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
      } else {
        // Saved offline. It syncs automatically on reconnect; the hook's
        // onSynced then notifies the command center — we don't call it here.
        setConfirm({ kind: "queued", item: result.item });
      }
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function reportHazard(category: FieldReportCategory, label: string) {
    setHazardMsg(null);
    try {
      const feature = await api.createFieldReport({
        lat: loc.lat,
        lon: loc.lon,
        category,
        reporter_type: "citizen",
        client_uuid: newUuid(),
      });
      setHazardMsg(`${label} reported (#${feature.id}). Thank you — authorities notified.`);
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    }
  }

  const safety = risk?.safety;
  const safetyStatus = safety?.status ?? "unknown";

  return (
    <div className="citizen-view">
      <div className="citizen-shell">
        {/* F9 — connectivity + offline SOS queue status (always visible) */}
        <div
          className={`conn-status ${online ? "online" : "offline"}`}
          role="status"
        >
          <span className="conn-dot" />
          {online ? (
            queuedCount > 0 ? (
              <span>Online — syncing {queuedCount} saved SOS…</span>
            ) : (
              <span>Online — connected to command center</span>
            )
          ) : (
            <span>
              Offline — you can still send an SOS
              {queuedCount > 0 ? ` · ${queuedCount} queued` : ""}
            </span>
          )}
        </div>

        {/* F8 — Demo Location Simulator */}
        <div className="panel citizen-loc">
          <div className="panel-title">
            Demo Location Simulator
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
                <span className="loc-sub">{p.sub}</span>
              </button>
            ))}
          </div>
          <div className="gps-chip">
            <span className="gps-dot" /> GPS lock (simulated) ·{" "}
            {loc.lat.toFixed(4)}, {loc.lon.toFixed(4)}
            <span className="citizen-scenario-chip">conditions: {scenario}</span>
          </div>
        </div>

        {/* F7 — safety status / citizen alert */}
        <div className={`safety-card safety-${safetyStatus}`}>
          {riskLoading && !risk ? (
            <div className="safety-loading">Checking your area…</div>
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
                    risk {Math.round(risk.risk_score)}/100
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
                <div className="safety-note">
                  This is an evolving risk estimate, not a prediction of an exact
                  landslide. Follow local authority guidance.
                </div>
              )}
            </>
          ) : (
            <div className="safety-loading">Risk status unavailable.</div>
          )}
        </div>

        {/* F1 — the SOS centerpiece */}
        {confirm?.kind === "sent" ? (
          <div className="panel sos-confirm">
            <div className="sos-confirm-badge">SOS SENT</div>
            <div className="sos-confirm-id">
              Incident #{confirm.feature.properties.id} ·{" "}
              <span className="sos-confirm-priority">
                {confirm.feature.properties.priority}
              </span>
            </div>
            <div className="sos-confirm-body">
              Your emergency signal has reached the command center and is being
              triaged. Stay where you are if it is safe to do so.
            </div>
            <button className="sos-again" onClick={() => setConfirm(null)}>
              Send another update
            </button>
          </div>
        ) : confirm?.kind === "queued" ? (
          <div className="panel sos-confirm sos-confirm-queued">
            <div
              className={`sos-confirm-badge ${queuedCount === 0 ? "" : "queued"}`}
            >
              {queuedCount === 0 ? "SOS DELIVERED" : "SOS SAVED — QUEUED"}
            </div>
            {queuedCount === 0 ? (
              <div className="sos-confirm-body">
                Your queued SOS has been delivered to the command center now that
                the connection is back. Responders are being coordinated.
              </div>
            ) : (
              <>
                <div className="sos-confirm-body">
                  SOS saved. It will be sent automatically when connection returns.
                </div>
                <div className="sos-queued-status">
                  <span className="sos-queued-dot" />
                  {queuedCount} SOS waiting to sync
                </div>
              </>
            )}
            <button className="sos-again" onClick={() => setConfirm(null)}>
              {queuedCount === 0 ? "Send another update" : "Add another SOS"}
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
                {submitting ? "SENDING…" : "SOS"}
              </span>
              <span className="sos-button-sub">Press for emergency help</span>
            </button>

            <button
              className="sos-details-toggle"
              onClick={() => setDetailsOpen((v) => !v)}
            >
              {detailsOpen ? "− Hide details" : "+ Add details (optional)"}
            </button>

            {detailsOpen && (
              <div className="sos-details">
                <label className="field-label" htmlFor="sos-people">
                  People affected
                </label>
                <input
                  id="sos-people"
                  className="field-input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="e.g. 3"
                  value={people}
                  onChange={(e) => setPeople(e.target.value)}
                />
                <label className="sos-check">
                  <input
                    type="checkbox"
                    checked={trapped}
                    onChange={(e) => setTrapped(e.target.checked)}
                  />
                  People trapped
                </label>
                <label className="sos-check">
                  <input
                    type="checkbox"
                    checked={medical}
                    onChange={(e) => setMedical(e.target.checked)}
                  />
                  Medical emergency
                </label>
                <label className="field-label" htmlFor="sos-desc">
                  Description
                </label>
                <textarea
                  id="sos-desc"
                  className="field-input"
                  rows={2}
                  maxLength={2000}
                  placeholder="Anything that helps responders…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* F2 — hazard reporting */}
        <div className="panel hazard-panel">
          <div className="panel-title">Report a hazard</div>
          <div className="hazard-grid">
            {HAZARDS.map((h) => (
              <button
                key={h.category}
                className="hazard-btn"
                onClick={() => reportHazard(h.category, h.label)}
                disabled={!online}
              >
                <span className="hazard-icon">{h.icon}</span>
                <span className="hazard-label">{h.label}</span>
              </button>
            ))}
          </div>
          {!online && (
            <div className="hazard-offline-note">
              Hazard reports need a connection. Your SOS still works offline.
            </div>
          )}
          {hazardMsg && <div className="report-ok">✓ {hazardMsg}</div>}
        </div>
      </div>
    </div>
  );
}
