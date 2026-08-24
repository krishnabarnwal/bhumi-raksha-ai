import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type {
  FieldReportCategory,
  RiskAtResult,
  Scenario,
  SosFeature,
} from "../types";

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

function newUuid(): string | undefined {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : undefined;
}

export default function CitizenApp(props: CitizenAppProps) {
  const { scenario } = props;
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
  const [sosConfirm, setSosConfirm] = useState<SosFeature | null>(null);
  const [hazardMsg, setHazardMsg] = useState<string | null>(null);

  // Re-fetch the citizen's risk whenever the simulated location or the shared
  // rainfall scenario changes. A stale-guard keeps the latest response winning.
  const reqRef = useRef(0);
  useEffect(() => {
    const seq = ++reqRef.current;
    setRiskLoading(true);
    (async () => {
      try {
        const r = await api.riskAt(loc.lat, loc.lon, scenario);
        if (seq === reqRef.current) setRisk(r);
      } catch (e) {
        if (seq === reqRef.current) {
          props.onError(e instanceof Error ? e.message : String(e));
          setRisk(null);
        }
      } finally {
        if (seq === reqRef.current) setRiskLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, scenario]);

  function chooseLocation(preset: (typeof PRESETS)[number]) {
    setLoc(preset);
    setSosConfirm(null);
    setHazardMsg(null);
  }

  async function pressSos() {
    if (submitting) return;
    setSubmitting(true);
    setHazardMsg(null);
    try {
      const peopleNum = people.trim() === "" ? undefined : Math.max(0, Number(people));
      const feature = await api.createSos({
        lat: loc.lat,
        lon: loc.lon,
        people_affected: Number.isFinite(peopleNum as number) ? peopleNum : undefined,
        trapped,
        medical,
        description: description.trim() || undefined,
        client_uuid: newUuid(),
      });
      setSosConfirm(feature);
      props.onSosCreated(feature);
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
        {sosConfirm ? (
          <div className="panel sos-confirm">
            <div className="sos-confirm-badge">SOS SENT</div>
            <div className="sos-confirm-id">
              Incident #{sosConfirm.properties.id} ·{" "}
              <span className="sos-confirm-priority">
                {sosConfirm.properties.priority}
              </span>
            </div>
            <div className="sos-confirm-body">
              Your emergency signal has reached the command center and is being
              triaged. Stay where you are if it is safe to do so.
            </div>
            <button className="sos-again" onClick={() => setSosConfirm(null)}>
              Send another update
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
              >
                <span className="hazard-icon">{h.icon}</span>
                <span className="hazard-label">{h.label}</span>
              </button>
            ))}
          </div>
          {hazardMsg && <div className="report-ok">✓ {hazardMsg}</div>}
        </div>
      </div>
    </div>
  );
}
