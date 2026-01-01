# Build stage
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

WORKDIR /app

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

COPY . /app

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable


# Runtime stage
FROM python:3.13-slim-bookworm

ARG GULLAK_UID=1000
ARG GULLAK_GID=1000

RUN apt-get update && apt-get install -y --no-install-recommends \
    ledger \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid $GULLAK_GID gullak 2>/dev/null || true \
    && useradd --uid $GULLAK_UID --gid $GULLAK_GID --create-home gullak 2>/dev/null || true

WORKDIR /app

COPY --from=builder --chown=gullak:gullak /app/.venv /app/.venv

ENV PATH="/app/.venv/bin:$PATH" \
    GULLAK_HOST=0.0.0.0 \
    GULLAK_PORT=8000 \
    GULLAK_DATA_DIR=/data

USER gullak

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "gullak.main:app", "--host", "0.0.0.0", "--port", "8000"]
