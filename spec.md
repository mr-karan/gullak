# Gullak v2 - Technical Specification

## Overview

Gullak v2 is a complete rewrite of the expense tracking application, replacing the Go/Vue/SQLite stack with a modern Python architecture. The core innovation is replacing the custom database with [Paisa](https://paisa.fyi/) as the data layer, using plain-text ledger files as the single source of truth.

The application centers around a conversational AI agent built with the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python) that can parse natural language, import bank statements, query financial data, and manage the ledger through dialogue.

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.13 |
| Package Manager | uv |
| Web Framework | FastAPI |
| Frontend | HTML + Alpine.js + Tailwind CSS |
| AI Agent | Claude Agent SDK |
| Data Storage | Plain-text ledger files (Paisa-compatible) |
| Visualization | Paisa (separate container) |
| Deployment | Docker Compose |

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Compose                          │
├─────────────────────────────┬───────────────────────────────┤
│         Gullak              │            Paisa              │
│  ┌───────────────────────┐  │  ┌─────────────────────────┐  │
│  │   FastAPI Backend     │  │  │   Paisa Web UI          │  │
│  │   ┌───────────────┐   │  │  │   (Port 7500)           │  │
│  │   │ Claude Agent  │   │  │  │                         │  │
│  │   │ (Agent SDK)   │   │  │  │   - Reports             │  │
│  │   └───────────────┘   │  │  │   - Budgets             │  │
│  │   ┌───────────────┐   │  │  │   - Investment tracking │  │
│  │   │ Ledger Tools  │   │  │  │   - Analysis            │  │
│  │   └───────────────┘   │  │  └─────────────────────────┘  │
│  └───────────────────────┘  │                               │
│  ┌───────────────────────┐  │                               │
│  │  Alpine.js Frontend   │  │                               │
│  │  (Port 8000)          │  │                               │
│  └───────────────────────┘  │                               │
├─────────────────────────────┴───────────────────────────────┤
│              Shared Volume: ~/paisa/                         │
│   main.ledger  │  paisa.yaml  │  receipts/  │  paisa.db     │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User inputs expense via chat or file upload
2. Claude Agent parses input, extracts transactions
3. Transactions shown in preview pane for confirmation
4. On confirmation, agent appends to `main.ledger`
5. Paisa reads ledger file, provides visualization/reports

---

## Agent Specification

### Core Capabilities

The agent is built using Claude Agent SDK with the following characteristics:

| Capability | Description |
|------------|-------------|
| **Mode** | Conversational with multi-turn dialogue |
| **Memory** | Persistent across sessions (stored in ledger comments) |
| **Access** | Full CRUD - can read, create, edit, delete ledger entries |
| **Learning** | Guided setup + continuous learning of account hierarchy |

### Agent Tools

The agent will have access to the following tools:

#### 1. `parse_expense`
Parse natural language into structured transaction data.

```python
@tool
def parse_expense(text: str) -> list[Transaction]:
    """
    Parse natural language expense input.
    Handles: amounts, currencies, dates, categories, merchants, splits.

    Examples:
    - "coffee 5 dollars" -> single expense
    - "grocery $100, but $20 was office supplies" -> split transaction
    - "netflix last tuesday" -> recurring detection
    """
```

#### 2. `read_ledger`
Query the ledger file for transactions and balances.

```python
@tool
def read_ledger(
    query: str,
    start_date: str | None = None,
    end_date: str | None = None,
    account: str | None = None
) -> LedgerQueryResult:
    """
    Query ledger data. Supports:
    - Balance queries: "how much in checking?"
    - Spending queries: "total groceries this month"
    - Transaction search: "all uber rides in december"
    """
```

#### 3. `write_transaction`
Append a new transaction to the ledger.

```python
@tool
def write_transaction(
    date: str,
    description: str,
    postings: list[Posting],
    tags: dict[str, str] | None = None
) -> WriteResult:
    """
    Write a transaction to main.ledger.
    Validates account hierarchy, handles multi-posting splits.
    """
```

#### 4. `edit_transaction`
Modify an existing transaction in the ledger.

```python
@tool
def edit_transaction(
    transaction_id: str,  # line number or unique identifier
    updates: TransactionUpdate
) -> EditResult:
    """
    Edit existing transaction. Can modify date, description,
    amounts, categories. Uses line-based identification.
    """
```

#### 5. `delete_transaction`
Remove a transaction from the ledger.

```python
@tool
def delete_transaction(transaction_id: str) -> DeleteResult:
    """
    Delete transaction by line number/identifier.
    Requires confirmation through preview system.
    """
```

#### 6. `import_file`
Process uploaded CSV/XLS files.

