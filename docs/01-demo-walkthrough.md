# BHUMI-RAKSHA AI — Demo Walkthrough & Rehearsal Runbook

**Tagline:** *Predict. Protect. Prevent.*
**Event:** Smart India Hackathon (SIH) 2026 · Problem Statement **26001** (MDoNER)
**Demo region:** Sikkim · **Document status:** Phase 2 prototype — end-to-end demo runbook
**Date:** 2026-08-23

> This is the **presenter's script**. It is verified against the running build: every number below (scores, alert counts, affected assets) was observed live in-browser during the hardening pass. Read the ["What to say" lines](#the-90-second-run) aloud; watch for the "**On screen**" expectations to confirm the system is behaving.

---

## 0. The one-sentence story

**Rainfall + terrain + historical susceptibility + exposure → an explainable AI risk engine → a per-location risk score → a GIS risk map → the specific roads & villages affected → an early warning → a field report from the ground → a prioritized response list.**

Everything on screen is one continuous chain. The demo walks that chain left to right.

---

## 1. Pre-flight (do this **before** the audience is watching)

### 1.1 Bring the stack up

```bash
# From the repo root. PostGIS + MinIO (object storage) as containers.
docker compose -f infra/docker-compose.yml up -d db minio
```

```bash
# Backend: apply schema, load the Sikkim demo data (idempotent — safe to re-run), serve the API.
cd backend
alembic upgrade head
python -m app.seed.seed_sikkim          # risk geography (districts, zones, roads, villages, infra)
python -m app.seed.demo_incidents       # SOS/command-center board (idempotent — safe to re-run)
uvicorn app.main:app          # NOTE: no --reload for the demo (see 1.3)
```

> **Staging the SOS / command-center board.** `seed_sikkim` owns the risk *geography*; `demo_incidents` stages a clean, predictable set of **DEMO/SIMULATED** SOS + hazard incidents so the CITIZEN → SOS → PRIORITY → RESPONSE → LIFECYCLE story is visible the moment the command center loads (one CRITICAL unassigned SOS, one acknowledged, one en-route, one resolved-with-timeline, one HIGH hazard report). Every row is synthetic — tagged `demo-incident-*`, prefixed `[DEMO]`, and served with `is_simulated: true`; nothing claims a real NDRF/SDRF/108/NGO/government dispatch. To reset between rehearsals:
>
> ```bash
> # From backend/ — clears ONLY the seeded demo incidents, then reseeds (surgical, safe).
> python -m app.seed.demo_incidents --reset
> ```
>
> `--reset` removes only the rows this script created (matched by their `demo-incident-*` id), so it can never delete a real citizen submission made during the demo. Use `--purge` instead for a louder, explicit one-time cleanup of *all* accumulated test reports (it prints the ids it deletes). Both are **local CLI actions only** — there is deliberately no public "delete all incidents" endpoint.

```bash
# Frontend (separate terminal): the SPA on :5173.
cd frontend
npm run dev
```

### 1.2 Green-light checklist (all must pass)

| Check | Command / action | Expected |
|---|---|---|
| DB is up & healthy | `docker ps` | `bhumi-raksha-db-1 … (healthy)` on `:5432` |
| API is live | open `http://localhost:8000/health` | `{"status":"ok"}` |
| **DB is wired to the API** | open `http://localhost:8000/health/ready` | `{"status":"ok","db":"ok"}` |
| Map loads with data | open `http://localhost:5173` | Sikkim map, **colored risk zones**, village labels, orange infra pins, an early-warning list on the left |
| Header badge present | look top-right | **`DEMO / SIMULATED DATA`** badge visible |

If `/health/ready` shows anything other than `db:ok`, the PostGIS container isn't reachable — re-run step 1.1's first command and wait for `(healthy)` before continuing.

### 1.3 Rehearsal-stability rules (learned during hardening)

- **Run `uvicorn` WITHOUT `--reload`.** A reload mid-demo drops in-flight requests.
- **Don't edit source during the demo.** The dev server hot-reloads on file save, which remounts the app and clears the in-progress field-report location. (This is the *only* "flakiness" we found — it is a dev-tool behavior, not a product bug. A live demo never edits files, so it never triggers.)
- **The map does not need the internet.** Basemap tiles come from OpenStreetMap, but **all risk data (zones, roads, villages, infrastructure, reports) renders over a solid dark background even if tiles fail.** If the venue Wi-Fi drops, the demo still works — you just lose the grey street basemap, not the risk layer. Verified.

---

## 2. Cheat-sheet: the numbers you'll see

Memorize these so you can narrate confidently and spot a misbehaving build instantly.

**Rainfall scenarios** (the four buttons, top-left):

