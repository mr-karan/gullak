---
summary: "Local development setup, tools, and workflow for Gullak"
read_when:
  - Setting up local development environment
  - Contributing to Gullak
  - Running tests locally
---

# Development Guide

This guide covers everything you need to set up a local development environment for Gullak, run tests, and contribute to the codebase.

## Prerequisites

Before you begin, ensure you have the following tools installed:

- **Python 3.13+**: The core language used for Gullak.
- **[uv](https://github.com/astral-sh/uv)**: A fast Python package manager and workflow tool.
- **[Just](https://github.com/casey/just)**: A handy command runner for development tasks.
- **[ledger-cli](https://ledger-cli.org/)** or **hledger**: Required for validating and processing the plain-text accounting files.
- **[Node.js](https://nodejs.org/) 22+** or **[Bun](https://bun.sh/)**: Required for running the WhatsApp bridge.

## Setup Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mr-karan/gullak.git
   cd gullak
   ```

2. **Install dependencies**:
   Gullak uses `uv` to manage its virtual environment and dependencies.
   ```bash
   just install
   ```
   This command runs `uv sync`, which creates a `.venv` directory and installs all required packages (including development dependencies).

## Environment Setup

1. **Configure environment variables**:
   Copy the example environment file and edit it with your configuration:
   ```bash
   cp .env.example .env
   ```

2. **Configure LLM API Key**:
   Gullak requires an LLM to function. Open `.env` and set your preferred provider's API key. [OpenRouter](https://openrouter.ai/) is recommended for easy access to multiple models.
   ```bash
   GULLAK_INFERENCE_MODEL=openrouter/google/gemini-2.0-flash-001
   OPENROUTER_API_KEY=your_api_key_here
   ```

## Running Locally

### Option 1: Native (Recommended for Development)

Run the FastAPI server with hot-reload enabled:
```bash
just dev
```
Alternatively, you can run it manually using `uv`:
```bash
uv run uvicorn gullak.main:app --reload --host 0.0.0.0 --port 8000
```
The UI will be available at `http://localhost:8000`.

### Option 2: Docker (Development Mode)

The default `docker-compose.yml` is configured for development with:
- Hot reload (source code mounted)
- Debug logging enabled
- All ports exposed for debugging

```bash
docker compose up --build
```

### Option 3: Docker (Production Mode)

For production-like testing locally:
```bash
cp .env.production.example .env
# Edit .env and add your API key
docker compose -f docker-compose.prod.yml up --build
```

Production differences:
- No hot reload (code baked into image)
- Services bound to localhost only (use reverse proxy for external access)
- Resource limits and security hardening enabled
- WhatsApp bridge port not exposed externally

### WhatsApp Bridge (Standalone)

If you need to test WhatsApp integration without Docker:
```bash
cd whatsapp-bridge
bun install
bun run index.js
```
*Note: You can also use `npm` or `yarn` if you don't have Bun installed.*

## Justfile Commands

The `Justfile` contains common recipes for development:

| Command | Description |
|---------|-------------|
| `just install` | Install all dependencies using `uv` |
| `just dev` | Start the development server with auto-reload |
| `just test` | Run the full test suite |
| `just test-cov` | Run tests and generate a coverage report |
| `just lint` | Run `ruff` to check for linting issues |
| `just fmt` | Run `ruff` to format the code |
| `just typecheck` | Run `mypy` for static type checking |
| `just check` | Run `fmt`, `lint`, `typecheck`, and `test` in sequence |

## Project Structure

- `src/gullak/`: Main Python package.
    - `agent/`: AI Agent logic, including LiteLLM integration, prompts, and tools.
    - `api/`: FastAPI routes and endpoint handlers.
    - `config/`: Configuration models and settings.
    - `import_/`: Logic for importing bank statements and processing templates.
    - `ledger/`: Tools for parsing, validating, and writing `.ledger` files.
    - `web/`: Frontend templates (Jinja2) and static assets (CSS/JS).
- `whatsapp-bridge/`: Node.js/Bun service that bridges WhatsApp (via Baileys) to the Gullak API.
- `docs/`: Project documentation.
- `tests/`: Comprehensive test suite using `pytest`.
- `data/`: (Local only) Default directory for storing your ledger files and SQLite history (this directory is git-ignored).

## Using Nix (Optional)

If you use [Nix](https://nixos.org/), Gullak provides a `flake.nix` for a reproducible development environment.

1. **Enter the shell**:
   ```bash
   nix develop
   ```
2. **With direnv**:
   If you have [direnv](https://direnv.net/) installed, just run `direnv allow` in the project root to automatically load the environment.

The Nix environment includes Python 3.13, `uv`, `ledger`, `just`, and `git`.
