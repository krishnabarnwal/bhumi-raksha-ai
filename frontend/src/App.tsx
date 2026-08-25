import { useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import ScenarioControl from "./components/ScenarioControl";
import RiskPanel from "./components/RiskPanel";
import AlertsPanel from "./components/AlertsPanel";
import PriorityList from "./components/PriorityList";
import ReportForm from "./components/ReportForm";
import CommandMetrics from "./components/CommandMetrics";
import IncidentQueue from "./components/IncidentQueue";
import SosPanel from "./components/SosPanel";
import CitizenApp from "./components/CitizenApp";
import LanguageSwitcher from "./components/LanguageSwitcher";
import ThemeSwitcher from "./components/ThemeSwitcher";
import { useT } from "./i18n";
import { api } from "./api";
import type {
  Alert,
  Feature,
  FeatureCollection,
  Priority,
  ResponderStatus,
  ResponseResource,
  RiskResult,
  Scenario,
  SosCollection,
} from "./types";
import "./App.css";

const LEGEND: { label: string; color: string }[] = [
  { label: "LOW", color: "#2e7d32" },
  { label: "MODERATE", color: "#f9a825" },
  { label: "HIGH", color: "#ef6c00" },
  { label: "CRITICAL", color: "#c62828" },
];

type View = "command" | "citizen";

export default function App() {
  const { t } = useT();
  const [view, setView] = useState<View>("command");

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

  // --- emergency SOS ---
  const [sos, setSos] = useState<SosCollection | null>(null);
  const [selectedSosId, setSelectedSosId] = useState<number | null>(null);
  const [resources, setResources] = useState<ResponseResource[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [escalating, setEscalating] = useState(false);
  // Read the live scenario inside the interval without re-arming it each change.
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;

  // Initial load — every layer + baseline alerts + priorities + SOS, in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [z, d, r, v, i, inc, rep, al, pr, so, res] = await Promise.all([
          api.zones(),
          api.layer("districts"),
          api.layer("roads"),
          api.layer("villages"),
          api.layer("infrastructure"),
          api.layer("incidents"),
          api.fieldReports(),
          api.alerts(),
          api.priorities(),
          api.sosList(),
          api.responseResources(),
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
        setSos(so);
        setResources(res.resources);
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live SOS feed — poll every 5s while the command center is open so a citizen
  // SOS appears on the map without a manual refresh. Recomputed with the active
  // rainfall scenario so priority/recommendation track current conditions.
  useEffect(() => {
    if (view !== "command") return;
    const timer = setInterval(async () => {
      try {
        setSos(await api.sosList(scenarioRef.current));
      } catch {
        /* transient poll failure — keep the last good feed */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [view]);

  async function refreshSos() {
    try {
      setSos(await api.sosList(scenarioRef.current));
    } catch (e) {
      setError(errMsg(e));
    }
  }

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
      // zones + refreshed warnings + re-ranked priorities + re-triaged SOS;
      // refresh the open panel too. One compute path on the backend keeps the
      // map, alerts, priorities, SOS and panel in agreement.
      const [z, al, pr, so] = await Promise.all([
        api.zones(s),
        api.alerts(s),
        api.priorities(s),
        api.sosList(s),
      ]);
      setZones(z);
      setAlerts(al.alerts);
      setPriorities(pr.priorities);
      setSos(so);
      if (selectedZoneId != null) {
        setRisk(await api.zoneRisk(selectedZoneId, s));
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function selectSos(id: number) {
    setSelectedSosId(id);
  }

  async function assignSos(id: number, teamId?: string) {
    setAssigning(true);
    setError(null);
    try {
      await api.assignSos(id, teamId);
      await refreshSos(); // pull fresh triage so the panel shows ASSIGNED
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAssigning(false);
    }
  }

  // Advance an assigned incident along the responder lifecycle. The PATCH hits
  // the real backend (which validates the transition and stamps the timestamp);
  // we splice its returned feature into the live feed so the panel/map update
  // immediately, and the 5s poll keeps confirming it from the server.
  async function advanceSos(id: number, target: ResponderStatus, responderId: string) {
    setAdvancing(true);
    setError(null);
    try {
      const updated = await api.updateSosStatus(id, target, responderId);
      setSos((prev) =>
        prev
          ? {
              ...prev,
              features: prev.features.map((f) =>
                f.properties.id === id ? updated : f,
              ),
            }
          : prev,
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAdvancing(false);
    }
  }

  // Escalate an incident to the recommended response network. The POST hits the
  // real backend (which recomputes the response category server-side and records
  // a DEMO/SIMULATED dispatch); we splice the returned feature into the live feed
  // so the panel updates immediately, and the 5s poll keeps confirming it.
  async function escalateSos(id: number) {
    setEscalating(true);
    setError(null);
    try {
      const updated = await api.escalateSos(id);
      setSos((prev) =>
        prev
          ? {
              ...prev,
              features: prev.features.map((f) =>
                f.properties.id === id ? updated : f,
              ),
            }
          : prev,
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setEscalating(false);
    }
  }

  function switchView(v: View) {
    setView(v);
    if (v === "command") refreshSos();
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

  // The magenta "reports" layer shows ground-truth hazard reports only; SOS
  // incidents (also stored as field reports) have their own priority layer.
  const reportsView: FeatureCollection | null = reports
    ? {
        type: "FeatureCollection",
        features: reports.features.filter((f) => f.properties?.category !== "sos"),
      }
    : null;

  // SosCollection is structurally a FeatureCollection; the map reads id/priority
  // from feature properties at runtime. We also surface a top-level
  // `responder_status` (from the assignment) so the map can visually distinguish
  // lifecycle state — resolved incidents are dimmed on the map.
  const sosGeo: FeatureCollection | null = sos
    ? {
        type: "FeatureCollection",
        features: sos.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            responder_status: f.properties.assignment?.status ?? "PENDING",
          },
        })) as unknown as Feature[],
      }
    : null;

  const selectedSos =
    sos?.features.find((f) => f.properties.id === selectedSosId) ?? null;
  const sosCount = sos?.count ?? 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>
            Bhumi-Raksha <span className="ai">AI</span>
          </h1>
          <span className="tagline">{t("app.tagline")}</span>
        </div>
        <div className="header-center">
          <div className="view-toggle">
            <button
              className={view === "command" ? "active" : ""}
              onClick={() => switchView("command")}
            >
              {t("nav.command")}
            </button>
            <button
              className={view === "citizen" ? "active" : ""}
              onClick={() => switchView("citizen")}
            >
              {t("nav.citizen")}
            </button>
          </div>
        </div>
        <div className="header-right">
          {view === "command" && (
            <div className="legend">
              {LEGEND.map((l) => (
                <span className="legend-item" key={l.label}>
                  <span className="legend-dot" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
          <ThemeSwitcher />
          <LanguageSwitcher />
          <span className="badge-sim header-badge">DEMO / SIMULATED DATA</span>
        </div>
      </header>

      {error && <div className="error-banner">⚠ {error}</div>}

      {view === "citizen" ? (
        <CitizenApp
          scenario={scenario}
          onSosCreated={() => refreshSos()}
          onError={(msg) => setError(msg)}
        />
      ) : (
        <div className="workspace">
          <aside className="sidebar sidebar-left">
            <CommandMetrics sos={sos} />
            <IncidentQueue
              sos={sos}
              selectedSosId={selectedSosId}
              onSelect={selectSos}
            />
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
              reports={reportsView}
              sos={sosGeo}
              selectedZoneId={selectedZoneId}
              selectedSosId={selectedSosId}
              focusRequest={focusRequest}
              locating={locating}
              draftLocation={draftLocation}
              onSelectZone={selectZone}
              onSelectSos={selectSos}
              onPickLocation={pickLocation}
            />
            {locating && (
              <div className="map-hint">{t("map.pickLocation")}</div>
            )}
            {sosCount > 0 && (
              <div className="sos-count-badge">
                🚨 {t("map.activeSos", { count: sosCount })}
              </div>
            )}
          </main>

          <aside className="sidebar sidebar-right">
            <SosPanel
              sos={selectedSos}
              resources={resources}
              assigning={assigning}
              advancing={advancing}
              escalating={escalating}
              onAssign={assignSos}
              onAdvance={advanceSos}
              onEscalate={escalateSos}
            />
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
      )}
    </div>
  );
}

function errMsg(e: unknown): string {
  const base = e instanceof Error ? e.message : String(e);
  return `${base} — is the API running on ${api.base}?`;
}
