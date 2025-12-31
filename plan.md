# Gullak v2 Implementation Plan

## Overview

Complete rewrite of Gullak: Python 3.13 + uv + FastAPI + Alpine.js, integrating with Paisa for ledger-based expense tracking via a conversational AI agent.

## Key Technical Decision

**Use Claude Agent SDK**

The Claude Agent SDK requires Claude Code CLI as its runtime. For Gullak:
- Custom tools via `@tool` decorator + `create_sdk_mcp_server()`
- `ClaudeSDKClient` for multi-turn conversations with session continuity
- Streaming via `receive_response()` async iterator
- Hooks for logging/validation
- Docker needs: `npm install -g @anthropic-ai/claude-code`
- Better suited for web services

---

## Phase 1: Foundation (Minimal Working Prototype)

### 1.1 Project Setup

**Create files:**
```
gullak/
├── pyproject.toml           # uv + dependencies
├── src/gullak/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   └── config.py            # Pydantic Settings
```

**Dependencies:**
- fastapi, uvicorn, pydantic, pydantic-settings
- claude-agent-sdk (pip install claude-agent-sdk)
- sse-starlette (for streaming), jinja2, aiofiles
- python-multipart (file uploads)

### 1.2 Ledger Module

**Create files:**
```
src/gullak/ledger/
├── __init__.py
├── models.py        # Transaction, Posting Pydantic models
├── parser.py        # Parse ledger files
├── writer.py        # Append transactions
└── validator.py     # Validate via ledger-cli
```

**Key models:**
- `Transaction`: date, payee, postings[], note
- `Posting`: account, amount, currency
- `to_ledger()` method for format conversion

### 1.3 Agent Module

**Create files:**
```
src/gullak/agent/
├── __init__.py
├── client.py        # ClaudeSDKClient wrapper
├── tools.py         # Custom tools via @tool decorator
├── prompts.py       # System prompt with account context
└── server.py        # create_sdk_mcp_server() setup
```

**Custom Tools (using @tool decorator):**
```python
from claude_agent_sdk import tool, create_sdk_mcp_server

@tool("parse_expense", "Parse expense from text", {"text": str})
async def parse_expense(args):
    # Extract date, amount, currency, accounts, payee
    return {"content": [{"type": "text", "text": json.dumps(parsed)}]}

@tool("query_balance", "Query account balance", {"account": str})
async def query_balance(args):
    # Run ledger-cli balance query
    return {"content": [{"type": "text", "text": result}]}

@tool("list_accounts", "List ledger accounts", {})
async def list_accounts(args):
    return {"content": [{"type": "text", "text": accounts}]}

# Create MCP server
ledger_server = create_sdk_mcp_server(
    name="ledger",
    tools=[parse_expense, query_balance, list_accounts]
)
```

**Agent Client:**
```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

options = ClaudeAgentOptions(
    mcp_servers={"ledger": ledger_server},
    allowed_tools=["mcp__ledger__parse_expense", "mcp__ledger__query_balance"],
    system_prompt="You are Gullak, a personal finance assistant..."
)

async with ClaudeSDKClient(options=options) as client:
    await client.query(user_message)
    async for message in client.receive_response():
        yield message  # Stream to frontend
```

### 1.4 API Layer

**Create files:**
```
src/gullak/api/
├── __init__.py
├── chat.py          # POST /api/chat (SSE streaming)
├── ledger.py        # GET /api/ledger/accounts, /balance, /transactions
└── health.py        # GET /api/health
```

**Chat flow:**
1. User sends message → POST /api/chat
2. Server streams SSE events: `text`, `preview`, `thinking`, `done`
3. User confirms → POST /api/chat/confirm/{id}
4. Transaction written to ledger

### 1.5 Frontend

**Create files:**
```
src/gullak/web/
├── templates/
│   ├── base.html
│   └── index.html   # Chat + preview pane layout
└── static/
    ├── css/main.css
    └── js/app.js    # Alpine.js app
```

**UI:**
- Left: Chat interface (messages + input)
- Right: Preview pane (pending transaction in ledger format)
- DaisyUI + Tailwind for styling

### 1.6 Docker

**Create files:**
```
Dockerfile           # Python 3.13 + ledger-cli + Claude Code CLI
docker-compose.yml   # gullak + paisa services
```

**Dockerfile key steps:**
```dockerfile
FROM python:3.13-slim

# Install Node.js (for Claude Code CLI) + ledger-cli
RUN apt-get update && apt-get install -y nodejs npm ledger

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install Python dependencies
COPY pyproject.toml .
RUN pip install uv && uv pip install --system .

COPY src/ src/
CMD ["uvicorn", "gullak.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Volume:** `./data` mounted to both containers for shared ledger access

---

## Phase 2: Core Features (after Phase 1 works)

- [ ] Full CRUD: edit/delete transactions via chat
- [ ] Enhanced preview pane with inline editing
- [ ] Bank CSV import (generic + HDFC, ICICI, SBI templates)
- [ ] Conversation history (SQLite)
- [ ] Onboarding wizard

## Phase 3: Intelligence (after Phase 2)

- [ ] Persistent memory in ledger comments
- [ ] Category prediction from history
- [ ] Recurring transaction support
- [ ] Natural date parsing improvements

---

## Implementation Order (Phase 1)

1. **pyproject.toml** - Project setup with uv + claude-agent-sdk
2. **config.py** - Settings management (ANTHROPIC_API_KEY, paths)
3. **ledger/models.py** - Transaction/Posting Pydantic models
4. **ledger/parser.py** - Parse existing ledger files
5. **ledger/writer.py** - Append transactions to ledger
6. **ledger/validator.py** - Validate with ledger-cli
7. **agent/tools.py** - Custom tools with @tool decorator
8. **agent/server.py** - create_sdk_mcp_server() setup
9. **agent/prompts.py** - System prompt for expense tracking
10. **agent/client.py** - ClaudeSDKClient wrapper
11. **api/chat.py** - SSE endpoint streaming from agent
12. **api/ledger.py** - Ledger query endpoints
13. **web/templates/** - HTML templates (base.html, index.html)
14. **web/static/js/app.js** - Alpine.js chat + preview app
15. **main.py** - FastAPI app assembly
16. **Dockerfile + docker-compose.yml** - Python + Node.js + ledger-cli

---

## Files to Remove (old Go codebase)

After Phase 1 is working:
- `main.go`, `app.go`, `handlers.go`, `store.go`
- `internal/`, `pkg/`
- `ui/` (Vue.js frontend)
- `schema.sql`, `queries.sql`, `pragmas.sql`
- Old `Dockerfile`, `docker-compose.yml`

---

## Success Criteria (Phase 1)

1. `docker compose up` starts both gullak and paisa
2. Chat: "spent 500 on groceries" → parses expense, shows preview
3. Confirm → writes to main.ledger in valid format
4. Paisa UI shows the new transaction
