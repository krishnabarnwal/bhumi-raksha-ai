# BHUMI-RAKSHA AI — Discovery & Feasibility Analysis

**Tagline:** *Predict. Protect. Prevent.*
**Event:** Smart India Hackathon (SIH) 2026
**Problem Statement:** 26001 — AI-Based Early Warning and Landslide Risk Monitoring System in NER
**Organization:** Ministry of Development of North Eastern Region (MDoNER) · Theme: Disaster Management
**Document status:** Phase 0 output (Discovery & Feasibility). No application code written yet.
**Date:** 2026-08-23

---

## How to read this document (verification method)

This analysis is **research-grounded, not asserted from memory**, per the project's Research-First Rule (§9) and Data Realism Rule (§18). Findings were compiled from five parallel verified-research passes (existing systems, rainfall/weather data, terrain/satellite data, landslide inventories + GIS base data, and AI/ML methodology). Each pass was instructed to verify against primary sources or explicitly flag uncertainty.

**Verification legend used throughout:**

- ✅ **Verified** this session from an authoritative primary source.
- ⚠️ **UNVERIFIED** — plausible/widely-documented but could not be confirmed from a live authoritative source this session; **must be re-checked before being stated as fact** to judges.
- 🎭 **SIMULATED / DEMO DATA** — use mock data behind a real-provider seam; must be labelled "DEMO / SIMULATED DATA" in the UI and never presented as a live government feed.

> Honesty is a competitive asset here: most entries overclaim. We will always show risk **probability + confidence + contributing factors**, never "guaranteed" or "100% accurate" prediction.

---

## A. Problem Decomposition

**Core problem.** The North Eastern Region experiences frequent monsoon-triggered landslides that block roads, isolate villages, and damage infrastructure. Monitoring today is **reactive and manual** — incidents are reported *after* they occur. No operational system fuses terrain, rainfall, and field evidence into a *forward-looking, localized, explainable* risk signal for the eight NE states.

**Root causes (two layers):**

- **Physical:** fragile young Himalayan lithology, steep slopes, intense orographic monsoon rainfall, high antecedent soil moisture, seismicity, plus anthropogenic hill-cutting and unplanned road construction.
- **Systemic (the part software can fix):** prediction and alerting are **decoupled**; hazard maps are **static (GSI 1:50,000)**; rainfall triggers are **district-level and rainfall-only**; there is **no citizen/field feedback loop**; and a documented **"forecast → warning → action" gap** exists in Indian impact-based forecasting (✅ DOI 10.1016/j.nhres.2023.09.005).

**Existing limitations (✅ verified):** no confirmable NER-specific operational Landslide EWS; India's two confirmed operational pilots (Darjeeling, Nilgiris) are **outside** the 8 NE states; authoritative data sits behind **PDFs or blocked portals** (GSI Bhukosh refused connection this session); the flagship GSI–BGS **LANDSLIP** programme **ended June 2022**.

**Stakeholders & core needs:**

| Role | Primary need | Decisive question |
|---|---|---|
| District Administrator | Regional risk overview, priorities, decision support | *What do I act on first?* |
| Disaster Mgmt Officer (SDMA/DDMA) | Incident monitoring, trends, field coordination | *Where is it worsening?* |
| Field Officer | Mobile capture, GPS, camera, **offline**, assigned tasks | *What do I inspect, and can I report with no signal?* |
| Citizen | Local warnings, easy hazard reporting, multilingual | *Is my area safe, and how do I report a crack?* |
| System Admin | Users, data, model monitoring, audit logs | *Is the system healthy and accountable?* |

**Representative user journeys:**

1. *Administrator:* opens GIS Command Center → sees a red zone on NH corridor → reads AI "why" → checks affected villages/population → escalates P1 → triggers alert.
2. *Field officer (offline):* assigned an inspection → drives into no-signal valley → captures geo-tagged crack photo + severity → stored locally → auto-syncs on return; CV pre-classifies the image.
3. *Citizen:* receives a multilingual warning for their block → reports a blocked road with a photo → report feeds the risk/priority engine.

**Critical operational requirements** (these constrain every later choice): offline-first field capture, low-network sync, multilingual alerts, **explainability** (an officer must understand *why*), and a **low false-alarm rate** to avoid alert fatigue and liability.

---

## B. Existing Solution Landscape