| Button | Rain applied | Meaning |
|---|---|---|
| **Current** | each zone's own baseline | "today's" per-zone conditions |
| **Normal** | 20 mm / 24h (uniform) | light, basin-wide |
| **Heavy** | 90 mm / 24h (uniform) | heavy, basin-wide |
| **Extreme** | 160 mm / 24h (uniform) | extreme, basin-wide |

**Risk levels:** `<25` LOW (green) · `25–49` MODERATE (yellow) · `50–74` HIGH (orange) · `≥75` CRITICAL (red).

**Headline live changes** (the "watch it move" moments), verified:

| Metric | Current | Extreme |
|---|---|---|
| **Gangtok** risk score | **55** (HIGH) | **73** (HIGH, near-critical) |
| Gangtok 24h rainfall factor | 60 mm | 160 mm |
| Red (CRITICAL) zones on map | **1** | **5** |
| Early warnings in the list | **7** | **11** |

---

## 3. The 90-second run

> Open on the clean state from §1.2: full-Sikkim map, no zone selected, scenario = **Current**.

| # | Criterion | Do this | On screen | What to say |
|---|---|---|---|---|
| **1** | **GIS risk map** | Gesture across the map. | Colored risk zones over Sikkim + NH-10 road line + village labels + hospital/bridge/shelter pins. | *"This is Sikkim as a live risk surface — every zone colored LOW to CRITICAL, with the real road corridor, villages, and critical infrastructure layered on."* |
| **2** | **Risk intelligence** | Click the **Gangtok** zone. | Right panel: score **55**, **HIGH**, confidence **63%**, six factor bars — Slope 28°, 24h Rainfall 60 mm, Historical 50, Exposure 95 (HIGH), Soil 42 mm, Terrain 55 — plus a **"Computed HH:MM:SS" timestamp**, a recommended action and a DEMO disclaimer. | *"Click any location and the engine shows its work: a 0–100 score, the level, the timestamp it was computed, and exactly which factors drove it — rainfall, slope, history, exposure. Not a black box, and never a 'guaranteed' claim — a probabilistic score with confidence."* |
| **3** | **Dynamic risk** | Click **Extreme**. | Gangtok climbs **55 → 73**; its rainfall factor **60 → 160 mm**; the map floods red (**1 → 5** critical zones); the warning list grows (**7 → 11**). All update together. | *"Now push 24-hour rainfall to an extreme event. The score climbs, the map recolors, and new warnings fire — live. One compute path keeps the map, the panel, and the alerts perfectly in agreement."* |
| **4** | **Early warning** | In the left list, click the **CRITICAL — Chungthang** card. | Card shows score **85**, reason *"24h Rainfall 160 mm, Slope 40°, Historical Susceptibility 88"*, affected **👥 3,021 · 🏘 1 village · 🏥 2 · 🛣 2 roads**, and a recommended action. Clicking recenters the panel on Chungthang. | *"A CRITICAL zone becomes an actionable warning: where, why, who's exposed — 3,000 people, a village, two hospitals, two road segments — and what to do about it."* |
| **5** | **Field report** | Reset to **Current**. In the right form: click **📍 Pick on map**, click a spot on the map, choose a type/severity, (optionally attach a photo), click **Submit report**. | Coordinates fill in; **"✓ Report #N submitted"**; a magenta marker appears on the map. | *"And it's two-way. A field officer geo-tags what they see on the ground — a crack, rockfall, seepage — with an optional photo, and it lands on the shared map instantly. Ground truth closes the loop."* |
| **6** | **Prioritized response** *(close)* | Point to the **Response Priority** list (bottom-left). | Ranked P1–P4 rows; **Gangtok #1 (P2)**, Chungthang high (P1), each showing level · score · population exposed. | *"Finally, the system triages: it ranks response by risk **×** exposure, so a high-severity zone over a city outranks an equally-severe but sparsely-populated one. That's the decision-support a district officer actually needs."* |

**Total: ~90 seconds.** If you have less time, criteria **1 → 2 → 3 → 4** alone tell the core story (map → intelligence → dynamic → warning).

---

## 4. Demo-safe steering (read this — it prevents the one confusing moment)

The rainfall scenario buttons apply a **uniform, basin-wide** rainfall to *every* zone (Normal 20, Heavy 90, Extreme 160 mm). "Current" instead uses each zone's **own** baseline, and the northern high-Himalaya zones carry a **high** monsoon baseline (Chungthang's baseline is already ~160 mm).

**Consequence:** for a high-baseline northern zone, switching **Current → Normal** or **Current → Heavy** can make its score *drop*, because you've replaced its heavy baseline with a lighter uniform shower.

### Rules that guarantee a clean "more rain → higher risk" moment

