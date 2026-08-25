#!/bin/sh
# Bhumi-Raksha AI — backend container entrypoint (Render / Docker).
#
# Runs the idempotent startup chain, then exec's uvicorn so it inherits PID 1
# (clean signal handling / graceful shutdown). `set -e` aborts the boot if a
# migration or seed step fails, so the platform health check surfaces the real
# error instead of leaving a half-started server running.
#
# Idempotent + non-destructive: `alembic upgrade head` is a no-op once applied,
# and both seeds upsert (they never wipe data). Safe to run on every boot.
#
# All seeded data is DEMO / SIMULATED (rules 5/9/11/18); no real agency is ever
# contacted.
set -e

echo "[start] alembic upgrade head — applying database migrations…"
alembic upgrade head

echo "[start] seed_sikkim — seeding risk geography (idempotent)…"
python -m app.seed.seed_sikkim

echo "[start] demo_incidents — seeding DEMO/SIMULATED command board (idempotent)…"
python -m app.seed.demo_incidents

echo "[start] launching uvicorn on 0.0.0.0:${PORT:-10000}…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}"