| System | What it does (✅ verified unless noted) | Key gap |
|---|---|---|
| **GSI** — NLSM, Bhukosh, LEWS | National Landslide Susceptibility Mapping at 1:50,000; regional rainfall-threshold forecasts for Darjeeling & Nilgiris (✅ DOIs 10.5194/egusphere-egu23-11853, 10.1007/978-3-031-16898-7_27) | Static maps; **NER not covered operationally**; Bhukosh bulk/API access ⚠️ UNVERIFIED |
| **LANDSLIP** (GSI+BGS+KCL+UKMO+Amrita+CNR) | Prototype regional LEWS, trigger-threshold values, daily hazard product (✅ landslip.org) | **Ended June 2022**; site unmaintained; pilots outside NER |
| **NDMA** | Policy guidelines; **National Landslide Atlas 2023** (✅ downloadable PDF); **SACHET** CAP-based geo-targeted alerts (✅) | Alert *pipe* with **no predictive engine**; atlas is a static PDF |
| **ISRO / NRSC / Bhuvan** | Satellite-derived hazard atlases, imagery portal | Static/inventory-oriented; not real-time; portal access friction (⚠️) |
| **IMD** | **Impact-based forecasting** (✅ real programme, DOI 10.54302/mausam.v74i2.6180); colour-coded rainfall warnings; CAP RSS | Rainfall forecasts, **not landslide forecasts**; not fused with slope-scale susceptibility |
| **NASA LHASA / COOLR** *(global prior art)* | Open near-real-time global nowcast (GPM rainfall × susceptibility); open citizen landslide repository (✅) | ~1 km resolution — **too coarse for NER slopes**; not India-tuned |
| **Hong Kong / Italy** *(prior art)* | Mature operational rainfall-threshold LEWS (✅ literature) | Reference designs, not deployable to NER as-is |

**White-space (our defensible position):** an **NER-tuned, higher-resolution, multi-source fusion nowcast** that (1) fuses rainfall + terrain + soil moisture + field evidence, (2) is **explainable per zone**, (3) closes the loop with **citizen/field reports** (which India lacks operationally), and (4) emits **CAP-compatible alerts** ready to ride the existing SACHET pipe.

---

## C. Data Feasibility

### C1. Rainfall & Weather (the dynamic trigger)

| Source | Data | Access | Availability | Update/latency | Cost | API | Prototype |
|---|---|---|---|---|---|---|---|
| **Open-Meteo** ✅ | Forecast + ERA5 historical rainfall | REST/JSON, **no key** | Public, global | Fcst live; hist ~5-day | Free (non-comm.) | **Yes** | **HIGH** — best demo driver |
| **IMD gridded 0.25°** ✅ | Daily rainfall **1901–2024** | NetCDF bulk (IMD Pune) | Public, India | Annual | Free | No (files) | **HIGH** — authoritative baseline/thresholds |
| **IMD `api.imd.gov.in`** ⚠️ | Real-time obs/forecast/warnings | REST, account-gated | Portal exists; **terms UNVERIFIED** | Real-time | Unknown | Yes | **MED** — do not hard-depend for demo |
| **GPM IMERG** ✅ | Satellite rainfall grid | GES DISC (Earthdata login) | Public | Early **~4 h**, 10 km | Free | Partial | **MED** — best *production* NRT driver |
| **NASA POWER** ✅ | Daily precip, keyless | REST | Public global | ~1-wk lag, 0.5° | Free | Yes | **MED** — coarse for slopes |
| **ERA5 / CHIRPS** ✅ | Reanalysis / 5 km historical | `cdsapi` / GEE | Public (accounts) | ~5-day / days | Free | Yes | **MED** — training/threshold calibration |

> **Recommendation:** Demo on **Open-Meteo** (keyless, live + historical); calibrate thresholds on **IMD gridded + CHIRPS**; cite **IMD API + GPM IMERG** as the production path. **IMD is the authoritative Indian reference** even though its API terms are ⚠️ unconfirmed. CHIRPS v2 ends after Dec 2026 → plan for v3.

### C2. Terrain / Elevation / Satellite / Soil moisture

