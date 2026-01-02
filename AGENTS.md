# GULLAK - AI ASSISTANT KNOWLEDGE BASE

**Generated:** 2026-01-02  
**Commit:** cfe4c3b  
**Branch:** main

## OVERVIEW

AI-powered expense tracker using plain-text accounting (ledger-cli). Python 3.13 FastAPI + LiteLLM agent + Alpine.js UI + WhatsApp bridge.

## STRUCTURE

```
gullak/
├── src/gullak/
│   ├── agent/        # AI agent (tools.py is 1132 lines - complexity hotspot)
│   ├── api/          # FastAPI routers (32 endpoints)
│   ├── ledger/       # ledger-cli parsing, writing, validation
│   ├── media/        # Receipt OCR processing
│   ├── config/       # Paisa dashboard integration
│   ├── import_/      # Bank CSV import (trailing underscore: reserved keyword)
│   └── web/          # Jinja2 templates + static assets
├── whatsapp-bridge/  # Node.js service (separate stack - see its AGENTS.md)
├── tests/            # pytest suite (47 tests)
└── docs/             # User documentation
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add agent tool | `src/gullak/agent/tools.py` | Follow existing pattern: Pydantic input + executor function |
| Modify AI behavior | `src/gullak/agent/prompts.py` | Edit `get_system_prompt()` |
| Add API endpoint | `src/gullak/api/*.py` | Create router, include in `main.py` |
| Ledger format changes | `src/gullak/ledger/models.py` | Transaction/Posting Pydantic models |
| Category mappings | `src/gullak/ledger/categories.py` | Regex patterns for merchant→account |
| Payee memory | `src/gullak/ledger/memory.py` | Learned payee→account stored in ledger comments |
| Configuration | `src/gullak/settings.py` | Pydantic Settings, access via `settings` global |
| Tests | `tests/test_*.py` | Follow existing class-based pattern |

## CONVENTIONS

### Code Style
- **Line length**: 100 chars (ruff)
- **Type hints**: Mandatory on all signatures
- **Async**: Prefer for I/O (file, network, LLM calls)
- **Logging**: `structlog` - use `logger = logging.getLogger(__name__)`
- **Models**: Pydantic BaseModel for all data structures

### Project-Specific
- **Account hierarchy**: `Expenses:Food:Groceries` (colon-separated)
- **Ledger metadata**: Comments prefixed with `gullak:` (e.g., `; gullak:id abc123`)
- **Payee mappings**: `; gullak:payee_map Swiggy=Expenses:Food:Delivery|Assets:Bank:HDFC:UPI`
- **Transaction sources**: `TransactionSource` enum (web, whatsapp, csv, api)

### Naming
- `import_/` directory: Trailing underscore avoids Python keyword collision
- API routers: Named by domain (`chat.py`, `ledger.py`, `threads.py`)

## ANTI-PATTERNS

| Pattern | Why | Instead |
|---------|-----|---------|
| Call `parse_expense` when editing pending | Creates duplicate transactions | Use `edit_pending_transaction` tool |
| Direct ledger file writes | Bypasses validation | Use `LedgerWriter` class |
| `as any`, `@ts-ignore` | Type safety violation | Fix the type |
| Sync I/O in async context | Blocks event loop | Use `aiofiles` or run in executor |

## COMMANDS

```bash
just install          # Setup deps with uv
just dev              # Dev server with hot reload
just test             # Run pytest
just lint             # Ruff check
just fmt              # Ruff format
just docker-up        # Full stack (gullak + paisa + whatsapp)
just prod-up          # Production deployment
```

## TESTING

- **Framework**: pytest with `asyncio_mode="auto"`
- **Structure**: Class-based (`TestChatHistory`, `TestLedgerParser`)
- **Fixtures**: `conftest.py` - temp files, HTTP client, sample data
- **Run**: `just test` or `pytest tests/`

## ARCHITECTURE NOTES

### Agent Flow
1. User message → `GullakAgent.process()`
2. LiteLLM streaming with tool calls (max 10 iterations)
3. Tools create `PendingTransaction` (preview)
4. User confirms → `LedgerWriter.write()` → ledger-cli validation → Paisa sync

### Pending Transaction System
- Stored in `.pending.json` (per-thread)
- `ToolState` manages pending CRUD
- Confirm tools auto-learn payee→account mappings

### Multi-Provider LLM
- LiteLLM abstraction (OpenRouter, OpenAI, Anthropic, Gemini, Ollama)
- Model configured via `GULLAK_INFERENCE_MODEL` env var
- Streaming responses with event types: `text`, `thinking`, `tool_result`, `preview`, `done`

## KEY FILES

| File | Lines | Purpose |
|------|-------|---------|
| `agent/tools.py` | 1132 | 15 tool definitions + executors |
| `agent/prompts.py` | 348 | System prompt generation |
| `agent/client.py` | 450 | LiteLLM agent loop |
| `agent/tool_state.py` | 300 | Shared state, pending txns |
| `ledger/models.py` | 200 | Transaction/Posting models |
| `api/chat.py` | 302 | Chat endpoints (11 routes) |
| `settings.py` | 80 | All configuration |
