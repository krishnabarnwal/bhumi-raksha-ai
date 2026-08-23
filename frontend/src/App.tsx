import { useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import ScenarioControl from "./components/ScenarioControl";
import RiskPanel from "./components/RiskPanel";
import AlertsPanel from "./components/AlertsPanel";
import PriorityList from "./components/PriorityList";
import ReportForm from "./components/ReportForm";
import { api } from "./api";
import type {
  Alert,
  FeatureCollection,
  Priority,
  RiskResult,
  Scenario,
} from "./types";
import "./App.css";

const LEGEND: { label: string; color: string }[] = [
  { label: "LOW", color: "#2e7d32" },
  { label: "MODERATE", color: "#f9a825" },
  { label: "HIGH", color: "#ef6c00" },
  { label: "CRITICAL", color: "#c62828" },
];

export default function App() {
  const [zones, setZones] = useState<FeatureCollection | null>(null);
  const [districts, setDistricts] = useState<FeatureCollection | null>(null);
  const [roads, setRoads] = useState<FeatureCollection | null>(null);
  const [villages, setVillages] = useState<FeatureCollection | null>(null);
  const [infrastructure, setInfrastructure] = useState<FeatureCollection | null>(null);
  const [incidents, setIncidents] = useState<FeatureCollection | null>(null);
  const [reports, setReports] = useState<FeatureCollection | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("current");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: number; nonce: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [draftLocation, setDraftLocation] = useState<{ lat: number; lon: number } | null>(null);
  const nonce = useRef(0);

  // Initial load — every layer + baseline alerts + priorities, in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [z, d, r, v, i, inc, rep, al, pr] = await Promise.all([
          api.zones(),
          api.layer("districts"),
          api.layer("roads"),
          api.layer("villages"),
          api.layer("infrastructure"),
          api.layer("incidents"),
          api.fieldReports(),
          api.alerts(),
          api.priorities(),
        ]);
        if (cancelled) return;
        setZones(z);
        setDistricts(d);
        setRoads(r);
        setVillages(v);
        setInfrastructure(i);
        setIncidents(inc);
        setReports(rep);
        setAlerts(al.alerts);
        setPriorities(pr.priorities);
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectZone(id: number) {
    setSelectedZoneId(id);
    nonce.current += 1;
    setFocusRequest({ id, nonce: nonce.current });
    setRiskLoading(true);
    try {
      setRisk(await api.zoneRisk(id, scenario));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setRiskLoading(false);
    }
  }

  async function changeScenario(s: Scenario) {
    setScenario(s);
    setBusy(true);
    setError(null);
    try {
      // Re-score every zone under the new scenario and pull the recoloured
      // zones + refreshed warnings + re-ranked priorities; refresh the open
      // panel too. One compute path on the backend keeps the map, alerts,
      // priorities and panel in agreement.
      const [z, al, pr] = await Promise.all([
        api.zones(s),
        api.alerts(s),
        api.priorities(s),
      ]);
      setZones(z);
      setAlerts(al.alerts);
      setPriorities(pr.priorities);
      if (selectedZoneId != null) {
        setRisk(await api.zoneRisk(selectedZoneId, s));
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function pickLocation(lat: number, lon: number) {
    setDraftLocation({ lat, lon });
    setLocating(false);
  }

  async function onReportSubmitted() {
    setDraftLocation(null);
    setLocating(false);
    try {
      setReports(await api.fieldReports());
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>
            Bhumi-Raksha <span className="ai">AI</span>
          </h1>
          <span className="tagline">Predict · Protect · Prevent</span>
        </div>
        <div className="header-right">
          <div className="legend">
            {LEGEND.map((l) => (
              <span className="legend-item" key={l.label}>
                <span className="legend-dot" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
          <span className="badge-sim header-badge">DEMO / SIMULATED DATA</span>
        </div>
      </header>

      {error && <div className="error-banner">⚠ {error}</div>}

      <div className="workspace">
        <aside className="sidebar sidebar-left">
          <ScenarioControl scenario={scenario} onChange={changeScenario} busy={busy} />
          <AlertsPanel
            alerts={alerts}
            selectedZoneId={selectedZoneId}
            onSelect={selectZone}
          />
          <PriorityList
            items={priorities}
            selectedZoneId={selectedZoneId}
            onSelect={selectZone}
          />
        </aside>

        <main className="map-wrap">
          <MapView
            zones={zones}
            districts={districts}
            roads={roads}
            villages={villages}
            infrastructure={infrastructure}
            incidents={incidents}
            reports={reports}
            selectedZoneId={selectedZoneId}
            focusRequest={focusRequest}
            locating={locating}
            draftLocation={draftLocation}
            onSelectZone={selectZone}
            onPickLocation={pickLocation}
          />
          {locating && (
            <div className="map-hint">Click the map to set the report location</div>
          )}
        </main>

        <aside className="sidebar sidebar-right">
          <RiskPanel risk={risk} loading={riskLoading} />
          <ReportForm
            locating={locating}
            draftLocation={draftLocation}
            onStartLocating={() => setLocating(true)}
            onCancelLocating={() => setLocating(false)}
            onSubmitted={onReportSubmitted}
            onError={(msg) => setError(msg)}
          />
        </aside>
      </div>
    </div>
  );
}

function errMsg(e: unknown): string {
  const base = e instanceof Error ? e.message : String(e);
  return `${base} — is the API running on ${api.base}?`;
}