| Source | Data | Access | Cost | Prototype |
|---|---|---|---|---|
| **Copernicus GLO-30** ✅ | 30 m DEM | AWS S3 (no-sign), STAC | Free | **HIGH** — cleanest DEM |
| **SRTM 30 m (GEE)** ✅ | DEM → slope/aspect/TWI | `ee.Image` one-liner | Free | **HIGH** — fastest terrain path |
| **CartoDEM (ISRO)** ⚠️ | Indian DEM; resolution ⚠️ | Bhoonidhi (login) | Free | **MED** — strong "indigenous" narrative, access friction |
| **Sentinel-2 (10 m)** ✅ | Optical NDVI/NDWI | GEE / CDSE | Free | **HIGH** (cloud-limited in monsoon) |
| **Sentinel-1 (10 m SAR)** ✅ | Cloud-proof backscatter/change | GEE / ASF | Free | **HIGH** for change; InSAR **MED-LOW** (heavy) |
| **NISAR (NASA-ISRO)** ✅ | L-band InSAR + soil moisture | ASF + **ISRO Bhoonidhi** | Free | **Ops since Jan 2026** — pilot + **production centerpiece** |
| **ESA WorldCover / Dynamic World (10 m)** ✅ | Land cover (static / near-real-time) | AWS / GEE | Free | **HIGH** |
| **SMAP soil moisture** ✅ | 9–36 km surface/root-zone | earthaccess / GEE | Free | **MED** — coarse; regional wetness proxy only |

> **Recommendation:** Use **Google Earth Engine as the hub** (SRTM/Copernicus → slope/aspect/curvature/TWI; WorldCover; S1/S2). Note: GEE is **free for the research prototype**; operational/commercial government use needs a paid license (flag in production plan). **NISAR is the standout real 2026 asset** — a genuine ISRO tie-in and an honest production roadmap.

### C3. Historical landslide labels (for ML) & GIS base

