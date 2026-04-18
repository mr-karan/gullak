# Architecture

Gullak is a ledger-first expense tracker. `data/main.ledger` is the single source of truth; everything else is plumbing around it.

## Components

### `pi-server/` — runtime

- Express JSON HTTP server (`src/app.ts`)
- Pi-SDK agent loop (`src/agent/`) — model config, system prompts, tools
- Ledger IO (`src/ledger/`) — parse, write, validate, summarise
- Sidecar state store (`src/state/`) — payee memory, WhatsApp dedupe, recap history
- WhatsApp glue (`src/whatsapp/`) — webhook handler + outbound bridge client
- Weekly recap (`src/recap/`) + CLI entrypoint (`src/cli/weekly-recap.ts`)

Runs on Node ≥ 20, pnpm-managed. Configured via env (`src/config.ts`).

### `whatsapp-bridge/` — transport

Node/Bun service using [Baileys](https://github.com/WhiskeySockets/Baileys). Receives WhatsApp messages, posts `{event: "message", payload}` to `pi-server`'s webhook, and exposes `/api/sendText`, `/api/sendSeen`, `/api/startTyping`, `/api/stopTyping` for outbound replies.

Auth/session state is multi-file (Baileys `useMultiFileAuthState`) under `AUTH_DIR` (default `./auth_state`).

### `data/` — storage

- `main.ledger` — plain-text ledger (human readable, ledger-cli compatible)
- `pi-state.json` — sidecar for app state (generated at startup)
- `recaps/` — generated weekly recap markdown files

## Data flow

```
User → WhatsApp → whatsapp-bridge → POST /v1/whatsapp/webhook
                                          │
                                          ▼
                                    AgentService
                                     ├─ pi-agent-core loop
                                     │   ├─ read_transactions
                                     │   ├─ add_transaction   ──▶ LedgerWriter ──▶ main.ledger
                                     │   ├─ edit_transaction  ──▶ (validated via `ledger source`)
                                     │   └─ delete_transaction
                                     └─ StateStore (dedupe, payee memory, threads)
                                          │
                                          ▼
                                    reply text
                                          │
                               bridge /api/sendText ──▶ WhatsApp
```

HTTP callers hit the same `AgentService` through `POST /v1/messages`.

## Design defaults

- **Ledger is canonical.** App state does *not* live in ledger comments — it's in `pi-state.json`.
- **Editability is scoped.** Only two-posting transactions authored by this app (marked with a `gullak:id` comment) are editable/deletable via API.
- **Validation is optional but on by default.** Writes are validated through `ledger source`; disable with `GULLAK_VALIDATE_WRITES=false`. If the CLI isn't on `PATH`, validation silently no-ops.
- **Recap math is deterministic.** The LLM only phrases the recap — totals, top categories, and week-over-week deltas are computed before the prompt.
- **JSON-only HTTP.** No UI. No server-rendered templates.

## Environment

See [`pi-server/.env.example`](../pi-server/.env.example) and [`whatsapp-bridge/.env.example`](../whatsapp-bridge/.env.example) for the full set. Key knobs:

| Var | Purpose |
|-----|---------|
| `GULLAK_LEDGER_PATH` | Path to the ledger file |
| `GULLAK_VALIDATE_WRITES` | Gate writes on `ledger source` |
| `GULLAK_MODEL_*` | OpenAI-compatible model endpoint |
| `GULLAK_HTTP_API_KEY` | Bearer-style key required on `/v1/*` (except webhooks) |
| `GULLAK_WHATSAPP_ALLOWED_NUMBERS` | DM allowlist |
| `GULLAK_RECAP_WHATSAPP_CHAT_ID` | Where the weekly recap goes when `--send-whatsapp` |
