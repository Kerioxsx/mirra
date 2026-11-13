# Mirra API image. Migrations run on start; scale-out deployments should run them as a separate job.
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY migrations ./migrations
COPY src ./src
RUN uv sync --frozen --no-dev

RUN useradd --create-home --uid 10001 mirra
USER mirra
EXPOSE 8000
CMD ["sh", "-c", ".venv/bin/alembic upgrade head && .venv/bin/uvicorn mirra.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