| Source | Role | Access | Prototype |
|---|---|---|---|
| **Sikkim multi-temporal inventory** (✅ Zenodo 10.5281/zenodo.8169506) | **Best NER training labels** (~484, shapefile) | Open | **HIGH** (Sikkim only) |
| **Eastern Himalaya inventory** (✅ Zenodo 10.5281/zenodo.18931430) | Regional labels (KML) | Open | **MED-HIGH** |
| **NASA GLC / COOLR** ✅ | Coarse positives; citizen-report model | CSV/viewer | **HIGH to obtain, LOW as precise labels** (media-biased, sparse in NER) |
| **NASA global susceptibility GeoTIFF (2023)** ✅ | Susceptibility **prior/feature** | Direct download | **HIGH** (coarse, not ground truth) |
| **GSI Bhukosh** ⚠️ | Authoritative inventory | Portal blocked this session | **LOW-MED** — pursue only if access obtained |
| **OSM (Geofabrik NE-Zone extract)** ✅ | Roads/villages/hospitals/bridges | `.osm.pbf` + Overpass, ODbL | **HIGH** (thin in interior AR/NL/MN) |
| **GeoSadak / PMGSY** ✅ | Rural roads/POIs, **commercial-OK license** | Open Data (GODL) | **HIGH** — fills OSM gaps |
| **DataMeet boundaries (CC-BY)** ✅ | State/district polygons | GitHub | **HIGH** (prefer over GADM's non-commercial terms) |
| **Census 2011 (via DataMeet)** ⚠️ | Population exposure join | Excel + polygons | **MED-HIGH** — verify per-state coverage |

> **Honest limitation to state up front:** NER landslide inventories are **sparse, single-region (mostly Sikkim / Eastern Himalaya), and spatially biased**; there are **no clean "no-landslide" negatives**. A hackathon model is a **proof-of-concept, not operationally validated**.

### C4. Data-realism ledger (§18 compliance)

- **Real & pluggable in the demo:** Open-Meteo rainfall, GLO-30/SRTM terrain, ESA WorldCover, OSM/GeoSadak, DataMeet boundaries, open Zenodo inventories, NASA susceptibility GeoTIFF.
- 🎭 **Simulated-for-demo (labelled "DEMO / SIMULATED DATA"):** live IoT sensor readings, high-resolution real-time soil moisture, and any "live IMD/ISRO feed" — placed behind a **`WeatherProvider` / `SatelliteProvider` adapter** so `MockProvider` swaps to `IMDProvider` / `NISARProvider` later without touching the engine.
- **Never claim:** "live ISRO/IMD data," "98% accuracy," or "real-time satellite feed" unless the specific verified source is actually wired in.

---

## D. AI Feasibility

**The credible framing (mirrors NASA LHASA v2, the operational reference):** solve **two coupled problems**, not one magic predictor.

1. **WHERE — Susceptibility (static).** Binary classification (landslide vs non-landslide) over grid/mapping units using conditioning factors. **Features:** slope, aspect, elevation, curvature, TWI, distance-to-road/river/fault, lithology, land cover, NDVI. **Models:** **XGBoost (primary)** or Random Forest, with **Logistic Regression as an interpretable baseline** — tree ensembles are consistently top performers on tabular susceptibility and were NASA's operational choice.
2. **WHEN — Rainfall trigger (dynamic).** Gate/modulate susceptibility with a **rainfall Intensity–Duration threshold + antecedent (multi-window) rainfall + soil-moisture** signal → a **daily, regional, probabilistic nowcast** with a defensible *prediction window* (e.g., "elevated next 6–24 h"). This is the honest way to get "when" without false precision.

**Output (responsible-AI, per project §5 spec):** risk score + level + prediction window + **top contributing factors** + **confidence/uncertainty** + recommended action.

**Evaluation (credibility-critical):** **spatial / spatiotemporal cross-validation** (hold out regions/time — never random splits, which leak via spatial autocorrelation); report **AUC-ROC + Precision-Recall** (severe class imbalance: LHASA v2 had ~9.7k positives vs 1M+ negatives) + TPR/FPR at the operating threshold; **document the negative-sampling strategy explicitly** and test sensitivity. **Do not headline a single inflated AUC.**

**Explainability:** **SHAP** on the tabular model for global + **per-zone local "why,"** cross-checked against XGBoost gain importance.

**Computer Vision (support only, never predictor):** transfer-learned CNN (ResNet/EfficientNet) classifying **visible distress** (cracks, scarps, debris, road blockage) in field photos → **confidence-weighted evidence** into the engine + a verification aid. Note honestly: no large *ground-photo* landslide dataset exists (public datasets like **Landslide4Sense**, ✅ arXiv 2206.00515, are satellite/UAV segmentation) — so field-CV is a curated-dataset MVP, framed as triage, not proof.

---

## E. Unique Innovation Opportunities (differentiators)

1. **The NER operational void, filled.** A higher-resolution, NER-tuned fusion nowcast where Darjeeling/Nilgiris pilots and coarse global models don't reach — a *verifiable* gap, not a marketing claim.
2. **Dynamic risk, not a static map.** Susceptibility **× live rainfall/soil-moisture** = a time-varying nowcast with confidence — the LHASA pattern, localized to NER.
3. **Closed field-evidence loop (human-in-the-loop).** COOLR-style citizen/field reports + field-CV that **measurably update** a zone's risk and priority — India lacks this operationally.
4. **Explainable → actionable.** SHAP "why" feeding an **LLM-generated authority briefing** and **multilingual citizen alert** — directly attacks the documented forecast-to-action gap.
5. **Connectivity-impact prioritization.** A road-graph over OSM + GeoSadak answers *"which villages get isolated if segment X fails?"* — turning risk into emergency-ranked action (the P1/P2/P3 board).
6. **Integration-ready by design + NISAR roadmap.** Provider adapters (Mock → IMD/ISRO/GSI) and a real, current **NISAR** deformation pilot make the production path concrete and honest.

---

## F. Recommended Product Architecture

```
                       ┌─────────────────────────────────────────────┐
  DATA PROVIDERS       │  Ingestion & Normalization (adapters)        │
  (adapter seam)  ───► │  WeatherProvider | TerrainProvider |         │
  Open-Meteo/IMD•      │  SatelliteProvider | InventoryProvider       │
  GLO-30/GEE•          └───────────────┬─────────────────────────────┘
  OSM/GeoSadak•                        ▼
  Zenodo labels•            ┌────────────────────┐   validated, geo-referenced
  🎭 MockSensor            │  PostGIS (core DB)  │   features + entities
                            └─────────┬──────────┘
                                      ▼
        ┌───────────────────────────────────────────────────────┐
        │  RISK ENGINE (Python)                                  │
        │  Susceptibility model (XGBoost) × Rainfall trigger     │
        │  → score/level/window/confidence + SHAP contributors   │
        │  CV service (field-photo distress classifier)          │
        └───────────┬──────────────────────────┬────────────────┘
                    ▼                           ▼
        ┌────────────────────┐      ┌─────────────────────────┐
        │  GIS Command Center│      │  Emergency Prioritizer   │
        │ (MapLibre heatmap, │      │ (risk×population×road    │
        │  layers, reports)  │      │  importance → P1/P2/P3)  │
        └─────────┬──────────┘      └───────────┬─────────────┘
                  ▼                              ▼
        ┌────────────────────────────────────────────────────┐
        │  ALERT ENGINE → CAP XML (SACHET-compatible) +        │
        │  in-app/web-push + multilingual (LLM) messages       │
        └─────────┬──────────────────────────────────────────┘
                  ▼
   ┌───────────────────────────┐        ┌──────────────────────────────┐
   │ Field/Citizen PWA         │◄──────►│ Offline store (IndexedDB) +   │
   │ (offline-first capture)   │  sync  │ Service Worker Background Sync│
   └───────────────────────────┘        └──────────────────────────────┘
```

**Flows:**

- **Data flow:** providers → validate/normalize → PostGIS.
- **AI flow:** susceptibility × rainfall trigger → scored zones + SHAP contributors + confidence.
- **GIS flow:** serve zones/layers/reports to MapLibre.
- **Alert flow:** threshold crossing → CAP XML + web-push + multilingual message.
- **Offline sync flow:** capture locally (IndexedDB) → queue → background-sync on reconnect → server dedup/merge → engine update.

---

## G. MVP vs Future Scope

**SIH MVP (build only this):**

- GIS Command Center (risk heatmap + roads/villages/hospitals + green/yellow/orange/red).
- Risk engine: susceptibility (XGBoost, trained on Sikkim + Eastern Himalaya labels) × **Open-Meteo** rainfall → score/level/window/confidence + **SHAP contributors**.
- Field/citizen reporting: geo-tagged photo + category + severity; **offline-first PWA** with background sync.
- Field-photo CV classifier (distress yes/no + type) as *supporting evidence*.
- Emergency prioritization board (P1/P2/P3) using risk × population × road importance.
- Alert engine: in-app + web-push + **CAP XML** output; multilingual message generation (English / Hindi / Assamese / Bengali / Nepali).
- Auth + RBAC + audit log; the demo storyline end-to-end (project §17).

**Future / Production (roadmap — do not build now):** IMD/ISRO/GSI live integrations; **NISAR / Sentinel-1 InSAR** deformation; physical IoT sensors; native mobile; SMS gateway; SACHET production hand-off; NER-wide retraining; formal validation study.

---

## H. Recommended Technology Stack (with reasoning)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + Vite + Tailwind** | Fast, conventional, matches project §13 direction |
| Map | **MapLibre GL** | Open, vector tiles, **no API key** (vs Mapbox); serious GIS feel |
| Backend + AI | **Python + FastAPI** (single service for MVP, ML module separable) — **[DECISION LOCKED]** | ML ecosystem (XGBoost / scikit-learn / SHAP) + geo stack (GeoPandas / rasterio / Shapely) are Python-native; **one runtime avoids over-engineering** (§23). Split ML into its own service later at the existing seam |
| DB | **PostgreSQL + PostGIS** | Geospatial queries are the project's core; non-negotiable |
| Storage | **S3-compatible (MinIO locally)** | Media/assets; swaps to cloud object storage in prod |
| Field app | **PWA** (Service Worker + IndexedDB + Background Sync) | True offline-first, cross-platform, low effort; native is future |
| Auth | **JWT + RBAC** | Roles are central; per project §14 |
| LLM | **Claude (latest, e.g. Opus/Sonnet 5)** for briefings / multilingual / summaries | Generative text only — **not** the scientific predictor (§10) |
| Queue | **Redis — optional / deferred** | Only if CV/sync needs it; avoid premature complexity |

---

## I. Risk & Limitation Analysis

- **Data:** sparse/biased labels (mostly Sikkim); coarse soil moisture (9–36 km); IMD API terms ⚠️ unconfirmed; Bhukosh blocked; portal friction for ISRO products.
- **Model:** severe class imbalance; spatial autocorrelation (→ spatial CV mandatory); **susceptibility ≠ exact timing**; non-stationarity (new roads/climate shift relationships); IMERG underestimates intense convective bursts (false negatives in monsoon NER).
- **Connectivity:** the reason for offline-first; sync conflicts must be handled (last-write + server merge).
- **False positives** → alert fatigue & credibility loss; **false negatives** → the dangerous case. Mitigate with confidence bands, human-in-the-loop verification, and conservative thresholds.
- **Deployment / government integration:** SACHET/IMD/GSI hand-offs need official MoUs; we design CAP-compatible + adapter seams so we are *ready*, not *pretending*.
- **Responsible-AI / liability:** always show probability + confidence + "DEMO / SIMULATED DATA" labels; never issue a bare "landslide at 3 pm" claim.

---

## J. Final Recommendation

1. **Product definition:** an **AI-powered, GIS-driven, NER-tuned landslide risk-intelligence & early-warning platform** that fuses rainfall + terrain + soil moisture + field evidence into an **explainable, probabilistic nowcast**, prioritizes emergencies by connectivity impact, and emits **CAP-compatible multilingual alerts** — offline-capable for field reality.
2. **Core USP:** *"The only NER-tuned system that turns multi-source risk into an explainable, field-verified, action-ranked warning — and is honest about its confidence."*
3. **Recommended MVP:** Section G list, driven end-to-end by the project §17 demo storyline.
4. **Recommended architecture:** Section F — provider adapters → PostGIS → Python risk engine (XGBoost × rainfall + SHAP) → MapLibre GIS + prioritizer → CAP/push alerts → offline PWA.
5. **Biggest technical risk:** **label scarcity + honest validation** — sparse, single-region inventories mean the model must be presented as a rigorously-evaluated proof-of-concept (spatial CV, PR curves, documented negative sampling), not "accurate prediction."
6. **Biggest SIH judging advantage:** a **verifiable, unfilled NER operational gap** + a scientifically credible, **explainable** engine + a **real NISAR/ISRO production roadmap** + demonstrated **field/offline reality** — depth and honesty where most entries overclaim.
7. **What to build FIRST (Phase 1 foundation):** repo scaffold + `docker-compose` (Postgres/PostGIS, FastAPI, MinIO) + the **data model & migrations** (project §15 entities) + the **provider-adapter interfaces** with Mock providers and one real feed (Open-Meteo) wired in — the spine everything else attaches to.

---

## Locked decisions (from stakeholder review, 2026-08-23)

- **Backend runtime:** Python + FastAPI (single service for MVP; ML module separable later).
- **Demo focus region:** **Sikkim** (best open, GIS-ready landslide labels → most credible trained model for the demo).
- **Next step:** save this analysis (done) → plan Phase 1 (Architecture + Data Model foundation) for approval before writing code.

---

## Appendix — Key sources & verification status

**Verified primary sources (representative):**

- NASA LHASA v2 (operational reference): DOI 10.3389/feart.2021.640043; https://gpm.nasa.gov/applications/landslides; https://github.com/nasa/lhasa
- Landslide4Sense CV benchmark: arXiv 2206.00515
- LANDSLIP (GSI+BGS): https://www.landslip.org/ ; DOIs 10.5194/egusphere-egu22-4990, 10.5194/egusphere-egu23-11853, 10.1007/978-3-031-16898-7_27
- IMD impact-based forecasting: DOI 10.54302/mausam.v74i2.6180; forecast-to-action gap: DOI 10.1016/j.nhres.2023.09.005
- NDMA: National Landslide Atlas 2023 (PDF); SACHET (sachet.ndma.gov.in); NLRMS 2019; Guidelines 2009
- Rainfall/weather: Open-Meteo (open-meteo.com); IMD 0.25° gridded (imdpune.gov.in); GPM IMERG (gpm.nasa.gov/data/imerg); NASA POWER; ERA5 (Copernicus CDS); CHIRPS (UCSB CHC)
- Terrain/satellite: Copernicus GLO-30 (AWS Open Data); SRTM (GEE); Sentinel-1/2 (GEE/CDSE); **NISAR** (launched 30 Jul 2025, science ops since Jan 2026; ASF + ISRO Bhoonidhi); ESA WorldCover; Dynamic World; SMAP
- Labels/GIS: Sikkim inventory (Zenodo 10.5281/zenodo.8169506); Eastern Himalaya inventory (Zenodo 10.5281/zenodo.18931430); NASA GLC/COOLR; NASA global susceptibility GeoTIFF (2023); OSM Geofabrik India/NE-Zone; GeoSadak/PMGSY (datameet/pmgsy-geosadak); DataMeet boundaries

**Items flagged ⚠️ UNVERIFIED — confirm before quoting as fact:**

- GSI **Bhukosh** bulk/API download availability and NER inventory coverage (portal refused connection this session).
- **IMD `api.imd.gov.in`** exact endpoints, formats, rate limits, cost (reference page returned 404).
- **CartoDEM** exact resolution (commonly cited 30 m; ISRO portal login-gated).
- **Census 2011** per-state village geometry coverage for all 8 NE states via community mirrors.
- Various **Bhuvan/NRSC** sensor specs and a dedicated Indian operational soil-moisture product.