```python
@tool
def import_file(
    file_path: str,
    template: str | None = None
) -> list[Transaction]:
    """
    Import bank statement file.
    Auto-detects format for known Indian banks.
    Returns transactions for preview.
    """
```

#### 7. `manage_recurring`
Create and manage recurring transactions.

```python
@tool
def manage_recurring(
    action: Literal["create", "list", "delete"],
    transaction: RecurringTransaction | None = None
) -> RecurringResult:
    """
    Manage Paisa-style recurring transactions.
    Supports monthly, weekly, yearly frequencies.
    """
```

#### 8. `get_accounts`
Retrieve account hierarchy.

```python
@tool
def get_accounts() -> AccountHierarchy:
    """
    Get current account structure from ledger.
    Used for category suggestions and validation.
    """
```

#### 9. `suggest_category`
ML-based category prediction.

```python
@tool
def suggest_category(description: str, amount: float) -> CategorySuggestion:
    """
    Suggest category based on description and historical patterns.
    Uses context from existing ledger entries.
    """
```

### Context-Aware Behavior

The agent uses contextual hints for disambiguation:

| Context | Behavior |
|---------|----------|
| Time of day | "shell at 7am" -> likely fuel, not store |
| Amount ranges | $3 coffee vs $300 furniture |
| Recent patterns | User's established merchant->category mappings |
| Currency symbols | $=USD, ₹=INR, €=EUR, auto-detect |
| Date references | "yesterday", "last Tuesday", "beginning of month" |

### Memory System

Agent memory is stored in ledger file comments using Paisa's tag system:

```ledger
; gullak:preferences currency=INR, timezone=Asia/Kolkata
; gullak:payee_map shell=Expenses:Transport:Fuel
; gullak:payee_map swiggy=Expenses:Food:Delivery
; gullak:last_session 2024-01-15T10:30:00Z
```

---

## Data Model

### Ledger Format

All data stored in Paisa-compatible ledger format:

```ledger
; Gullak-managed ledger file
; gullak:version 2.0
; gullak:preferences currency=INR

2024/01/15 Swiggy - Lunch
    ; gullak:id abc123
    ; gullak:source chat
    Expenses:Food:Delivery          350 INR
    Assets:Checking:HDFC

2024/01/15 Grocery Store
    ; gullak:id def456
    ; Split: office supplies separated
    Expenses:Food:Groceries         800 INR
    Expenses:Office:Supplies        200 INR
    Assets:Checking:HDFC          -1000 INR

~ Monthly
2024/01/01 Netflix Subscription
    ; gullak:recurring monthly
    Expenses:Entertainment:Streaming    649 INR
    Liabilities:CreditCard:HDFC
```

### Transaction Identification

Each transaction gets a unique ID stored in comments:
- Format: `gullak:id <nanoid>`
- Used for edit/delete operations
- Line numbers used as fallback

### Account Hierarchy (Default)

```
Assets
├── Checking
│   └── {BankName}
├── Cash
├── Savings
│   └── {BankName}
└── Investments
    ├── Equity
    └── Debt

Liabilities
├── CreditCard
│   └── {CardName}
└── Loans

Income
├── Salary
├── Interest
├── Freelance
└── CapitalGains

Expenses
├── Food
│   ├── Groceries
│   ├── Restaurants
│   └── Delivery
├── Transport
│   ├── Fuel
│   ├── PublicTransit
│   └── Rides
├── Housing
│   ├── Rent
│   └── Utilities
├── Entertainment
├── Shopping
├── Health
└── Subscriptions
```

User can customize during onboarding; agent learns and adapts.

---

