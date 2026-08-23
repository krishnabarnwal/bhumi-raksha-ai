# Bhumi-Raksha AI

**Predict. Protect. Prevent.** — AI-based early warning & landslide risk monitoring for the North Eastern Region (NER).

> Smart India Hackathon 2026 · Problem Statement **26001** · Ministry of Development of North Eastern Region (MDoNER). Demo focus region: **Sikkim**.

---

## ⚠️ Data-realism notice

This is a **prototype**. Where verified government/satellite feeds are not yet wired in, the system serves clearly-labelled **`DEMO / SIMULATED`** data through a provider-adapter seam that is architected to swap in real sources without code changes. Simulated data is **never** presented as real government data, and the system does **not** claim guaranteed predictions — it outputs probabilistic risk (score / level / window / confidence / contributing factors / recommended action).

## Project status

| Phase | Scope | State |
|-------|-------|-------|
| **0 — Discovery & Feasibility** | Research, data/AI feasibility, architecture, risks | ✅ [`docs/00-discovery-feasibility.md`](docs/00-discovery-feasibility.md) |
| **1 — Backend foundation spine** | Data model, migrations, provider seam, config, health | 🚧 this repo |
| Later | Risk engine (ML), GIS/maps, field reporting, alerts (CAP), offline sync, frontend | ⏳ planned |

Phase 1 deliberately builds **no** domain endpoints, auth logic, ML, computer vision, or frontend — only the runnable, tested foundation everything downstream attaches to.

## Architecture (Phase 1)

```
backend/  FastAPI (sync SQLAlchemy 2.0) + Alembic
  app/
    core/       config (pydantic-settings), db engine, logging
    models/     §15 data model — SQLAlchemy ORM + GeoAlchemy2 (PostGIS, SRID 4326)
    providers/  Mock -> Real adapter seam (weather: mock | open-meteo)
    api/        /health (liveness) + /health/ready (DB check)
infra/    docker-compose: postgis + api + minio
```

## Tech stack

Python · FastAPI · SQLAlchemy 2.0 · GeoAlchemy2 · Alembic · PostgreSQL + **PostGIS** · psycopg 3 · pydantic-settings · httpx · MinIO (S3-compatible) · pytest.

## Quickstart

Prereqs: Docker Desktop (running) and Python 3.11+.

```bash
# 1. Configure
cp .env.example .env

# 2. Start infrastructure (PostGIS + MinIO)
docker compose -f infra/docker-compose.yml up -d db minio

# 3. Install backend + apply migrations (enables PostGIS, creates schema)
cd backend
pip install -e ".[dev]"        # or: uv sync
alembic upgrade head

# 4. Run the API
uvicorn app.main:app --reload
#   GET http://localhost:8000/health        -> {"status":"ok"}
#   GET http://localhost:8000/health/ready   -> {"status":"ok","db":"ok"}

# 5. Tests
pytest
```

Or run the whole stack in containers:

```bash
docker compose -f infra/docker-compose.yml up --build
docker compose -f infra/docker-compose.yml exec api alembic upgrade head
```

## Security & secrets (§14)

No API keys, DB passwords, or credentials are committed. Configuration comes from the environment / a local `.env` (git-ignored); `.env.example` ships placeholders only.

## License

MIT (prototype).