- ✅ **For the dynamic-rainfall beat (criterion #3), keep a southern/central zone selected** — **Gangtok**, Ravangla, Singtam, Pelling, Namchi, Rangpo, or Yuksom. These rise cleanly. Gangtok is the rehearsed choice (55 → 73).
- ✅ **If you want a gradual climb,** step **Normal → Heavy → Extreme** (20 → 90 → 160 mm). Because it's uniform, **every** zone rises at each step — bulletproof for any selected zone.
- ⚠️ **Avoid** selecting **Chungthang, Lachen, Lachung, Mangan, or Dikchu** and then going Current → Normal/Heavy while narrating "more rain." Their score can fall.

### If a judge notices a northern zone's score dropped

Have this answer ready — it's a **strength**, not a bug:

> *"The scenario applies a single uniform rainfall across the whole basin for stress-testing. These northern zones already carry a high monsoon baseline, so a uniform lighter shower actually lowers their computed rainfall load. The model is honestly reflecting its inputs rather than only ever going up — that's the explainability working."*

---

## 5. Say these lines out loud (compliance — §5 & §18)

These aren't legal boilerplate; saying them **builds credibility**, because most competing entries overclaim.

- **Never** say "100% accurate," "guaranteed," or "prediction of exactly when." Say **"probabilistic risk — score, level, confidence, contributing factors, and a recommended action."**
- Point at the **`DEMO / SIMULATED DATA`** badge once, early: *"All data here is clearly-labeled simulated data served through a provider-adapter seam — architected to swap in real GSI, IMD, and satellite feeds without changing the app. We never present simulated data as a live government feed."*
- Frame the output as **decision support**, not autopilot: *"This tells an officer what to look at first — a human still makes the call."*

---

## 6. If something goes wrong (recovery playbook)

| Symptom | Cause | Fix |
|---|---|---|
| Map is dark / no street tiles | Venue Wi-Fi lost | **Keep going** — risk zones/roads/villages/reports still render. Say: *"basemap tiles are offline; the risk layer is served locally, so the demo is fully functional."* |
| Panel/map didn't update on a scenario click | Click landed between states, or a slow request | Click the scenario button **once** more and pause ~1s. State converges. |
| A zone click did nothing | Clicked a gap between polygons | Click clearly **inside** a colored zone (or use the warning/priority list, which selects the same zone). |
| Field-report submit is disabled | No location picked yet | Click **📍 Pick on map**, then click the map — the button enables once coordinates show. |
| Field report location vanished mid-entry | A source file was saved → hot reload | Don't edit files during the demo. Re-pick the location and submit; it works in one continuous flow. |
| Everything looks wrong / stale | API or seed issue | Re-check `http://localhost:8000/health/ready` = `db:ok`; if risk data is missing, re-run `python -m app.seed.seed_sikkim` (idempotent). If the SOS board looks messy, `python -m app.seed.demo_incidents --reset` restores the clean five-incident board. |

**Panic reset:** reload `http://localhost:5173` — the app reloads to the clean Current-scenario state in ~1s with no data loss (reports are persisted server-side).

---

## 7. The five success criteria → where each is proven

| # | Success criterion | Proven by (this runbook) |
|---|---|---|
| 1 | Interactive Sikkim GIS map with risk zones + roads + villages + infrastructure | §3 step 1 |
| 2 | Select a location → score, level, contributing factors, rainfall, terrain, historical, exposure | §3 step 2 |
| 3 | Change rainfall inputs → risk score changes live | §3 step 3 |
| 4 | HIGH/CRITICAL → early warning with location, reason, affected assets, recommended action | §3 step 4 |
| 5 | Submit a field report (location/type/description/image) → appears in the system | §3 step 5 |

---

## 8. Scope & honesty (say these per §5 & §18)

- **Criterion #2 is complete to the letter:** the panel shows a **"Computed HH:MM:SS" timestamp** (local time; full date on hover) next to the score, level, confidence and factor bars, and it updates on every interaction. If asked *"how fresh is this?"*, point to it: *"recomputed the instant you clicked."*
- **All data is DEMO / SIMULATED**, served behind a provider-adapter seam (§18) and labeled in the header and on every panel. Never present it as a live government feed — say the seam is *architected* to swap in real GSI/IMD/satellite sources without app changes.
- The engine is a **deterministic, explainable weighted model** (§10) — not an LLM, not an over-claimed predictor. It emits a probabilistic **score + confidence + contributing factors + recommended action**, never a "guaranteed" prediction (§5).

---

*Everything in this document was verified against the running Phase 2 build during the hardening pass. Simulated data is labeled throughout; the system emits probabilistic, explainable risk — never a guaranteed prediction.*
