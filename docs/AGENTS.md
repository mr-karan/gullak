---
summary: "Instructions for AI assistants working with the Gullak codebase"
read_when:
  - Starting work on Gullak codebase
  - Understanding project conventions
  - Making code changes to Gullak
---

# Gullak AI Assistant Guide

This document provides context, conventions, and instructions for AI coding assistants working on the Gullak codebase.

## Project Overview

Gullak is an AI-powered personal finance assistant that uses plain-text accounting (`ledger-cli`) to track expenses.

- **Backend**: Python 3.11+ FastAPI app.
- **AI Agent**: Custom agent using LiteLLM for multi-provider support (OpenRouter, OpenAI, Anthropic, Gemini, Ollama).
- **Ledger**: Plain-text accounting using `.ledger` files and `ledger-cli` format.
- **Frontend**: Minimalist web UI built with Alpine.js and DaisyUI (Tailwind CSS).
- **WhatsApp**: Integration via a Node.js bridge (`whatsapp-bridge/`) using Baileys.

## Key Directories

- `src/gullak/agent/`: AI agent implementation, including tool definitions (`tools.py`), state management (`tool_state.py`), and system prompts (`prompts.py`).
- `src/gullak/api/`: FastAPI routers and endpoints.
- `src/gullak/ledger/`: Logic for parsing, validating, and writing to ledger files.
- `src/gullak/web/`: Static assets (`static/`) and Jinja2 templates (`templates/`).
- `whatsapp-bridge/`: Node.js service that bridges WhatsApp messages to the Gullak API.
- `tests/`: Pytest suite.

## Code Conventions

- **Type Hints**: Mandatory for all function signatures and complex variables.
- **Structured Logging**: Use `structlog`. Obtain loggers via `from gullak.logging import get_logger`.
- **Data Models**: Use Pydantic `BaseModel` for API requests/responses and internal data structures.
- **Configuration**: Managed in `src/gullak/settings.py` via `pydantic-settings`. Use the global `settings` object.
- **Comments**: Code should be self-documenting. Only add comments for complex logic or business rules.
- **Asynchronous Code**: Prefer `async/await` for I/O bound operations (API, file I/O).

## Testing

- Use `pytest` for running tests.
- Tests are located in the `tests/` directory.
- Follow existing patterns in `tests/test_ledger.py` or `tests/test_chat_history.py`.
- Run tests using `just test` or `pytest`.

## Common Tasks

### Adding a New API Endpoint
1. Create/Update a router in `src/gullak/api/`.
2. Define Pydantic models for request/response.
3. Include the router in `src/gullak/main.py`.

### Modifying Agent Prompts
- System prompts are generated in `src/gullak/agent/prompts.py`.
- Update `get_system_prompt` to add new capabilities or instructions.

### Adding Ledger Categories
- Categories are usually handled dynamically by the agent based on existing accounts in the ledger file.
- Default category mappings and logic can be found in `src/gullak/ledger/categories.py`.

## Important Files

- `src/gullak/settings.py`: The source of truth for all configuration.
- `src/gullak/agent/prompts.py`: Defines the agent's personality and instructions.
- `src/gullak/ledger/models.py`: Defines the `Transaction` and `Posting` models.
- `src/gullak/agent/tools.py`: Contains the functions the AI agent can call.
- `Justfile`: Command runner for development tasks (`install`, `dev`, `test`, `lint`).

## Working with Ledger
- Gullak follows the `ledger-cli` format.
- Transactions are written to `settings.data_dir / settings.ledger_file`.
- Avoid direct file manipulation; use the writers in `src/gullak/ledger/writer.py`.
