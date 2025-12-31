# Gullak v2 - Handoff Document

## Project Status: Phase 1 Complete

The Go/Vue/SQLite codebase has been completely replaced with Python/FastAPI/Alpine.js. The app is functional for basic expense tracking via chat.

---

## Quick Start

```bash
# Local development
just dev                    # Start FastAPI server on :8000

# Docker (includes Paisa)
just docker-build && just docker-up

# Reset setup wizard (for testing)
just reset-setup
```

---

## What Works

### Core Flow
1. User types "spent 500 on groceries at BigBasket"
2. Claude parses → creates pending transaction
3. Preview pane shows transaction (table + ledger view)
4. User clicks "Save Transaction"
5. Written to `data/main.ledger`

### Features
- **Chat interface** with SSE streaming
- **Setup wizard** (currency, timezone, bank accounts, credit cards)
- **Settings page** (accessible from sidebar, shows existing accounts)
- **Dark/light theme** toggle (DaisyUI v5 custom theme)
- **Transactions view** (reads from ledger)
- **Paisa integration** via Docker Compose

---

## Architecture

```
src/gullak/
├── main.py              # FastAPI app, lifespan, routes
├── config.py            # Pydantic Settings (env vars)
├── agent/
│   ├── client.py        # GullakAgent - Anthropic SDK streaming
│   ├── tools.py         # Tool definitions + execute_tool()
│   └── prompts.py       # System prompt with account context
├── ledger/
│   ├── models.py        # Transaction, Posting, PendingTransaction
│   ├── parser.py        # Extract accounts from ledger file
│   ├── writer.py        # Append transactions to ledger
│   └── validator.py     # Validate via `ledger` CLI
├── api/
│   ├── chat.py          # POST /api/chat (SSE), confirm, cancel
│   ├── ledger.py        # GET /api/ledger/accounts, transactions
│   └── setup.py         # GET/POST /api/setup/* (wizard + settings)
└── web/
    ├── templates/       # Jinja2 (base.html, index.html)
    └── static/js/app.js # Alpine.js app
```

---

## Key Technical Decisions

### 1. Anthropic SDK (not Claude Agent SDK)
The spec mentions "Claude Agent SDK" but it doesn't exist as a pip package. Using `anthropic` SDK directly with:
- `AsyncAnthropic` client
- `client.messages.stream()` for SSE
- Tool definitions as plain dicts (not decorators)
- Manual agentic loop (tool_use → execute → tool_result → continue)

### 2. Stateless (No SQLite)
All state stored in ledger file:
- `; gullak:setup_complete` - Setup done marker
- `; gullak:currency INR` - Preferences
- `account Assets:Bank:HDFC` - Account declarations

**Trade-offs:**
- ✅ Single source of truth, Paisa-compatible
- ❌ Conversation history lost on refresh
- ❌ Pending transactions lost on server restart

### 3. SSE (not WebSocket)
Using `sse-starlette` for streaming. Simpler than WebSocket, works well for unidirectional streaming.

---

## Current Agent Tools

| Tool | Purpose | Status |
|------|---------|--------|
| `parse_expense` | Natural language → Transaction | ✅ Works |
| `query_balance` | Run `ledger balance` queries | ✅ Works |
| `list_accounts` | Get account hierarchy | ✅ Works |

---

## What's NOT Implemented

### Agent Tools (from spec)
- `edit_transaction` - Modify existing transaction
- `delete_transaction` - Remove transaction
- `import_file` - CSV/XLS bank statement import
- `manage_recurring` - Recurring transactions
- `suggest_category` - ML-based category prediction

### Features
- **Transaction IDs** - Should write `; gullak:id <nanoid>` for edit/delete
- **Payee memory** - Remember "Swiggy = Expenses:Food:Delivery"
- **CSV import** - Bank statement bulk import
- **Indian bank templates** - HDFC, ICICI, SBI, Axis, Kotak
- **Duplicate detection** - Hash-based deduplication
- **File attachments** - Receipt images
- **paisa.yaml generation** - Auto-generate Paisa config

### UI
- File upload button
- Voice input
- Batch confirm/cancel
- Better inline editing in preview pane

---

## Known Issues / TODOs

1. **Conversation history** - Lost on page refresh. Consider adding SQLite just for chat history.

2. **Pending transactions** - Stored in memory (`_state.pending_transactions`). Lost on server restart.

3. **No transaction IDs** - Currently written transactions don't have `; gullak:id`. Need this for edit/delete.

4. **Error handling** - Agent errors could be more graceful in UI.

5. **Model hardcoded** - `claude-sonnet-4-20250514` in client.py. Should be configurable.

---

## Files to Know

| File | What it does |
|------|--------------|
| `src/gullak/agent/client.py` | The core agent logic - streaming, tool execution |
| `src/gullak/agent/tools.py` | Tool definitions and `execute_tool()` |
| `src/gullak/web/static/js/app.js` | All frontend state and logic |
| `src/gullak/api/setup.py` | Setup wizard and settings API |
| `data/main.ledger` | The actual data file (created by setup) |

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...     # Required
GULLAK_DATA_DIR=./data           # Default: ./data
GULLAK_LEDGER_FILE=main.ledger   # Default: main.ledger
GULLAK_DEFAULT_CURRENCY=INR      # Default: INR
GULLAK_TIMEZONE=Asia/Kolkata     # Default: Asia/Kolkata
GULLAK_DEBUG=false               # Default: false
TZ=Asia/Kolkata                  # For Docker
```

---

## Useful Commands

```bash
just dev              # Run dev server
just test             # Run tests
just fmt              # Format code
just lint             # Lint code
just docker-up        # Start Docker (gullak + paisa)
just docker-logs      # View logs
just reset-setup      # Delete ledger to re-trigger setup wizard
just ledger-balance   # Run ledger balance on data file
```

---

## Next Steps (Recommended Order)

1. **Add transaction IDs** - Write `; gullak:id` when saving transactions
2. **Add edit_transaction tool** - Find by ID, modify, rewrite
3. **Add delete_transaction tool** - Find by ID, remove
4. **CSV import** - High-value feature for bulk entry
5. **Payee memory** - Store `; gullak:payee_map swiggy=Expenses:Food:Delivery`

---

## References

- `spec.md` - Full technical specification
- `plan.md` - Original implementation plan (outdated - references non-existent Claude Agent SDK)
- [Paisa docs](https://paisa.fyi/reference/ledger/)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-python)
- [DaisyUI v5](https://daisyui.com/)

---

*Last updated: 2024-12-31*
