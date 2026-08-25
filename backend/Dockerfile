# Bhumi-Raksha AI — backend API image
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Project metadata + package source are both needed to build the wheel.
# psycopg[binary] ships its own libpq wheel, so no system libpq/build
# toolchain is required.
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --upgrade pip && pip install .

# Migrations (needed at runtime, not at build time)
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini

EXPOSE 8000

# Migrations are applied explicitly (see README / docs/02-deployment.md), e.g.:
#   docker compose ... exec api alembic upgrade head
#
# The server honours $PORT when the platform injects one (Render, Railway,
# Cloud Run, …), defaulting to 8000 for local / docker-compose use. compose
# overrides this CMD with its own `command:`, so it is unaffected.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
