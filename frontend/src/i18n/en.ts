// English dictionary — the single source of truth for every UI string. Hindi
// (hi.ts) is typed against this via `Record<TranslationKey, string>`, so the
// build (tsc -b) fails if a translation is missing or a stray key sneaks in.
//
// Scope note (honesty boundary): only *UI chrome* lives here. Content generated
// by the backend — alert titles/reasons/recommended actions, risk factor names,
// the citizen safety headline/instruction, team names, disclaimers — is rendered
// as the server sends it, never re-authored client-side. Technical/enum tokens
// (risk levels LOW/MODERATE/HIGH/CRITICAL, priority tiers P1–P4, DEMO/SIMULATED
// badges, rainfall-in-mm) stay constant across languages by design.

export const en = {
  // --- shell / header ---
  "app.tagline": "Predict · Protect · Prevent",
  "nav.command": "Command Center",
  "nav.citizen": "Citizen App",
  "lang.label": "Language",
  "theme.label": "Theme",
  "theme.light": "Light",
  "theme.dark": "Dark",

  // --- map overlays ---
  "map.pickLocation": "Click the map to set the report location",
  "map.activeSos": "{count} active SOS",

  // --- rainfall scenario names (shared: ScenarioControl, RiskPanel, Citizen) ---
  "scenario.current": "Current",
  "scenario.normal": "Normal",
  "scenario.heavy": "Heavy",
  "scenario.extreme": "Extreme",

  // --- responder status labels (shared: IncidentQueue, SosPanel) ---
  "status.pending": "Pending",
  "status.assigned": "Assigned",
  "status.acknowledged": "Acknowledged",
  "status.en_route": "En route",
  "status.on_site": "On site",
  "status.resolved": "Resolved",

  // --- ScenarioControl ---
  "scn.title": "Rainfall scenario",
  "scn.hint": "drives live risk",
  "scn.recomputing": "Recomputing risk across all zones…",
  "scn.switchHint": "Switch scenario to re-run the risk engine.",

  // --- CommandMetrics (Operations) ---
  "ops.title": "Operations",
  "ops.hint": "live SOS feed",
  "ops.total": "Total",
  "ops.critical": "Critical",
  "ops.pending": "Pending",
  "ops.active": "Active",
  "ops.resolved": "Resolved",
  "ops.total.tip": "All SOS incidents in the feed",
  "ops.critical.tip": "P1 — highest AI priority tier",
  "ops.pending.tip": "Awaiting team assignment",
  "ops.active.tip": "Assigned and being worked (not yet resolved)",
  "ops.resolved.tip": "Responder marked the incident resolved",
  "ops.responseTimes": "Response times",
  "ops.fromTimestamps": "from recorded timestamps",
  "ops.noResponses": "no responses recorded yet",
  "ops.acknowledge": "Acknowledge",
  "ops.onSite": "On site",
  "ops.resolve": "Resolve",

  // --- IncidentQueue ---
  "queue.title": "Incident queue",
  "queue.empty": "No SOS incidents yet. A citizen SOS will appear here live.",
  "queue.escalated": "Escalated to the response network (simulated)",
  "queue.trapped": "trapped",
  "queue.medical": "medical",

  // --- AlertsPanel ---
  "alerts.title": "Early warnings",
  "alerts.empty": "No HIGH or CRITICAL zones in this scenario.",

  // --- PriorityList ---
  "priority.title": "Response Priority",
  "priority.hint": "risk × exposure",
  "priority.empty": "No zones to prioritize yet.",
  "priority.scoreExposed": "score {score} · {n} exposed",
  "priority.disclaimer":
    "DEMO / SIMULATED prioritization — decision support, not a guaranteed prediction.",

  // --- RiskPanel ---
  "risk.title": "Risk intelligence",
  "risk.computing": "Computing…",
  "risk.empty":
    "Select a zone on the map to see its risk score, contributing factors and recommended action.",
  "risk.confidence": "Confidence",
  "risk.scenarioTag": "scenario: {scenario}",
  "risk.computed": "Computed {time}",
  "risk.factorsTitle": "Contributing factors",
  "risk.impact": "{impact} impact",
  "risk.weight": "weight {weight}",
  "risk.recommendedTitle": "Recommended action",

  // --- ReportForm ---
  "report.title": "Field Report",
  "report.hint": "ground truth",
  "report.location": "Location",
  "report.clickMap": "Click the map…",
  "report.repick": "Re-pick on map",
  "report.pickOnMap": "📍 Pick on map",
  "report.cancel": "Cancel",
  "report.noLocation": "No location selected",
  "report.type": "Type",
  "report.severity": "Severity",
  "report.description": "Description",
  "report.descPlaceholder": "What did you observe on the ground?",
  "report.photo": "Photo (optional)",
  "report.submit": "Submit report",
  "report.submitting": "Submitting…",
  "report.submitted": "Report #{id} submitted{photo}.",
  "report.withPhoto": " with photo",
  "cat.slope_crack": "Slope crack",
  "cat.rockfall": "Rockfall",
  "cat.water_seepage": "Water seepage",
  "cat.slope_movement": "Slope movement",
  "cat.road_blockage": "Road blockage",
  "cat.landslide": "Landslide",
  "cat.other": "Other",
  "sev.low": "Low",
  "sev.medium": "Medium",
  "sev.high": "High",

  // --- SosPanel (operator detail) ---
  "sos.title": "SOS incident",
  "sos.empty":
    "Select an SOS marker on the map to see its severity, AI priority and the recommended response.",
  "sos.incident": "Incident #{id}",
  "sos.f.location": "Location",
  "sos.f.reported": "Reported",
  "sos.f.severity": "Severity",
  "sos.f.currentRisk": "Current risk",
  "sos.f.people": "People affected",
  "sos.f.trapped": "Trapped",
  "sos.f.medical": "Medical",
  "sos.yes": "Yes",
  "sos.no": "No",
  "sos.outsideRegion": "outside monitored region",
  "sos.aiPriority": "AI priority",
  "sos.priScore": "score {score}/100",
  "sos.deterministicNote": "Deterministic, explainable score — not an ML prediction.",
  "sos.recommendedResponse": "Recommended response",
  "sos.noTeamMatch": "No available team matches this incident yet.",
  "sos.estDistance": "~{km} km (estimated distance)",
  "sos.fromBase": "· from {base}",
  "sos.coverage": "· coverage {pct}%",
  "sos.responseNetwork": "Response network",
  "sos.routeRecommended": "Recommended",
  "sos.escalateToLabel": "Escalate to",
  "sos.supporting": "Supporting",
  "sos.escalated": "✓ Escalated",
  "sos.ref": "Ref {ref}",
  "sos.escalateBtn": "Escalate to Response Network",
  "sos.escalating": "Escalating…",
  "sos.responseTeam": "Response",
  "sos.updating": "Updating…",
  "sos.incidentResolved": "✓ Incident resolved",
  "sos.timeline": "Timeline",
  "sos.assignTeam": "Assign {team}",
  "sos.assigning": "Assigning…",
  "sos.noTeamToAssign": "No team to assign",
  "sos.overridePick": "Override — pick a team…",
  "sos.assign": "Assign",
  "sos.unavailable": " (unavailable)",
  "cap.search_rescue": "Search & rescue",
  "cap.medical": "Medical",
  "cap.field_verification": "Field verification",
  "cap.relief": "Relief",
  "cap.engineering": "Engineering",
  "sos.action.acknowledged": "Acknowledge",
  "sos.action.en_route": "Mark en route",
  "sos.action.on_site": "Mark on site",
  "sos.action.resolved": "Resolve incident",

  // --- CitizenApp ---
  "citizen.conn.syncing": "Online — syncing {count} saved SOS…",
  "citizen.conn.online": "Online — connected to command center",
  "citizen.conn.offline": "Offline — you can still send an SOS",
  "citizen.conn.offlineQueued": "Offline — you can still send an SOS · {count} queued",
  "citizen.loc.title": "Demo Location Simulator",
  "citizen.loc.gps": "GPS lock (simulated)",
  "citizen.loc.conditions": "conditions: {scenario}",
  "citizen.loc.sub.north": "North Sikkim",
  "citizen.loc.sub.capital": "Capital",
  "citizen.loc.sub.outside": "Outside region",
  "citizen.safety.checking": "Checking your area…",
  "citizen.safety.unavailable": "Risk status unavailable.",
  "citizen.safety.risk": "risk {score}/100",
  "citizen.safety.note":
    "This is an evolving risk estimate, not a prediction of an exact landslide. Follow local authority guidance.",
  "citizen.sos.sentBadge": "SOS SENT",
  "citizen.sos.sentBody":
    "Your emergency signal has reached the command center and is being triaged. Stay where you are if it is safe to do so.",
  "citizen.sos.sendAnother": "Send another update",
  "citizen.sos.deliveredBadge": "SOS DELIVERED",
  "citizen.sos.savedBadge": "SOS SAVED — QUEUED",
  "citizen.sos.deliveredBody":
    "Your queued SOS has been delivered to the command center now that the connection is back. Responders are being coordinated.",
  "citizen.sos.savedBody": "SOS saved. It will be sent automatically when connection returns.",
  "citizen.sos.waitingSync": "{count} SOS waiting to sync",
  "citizen.sos.addAnother": "Add another SOS",
  "citizen.sos.sending": "SENDING…",
  "citizen.sos.pressHelp": "Press for emergency help",
  "citizen.sos.addDetails": "+ Add details (optional)",
  "citizen.sos.hideDetails": "− Hide details",
  "citizen.sos.people": "People affected",
  "citizen.sos.peoplePlaceholder": "e.g. 3",
  "citizen.sos.trapped": "People trapped",
  "citizen.sos.medical": "Medical emergency",
  "citizen.sos.description": "Description",
  "citizen.sos.descPlaceholder": "Anything that helps responders…",
  "citizen.hazard.title": "Report a hazard",
  "citizen.hazard.landslide": "Landslide",
  "citizen.hazard.flood": "Flood",
  "citizen.hazard.road": "Road Blocked",
  "citizen.hazard.other": "Other",
  "citizen.hazard.offlineNote":
    "Hazard reports need a connection. Your SOS still works offline.",
  "citizen.hazard.reported": "{label} reported (#{id}). Thank you — authorities notified.",

  // --- CitizenApp: bottom navigation ---
  "citizen.nav.home": "Home",
  "citizen.nav.report": "Report",
  "citizen.nav.reports": "My Reports",
  "citizen.nav.info": "Safety",

  // --- CitizenApp: Report page ---
  "citizen.report.from": "Reporting from {location}",

  // --- CitizenApp: My Reports page ---
  "citizen.myReports.title": "My Reports",
  "citizen.myReports.note": "Saved on this device",
  "citizen.myReports.empty":
    "You haven't sent any reports from this device yet.",
  "citizen.myReports.sos": "SOS signal",
  "citizen.myReports.offline": "Queued offline",

  // --- CitizenApp: Emergency Info page ---
  "citizen.info.title": "Emergency Info",
  "citizen.info.intro":
    "Quick preparedness guidance for landslides and floods in your region.",
  "citizen.info.emergencyNumber": "National emergency number (India)",
  "citizen.info.call": "Call 112",
  "citizen.info.landslide.title": "If a landslide seems likely",
  "citizen.info.landslide.1":
    "Move away from steep slopes, gullies and loose or water-logged soil.",
  "citizen.info.landslide.2":
    "Watch for new cracks, tilting trees or sudden changes in stream flow.",
  "citizen.info.landslide.3":
    "If evacuation is advised, leave early and use the recommended route.",
  "citizen.info.flood.title": "In case of flooding",
  "citizen.info.flood.1":
    "Move to higher ground; never walk or drive through flowing water.",
  "citizen.info.flood.2":
    "Keep drinking water, a torch and a charged phone within reach.",
  "citizen.info.flood.3":
    "Stay away from bridges and roads beside fast-moving water.",
  "citizen.info.disclaimer":
    "General preparedness guidance — not a substitute for official warnings. Always follow local authority instructions.",
} as const;

export type TranslationKey = keyof typeof en;
export type Lang = "en" | "hi";
