# BHUMI-RAKSHA AI — Deployment Guide

**Event:** Smart India Hackathon (SIH) 2026 · Problem Statement **26001** (MDoNER)
**Scope:** deploy the full prototype — a static **React/Vite** frontend, a **FastAPI** backend, and a managed **PostgreSQL + PostGIS** database.

> **Honesty note (rules §5, §11, §18).** Every value this system serves is **DEMO / SIMULATED** and is labeled as such in the UI (a `DEMO / SIMULATED DATA` badge) and in the API (`is_simulated: true`). The external response network — NDRF / SDRF / Fire / Medical / Police / NGO / field-team dispatch — is a **SIMULATED FUTURE INTEGRATION**: the architecture is built to connect to those authorities, but the app **never contacts a real agency**. Do not present it as a live government dispatch. See [§9](#9-honesty--scope-for-sih-judging).

---

## 1. Architecture

```
Static SPA (React + Vite + MapLibre)          FastAPI (uvicorn)
  dist/  ──►  any static host  ──fetch──►  0.0.0.0:$PORT ──►  PostgreSQL 16 + PostGIS 3.4
  VITE_API_BASE = backend URL              CORS_ORIGINS         (managed, 1 Alembic migration)
                                           DATABASE_URL
```

- **Frontend** — static build output (`frontend/dist`). Single route, no SSR, no client-side router → **no SPA-fallback / deep-link rewrite rules needed**.
- **Backend** — FastAPI on uvicorn; binds `0.0.0.0`; port from `$PORT`. Lazy DB engine with `pool_pre_ping`.
- **Database** — PostgreSQL **with PostGIS** (mandatory). One migration (`0001`) creates the schema and runs `CREATE EXTENSION IF NOT EXISTS postgis`.
- **Object storage** — field-report photos write to local disk by default (`MEDIA_ROOT`, served at `/media`). MinIO/S3 is an integration-ready alternative (§9), not required for the demo.

---

## 2. Environment variables

> Names only — never put real secrets in source control. `.env` and `.env.*` are git-ignored; `.env.example` templates are committed. The demo needs **no secret** to run.

### Frontend (build-time — inlined by Vite)

| Name | Purpose | Example |
|---|---|---|
| `VITE_API_BASE` | Backend API base URL, no trailing slash. **Must be set before `npm run build`.** | `https://bhumi-raksha-api.onrender.com` |

Template: [`frontend/.env.example`](../frontend/.env.example).

### Backend (runtime)

| Name | Purpose | Example / default |
|---|---|---|
| `DATABASE_URL` | Postgres+PostGIS connection. A bare `postgres://` / `postgresql://` is **auto-rewritten** to `postgresql+psycopg://`. | `postgresql+psycopg://user:pass@host:5432/db` |
| `CORS_ORIGINS` | JSON array of allowed frontend origins. | `["https://bhumi-raksha.vercel.app"]` |
| `PORT` | Server port (start command / injected by PaaS). | `8000` |
| `WEATHER_PROVIDER` | `mock` (DEMO/SIMULATED, default) or `open_meteo` (real keyless API). | `mock` |
| `DB_CONNECT_TIMEOUT` | Seconds to wait for a DB connection before failing readiness. | `5` |
| `MINIO_*` | Only if switching object storage to MinIO/S3 (optional). | — |
| `RISK_W_*` | Risk-engine factor weights (optional; auto-normalized). | see `.env.example` |

Template: [`.env.example`](../.env.example) (root).

---

## 3. Database

1. **Provision managed Postgres with PostGIS.** Render, Railway, Neon, and Supabase all support the PostGIS extension. PostGIS is **mandatory** (the app uses geometry columns).
2. **Apply the schema** (from `backend/`, with `DATABASE_URL` set):
   ```bash
   alembic upgrade head
   ```
   This creates the 18 tables and runs `CREATE EXTENSION IF NOT EXISTS postgis`. Safe to re-run.
3. **Seed demo data** (idempotent — safe to re-run):
   ```bash
   python -m app.seed.seed_sikkim      # risk geography (districts, zones, roads, villages, infra)
   python -m app.seed.demo_incidents   # SOS / command-center board (A–E)
   ```

> **Non-destructive.** There is no destructive migration and no "reset/delete" HTTP endpoint. `demo_incidents --reset` (local CLI only) clears *only* the `demo-incident-*` rows it created; it can never remove a real citizen submission.

---

## 4. Backend deploy

- **Install:** `pip install .` from `backend/` — or build `backend/Dockerfile`.
- **Start:**
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```
  The Docker image already does this (defaulting to 8000 when `$PORT` is unset).
- **Set:** `DATABASE_URL`, `CORS_ORIGINS` (see §2).
- **Health checks:** `GET /health` (liveness → `{"status":"ok"}`) and `GET /health/ready` (checks the DB → `503` if unreachable). Point the platform's health check at `/health/ready`.

---

## 5. Frontend deploy

1. Set `VITE_API_BASE` to the **deployed backend URL** (build-time).
2. Build:
   ```bash
   npm ci && npm run build      # outputs frontend/dist
   ```
3. Serve `frontend/dist` on any static host (Vercel, Netlify, Render Static, S3+CDN, nginx). No rewrite rules required (single route).

---

## 6. Recommended fast path

No platform is currently committed in the repo, so pick the fastest reliable option. All three below are viable; **Option A** is the least-friction.

### Option A — Render (recommended: one platform for all three)
- **Database:** Render PostgreSQL. PostGIS is enabled by the migration's `CREATE EXTENSION`.
- **Backend:** Render **Web Service** from `backend/Dockerfile` (or Python env), start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health-check path `/health/ready`.
- **Frontend:** Render **Static Site**, build `npm ci && npm run build`, publish `frontend/dist`.

Illustrative `render.yaml` (shown here rather than committed, to avoid locking the repo to one platform):

```yaml
services:
  - type: web
    name: bhumi-raksha-api
    env: docker
    dockerfilePath: backend/Dockerfile
    dockerContext: .
    healthCheckPath: /health/ready
    envVars:
      - key: DATABASE_URL
        fromDatabase: { name: bhumi-raksha-db, property: connectionString }
      - key: CORS_ORIGINS
        value: '["https://bhumi-raksha-web.onrender.com"]'
  - type: web
    name: bhumi-raksha-web
    env: static
    buildCommand: npm ci && npm run build
    staticPublishPath: frontend/dist
    envVars:
      - key: VITE_API_BASE
        value: https://bhumi-raksha-api.onrender.com
databases:
  - name: bhumi-raksha-db
    postgresMajorVersion: "16"
```

> The `DATABASE_URL` Render injects is a bare `postgresql://…`; the app auto-rewrites it to `postgresql+psycopg://…`, so no manual editing is required.

### Option B — Railway (backend + Postgres) + Vercel/Netlify (frontend)
Deploy the backend and a Postgres plugin on Railway; build the frontend on Vercel/Netlify with `VITE_API_BASE` pointing at the Railway backend. Enable PostGIS on the Railway Postgres (the migration handles the extension).

### Option C — Docker Compose (single host / self-managed)
`infra/docker-compose.yml` brings up Postgres+PostGIS, MinIO, and the API. It is dev-oriented; for a public deploy, front it with a static host (or nginx serving `frontend/dist`) and set production `CORS_ORIGINS`.

---

## 7. Deploy order

1. **Provision the database** (with PostGIS).
2. **Deploy the backend**; set `DATABASE_URL`; run `alembic upgrade head`; seed (`seed_sikkim`, then `demo_incidents`).
3. **Verify** `GET /health/ready` returns `{"status":"ok","db":"ok"}`.
4. **Build & deploy the frontend** with `VITE_API_BASE` = the backend URL.
5. **Set the backend `CORS_ORIGINS`** to the frontend's origin; restart/redeploy the backend.
6. **Run the smoke test** (§8).

---

## 8. Post-deployment smoke test (run from a real browser)

1. Frontend URL opens; header shows the `DEMO / SIMULATED DATA` badge.
2. `GET <backend>/health` → `{"status":"ok"}`; `GET <backend>/health/ready` → `{"status":"ok","db":"ok"}`.
3. Command Center loads incidents, metrics, the map, early warnings.
4. Citizen App: **SOS button visible immediately**; pages Home / Report / My Reports / Safety switch.
5. Citizen submits a hazard **report** → appears in the system.
6. Citizen raises an **SOS** → Command Center receives it.
7. Command Center **assigns** a response team (recommended team appears).
8. Responder **lifecycle** advances ASSIGNED → ACKNOWLEDGED → EN_ROUTE → ON_SITE → RESOLVED.
9. **Refresh** the page → the RESOLVED state persists (served from the database).
10. Toggle **EN / हिं** — UI language switches.
11. Toggle **Dark / Light** — theme switches.

Any failure at step 2 or 3 means `DATABASE_URL` / PostGIS / `alembic upgrade head` needs attention; a failure at 5–6 across origins usually means `CORS_ORIGINS` does not list the frontend origin.

---

## 9. Honesty & scope (for SIH judging)

- **All data is DEMO / SIMULATED**, served behind a provider-adapter seam (§9/§18) and labeled in the header and every panel. It is never presented as a live government feed; the seam is *architected* to swap in real GSI / IMD / satellite sources without app changes.
- **The external response network is a SIMULATED FUTURE INTEGRATION** (§11). Unless an actual authorized live API is connected, the system does **not** claim any real NDRF / SDRF / 108 / Fire / Police / NGO dispatch occurred. Response routing is labeled SIMULATED.
- **The risk engine is a deterministic, explainable weighted model** (§10) — not an LLM, not an over-claimed predictor. It emits a probabilistic **score + level + confidence + contributing factors + recommended action**, never a "guaranteed" prediction (§5).
- **Responder identity is demo-grade** (an `X-Responder-Id` header, not production auth). It is a deliberate prototype affordance, not a security control.
