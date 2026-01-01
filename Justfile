# Gullak v2 - Python/uv/FastAPI project commands

# Default recipe: show help
default:
    @just --list

# === Development ===

# Install dependencies with uv
install:
    uv sync

# Run development server with auto-reload
dev:
    uv run uvicorn gullak.main:app --reload --host 0.0.0.0 --port 8000

# Run development server (alias)
run: dev

# === Testing ===

# Run all tests
test:
    uv run pytest tests/ -v

# Run tests with coverage
test-cov:
    uv run pytest tests/ -v --cov=gullak --cov-report=term-missing

# Run specific test file
test-file file:
    uv run pytest {{file}} -v

# === Code Quality ===

# Format code with ruff
fmt:
    uv run ruff format src/ tests/

# Lint code with ruff
lint:
    uv run ruff check src/ tests/

# Fix linting issues automatically
lint-fix:
    uv run ruff check src/ tests/ --fix

# Type check with mypy
typecheck:
    uv run mypy src/

# Run all checks (format, lint, typecheck, test)
check: fmt lint typecheck test

# === Docker ===

# Build docker image with current user's UID/GID for file permissions
docker-build:
    GULLAK_UID=$(id -u) GULLAK_GID=$(id -g) docker compose build

# Start all services (gullak + paisa) with logs
docker-up:
    GULLAK_UID=$(id -u) GULLAK_GID=$(id -g) docker compose up

# Start in background (detached)
docker-up-detached:
    GULLAK_UID=$(id -u) GULLAK_GID=$(id -g) docker compose up -d

# Stop all services
docker-down:
    docker compose down

# View logs
docker-logs:
    docker compose logs -f

# View gullak logs only
docker-logs-gullak:
    docker compose logs -f gullak

# Rebuild and restart
docker-restart: docker-down docker-build docker-up

# Shell into gullak container
docker-shell:
    docker compose exec gullak bash

# === Ledger ===

# Validate ledger file
ledger-validate:
    ledger -f data/main.ledger balance

# Show ledger balance
ledger-balance:
    ledger -f data/main.ledger balance

# Show ledger register
ledger-register:
    ledger -f data/main.ledger register

# === Utilities ===

# Clean Python cache files
clean:
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name "*.pyc" -delete 2>/dev/null || true

# Create empty ledger file if not exists
init-ledger:
    @mkdir -p data
    @touch data/main.ledger
    @echo "Ledger file ready at data/main.ledger"

# Reset setup (delete ledger file to trigger setup wizard)
reset-setup:
    @rm -f data/main.ledger data/paisa.yaml data/paisa.db data/chat_history.db
    @echo "All data files deleted. Setup wizard will show on next load."

# Fresh start: clean slate + rebuild + run with logs
fresh:
    @rm -rf data/
    @mkdir -p data
    GULLAK_UID=$(id -u) GULLAK_GID=$(id -g) docker compose down
    GULLAK_UID=$(id -u) GULLAK_GID=$(id -g) docker compose build
    GULLAK_UID=$(id -u) GULLAK_GID=$(id -g) docker compose up

# Show environment info
info:
    @echo "Python: $(uv run python --version)"
    @echo "uv: $(uv --version)"
    @echo "Ledger: $(ledger --version | head -1)"
