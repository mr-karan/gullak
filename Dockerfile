# Gullak v2 - Python 3.13 + ledger-cli
FROM python:3.13-slim

# Install system dependencies including ledger-cli
RUN apt-get update && apt-get install -y --no-install-recommends \
    ledger \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
ARG GULLAK_UID=1000
ARG GULLAK_GID=1000
RUN groupadd --gid $GULLAK_GID gullak && \
    useradd --uid $GULLAK_UID --gid gullak --create-home gullak

WORKDIR /app

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install Python dependencies
RUN uv sync --frozen --no-dev --no-editable

# Copy application code
COPY src/ src/

# Set ownership
RUN chown -R gullak:gullak /app

USER gullak

# Environment defaults
ENV GULLAK_HOST=0.0.0.0
ENV GULLAK_PORT=8000
ENV GULLAK_DATA_DIR=/data

EXPOSE 8000

# Run with uv
CMD ["uv", "run", "uvicorn", "gullak.main:app", "--host", "0.0.0.0", "--port", "8000"]