## User Interface

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Gullak                                    [Paisa ↗] [⚙]   │
├─────────────────────────────┬───────────────────────────────┤
│                             │                               │
│     Chat Interface          │      Preview Pane             │
│                             │                               │
│  ┌───────────────────────┐  │  ┌─────────────────────────┐  │
│  │ Agent: How can I help?│  │  │ [Table] [Ledger]        │  │
│  └───────────────────────┘  │  │                         │  │
│                             │  │ Date     | Desc | Amount │  │
│  ┌───────────────────────┐  │  │ ---------|------|------- │  │
│  │ User: spent 500 on    │  │  │ Jan 15   | Swig | ₹350  │  │
│  │ lunch at swiggy       │  │  │ Jan 15   | Groc | ₹1000 │  │
│  └───────────────────────┘  │  │                         │  │
│                             │  │ [✓ Confirm All]         │  │
│  ┌───────────────────────┐  │  └─────────────────────────┘  │
│  │ Agent: Added lunch    │  │                               │
│  │ expense. Category:    │  │  Pending: 2 transactions      │
│  │ Food:Delivery ✓       │  │  Ready to write to ledger     │
│  └───────────────────────┘  │                               │
│                             │                               │
│  ┌─────────────────────┐    │                               │
│  │ Type message...  [↑]│    │                               │
│  └─────────────────────┘    │                               │
│  [📎 Attach] [📁 Import]    │                               │
│                             │                               │
└─────────────────────────────┴───────────────────────────────┘
```

### Chat Interface

- Full-width on mobile, 50% on desktop
- Markdown rendering for agent responses
- File upload button for imports
- Voice input (browser native)

### Preview Pane

- **Table View (default)**: Friendly columns - Date, Description, Amount, Category, Status
- **Ledger View (toggle)**: Raw ledger syntax with syntax highlighting
- **Inline Editing**: Click any cell to edit before confirmation
- **Batch Actions**: Confirm all, clear all, edit selected

### Onboarding Flow

Comprehensive first-run wizard:

1. **Welcome**: Explain Gullak + Paisa relationship
2. **Currency**: Select base currency (INR, USD, etc.)
3. **Timezone**: For date parsing
4. **Bank Accounts**: Setup checking/savings accounts
5. **Credit Cards**: Add credit card accounts
6. **Income Sources**: Salary, freelance, etc.
7. **Expense Categories**: Customize default hierarchy
8. **Sample Transaction**: Test the flow

Stored as ledger comments and paisa.yaml config.

---

## File Import System

### Supported Formats

| Format | Support Level |
|--------|--------------|
| CSV | Full |
| XLS/XLSX | Full |
| PDF | Future (Gemini OCR) |
| Images | Future (Gemini OCR) |

### Indian Bank Templates (Built-in)

| Bank | Statement Type |
|------|---------------|
| HDFC Bank | Savings, Credit Card |
| ICICI Bank | Savings, Credit Card |
| SBI | Savings |
| Axis Bank | Savings, Credit Card |
| Kotak | Savings |

### Template Format

Templates use Handlebars-style syntax (Paisa-compatible):

```handlebars
{{#if (isDate ROW.A)}}
{{date ROW.A "DD/MM/YYYY"}} {{ROW.B}}
    {{predictAccount ROW.B}}    {{amount ROW.D}} INR
    Assets:Checking:HDFC
{{/if}}
```

### Deduplication

Dual strategy for duplicate prevention:

1. **Hash-based**: SHA256 of `date + amount + description`
2. **Transaction ID**: Parse bank reference number if available

On potential duplicate:
- Show warning in preview
- Let user decide to skip or import

---

## API Design

### Internal Architecture

Designed for future REST API expansion:

```python
# Core service layer (API-agnostic)
class GullakService:
    async def process_message(self, message: str) -> AgentResponse
    async def import_file(self, file: UploadFile) -> list[Transaction]
    async def confirm_transactions(self, ids: list[str]) -> WriteResult
    async def get_pending(self) -> list[Transaction]

# FastAPI routes (current)
@app.post("/chat")
async def chat(message: ChatMessage) -> ChatResponse

@app.post("/import")
async def import_file(file: UploadFile) -> ImportResponse

@app.post("/confirm")
async def confirm(ids: list[str]) -> ConfirmResponse

@app.get("/pending")
async def get_pending() -> list[Transaction]

# Future: External API endpoints
# @app.post("/api/v1/message")  # For Apple Shortcuts
# @app.post("/api/v1/webhook")  # For integrations
```

### WebSocket for Chat

Real-time streaming for agent responses:

```python
@app.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    await websocket.accept()
    while True:
        message = await websocket.receive_text()
        async for chunk in agent.stream_response(message):
            await websocket.send_text(chunk)
```

---

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional (with defaults)
GULLAK_HOST=0.0.0.0
GULLAK_PORT=8000
GULLAK_DATA_DIR=/data
GULLAK_LEDGER_FILE=main.ledger
GULLAK_DEBUG=false
```

### Paisa Configuration (paisa.yaml)

Generated during onboarding:

```yaml
journal_path: main.ledger
db_path: paisa.db
default_currency: INR
locale: en-IN
time_zone: Asia/Kolkata
financial_year_starting_month: 4
ledger_cli: ledger
strict: false
```

---

## Docker Compose

```yaml
version: "3.8"

services:
  gullak:
    build: .
    ports:
      - "8000:8000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GULLAK_DATA_DIR=/data
    volumes:
      - paisa-data:/data
    depends_on:
      - paisa
    restart: unless-stopped

  paisa:
    image: ananthakumaran/paisa:latest
    ports:
      - "7500:7500"
    volumes:
      - paisa-data:/root/Documents/paisa
    restart: unless-stopped

volumes:
  paisa-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${HOME}/paisa
```

### Volume Strategy

Host directory mount (`~/paisa/`) recommended because:
- User can edit ledger files directly if needed
- Easy backup (just copy the folder)
- Both containers have access
- Survives container recreation

---

## Project Structure

```
gullak/
├── pyproject.toml          # uv/Python config
├── uv.lock
├── Dockerfile
├── docker-compose.yml
├── README.md
├── spec.md                 # This file
│
├── src/
│   └── gullak/
│       ├── __init__.py
│       ├── main.py         # FastAPI app entry
│       ├── config.py       # Settings/env vars
│       │
│       ├── agent/
│       │   ├── __init__.py
│       │   ├── agent.py    # Claude Agent SDK setup
│       │   ├── tools.py    # Agent tools definitions
│       │   ├── prompts.py  # System prompts
│       │   └── memory.py   # Persistent memory handling
│       │
│       ├── ledger/
│       │   ├── __init__.py
│       │   ├── parser.py   # Ledger file parsing
│       │   ├── writer.py   # Ledger file writing
│       │   ├── models.py   # Transaction models
│       │   └── queries.py  # Ledger CLI wrapper
│       │
│       ├── import_/
│       │   ├── __init__.py
│       │   ├── detector.py # Format detection
│       │   ├── templates/  # Bank templates
│       │   └── processor.py
│       │
│       ├── api/
│       │   ├── __init__.py
│       │   ├── routes.py   # FastAPI routes
│       │   ├── schemas.py  # Pydantic models
│       │   └── websocket.py
│       │
│       └── web/
│           ├── templates/  # Jinja2 templates
│           └── static/     # CSS, JS (Alpine.js)
│
└── tests/
    ├── conftest.py
    ├── test_agent.py
    ├── test_ledger.py
    └── test_import.py
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Project setup (uv, FastAPI, Docker)
- [ ] Basic ledger parser/writer
- [ ] Claude Agent SDK integration
- [ ] Simple chat UI (Alpine.js)
- [ ] Single expense parsing tool

### Phase 2: Core Features
- [ ] Full agent tools (read, write, edit, delete)
- [ ] Preview pane with inline editing
- [ ] Onboarding wizard
- [ ] Account hierarchy management
- [ ] Basic file import (CSV)

### Phase 3: Intelligence
- [ ] Persistent memory system
- [ ] Category prediction
- [ ] Split transaction detection
- [ ] Natural date parsing
- [ ] Context-aware disambiguation

### Phase 4: Indian Banks
- [ ] HDFC statement template
- [ ] ICICI statement template
- [ ] SBI statement template
- [ ] Axis statement template
- [ ] Duplicate detection

### Phase 5: Advanced
- [ ] Recurring transactions
- [ ] Ledger syntax view toggle
- [ ] File attachments (receipts)
- [ ] Performance optimization

### Future
- [ ] REST API for external integrations
- [ ] Webhook support
- [ ] OCR for receipts (Gemini API)
- [ ] Mobile-optimized UI

---

## Security Considerations

- **Single User**: No authentication, assume trusted network
- **API Key**: Stored as environment variable, never logged
- **Data Privacy**: All data local, no external transmission except Claude API
- **Ledger Files**: Plain text, user has full control
- **Backups**: Recommend git for ledger version control

---

## Dependencies

### Python Packages

```toml
[project]
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "anthropic>=0.40.0",
    "claude-agent-sdk>=0.1.0",  # or whatever the package name is
    "jinja2>=3.1.0",
    "python-multipart>=0.0.9",
    "pydantic>=2.9.0",
    "pydantic-settings>=2.6.0",
    "pandas>=2.2.0",
    "openpyxl>=3.1.0",
    "websockets>=13.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.27.0",
    "ruff>=0.7.0",
]
```

---

## Success Criteria

1. **Quick Capture**: Log expense in <5 seconds via chat
2. **Bulk Import**: Process 100-transaction CSV in <30 seconds
3. **Accuracy**: >90% correct category prediction after 50 transactions
4. **Paisa Compatibility**: All entries valid in Paisa without modification
5. **Docker Deploy**: Single `docker compose up` starts both services

---

## Open Questions

1. Should there be a "suggestion mode" where agent proposes but never writes without explicit confirmation?
2. How to handle Paisa's `strict` mode - should gullak enforce account pre-definition?
3. Should recurring transactions sync both ways (Paisa -> Gullak -> Paisa)?
4. Rate limiting strategy if user accidentally triggers many API calls?

---

*Specification Version: 1.0*
*Last Updated: 2024-01-15*
*Author: Generated via /interview*
