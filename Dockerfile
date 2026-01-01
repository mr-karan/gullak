# Gullak v2 - Python 3.13 + ledger-cli
FROM python:3.13-slim

ARG GULLAK_UID=1000
ARG GULLAK_GID=1000

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ledger \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (handle existing GID/UID gracefully)
RUN groupadd --gid $GULLAK_GID gullak 2>/dev/null || true \
    && useradd --uid $GULLAK_UID --gid $GULLAK_GID --create-home --shell /bin/bash gullak 2>/dev/null \
    || useradd --uid $GULLAK_UID --gid $GULLAK_GID --create-home --shell /bin/bash --no-user-group gullak 2>/dev/null \
    || true

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies only (cached layer)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

# Copy full project and install it
COPY --chown=gullak:gullak . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

USER gullak

ENV GULLAK_HOST=0.0.0.0 \
    GULLAK_PORT=8000 \
    GULLAK_DATA_DIR=/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uv", "run", "uvicorn", "gullak.main:app", "--host", "0.0.0.0", "--port", "8000"]
