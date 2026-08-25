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

# Runtime entrypoint: migrate + seed (both idempotent) then exec uvicorn.
# Baked into the image and marked executable so the platform can run it
# directly — no start command / shell parsing needed (a literal-vs-shell
# mismatch on the start command is what caused the earlier exit 127). `sed`
# strips any stray CR so the `#!/bin/sh` shebang stays valid on Linux
# (.gitattributes already forces LF; this is belt-and-suspenders). The script
# honours $PORT when the platform injects one, defaulting to 10000. compose
# overrides this CMD with its own `command:`, so local dev is unaffected.
COPY backend/start.sh ./start.sh
RUN sed -i 's/\r$//' ./start.sh && chmod +x ./start.sh

EXPOSE 10000

CMD ["/app/start.sh"]
