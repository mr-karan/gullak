# Gullak — Agent Knowledge Base

Ledger-first expense tracker. The Python/Paisa stack has been removed; everything runs through `pi-server/` + `whatsapp-bridge/`.

## Layout

```
gullak/
├── pi-server/          # TypeScript app (node >=20, pnpm)
│   └── src/
│       ├── app.ts            # Express JSON HTTP server
│       ├── runtime.ts        # Wires services together
│       ├── config.ts         # Env loading
│       ├── agent/            # pi-sdk model, prompts, tools, message pipeline
│       ├── ledger/           # Parse, write, validate, summarise data/main.ledger
│       ├── state/            # JSON sidecar (payee memory, dedupe, recap history)
│       ├── whatsapp/         # Webhook handler + bridge client
│       ├── recap/            # Weekly recap generation
│       └── cli/weekly-recap.ts
├── whatsapp-bridge/    # Node Baileys bridge, posts into pi-server
├── data/               # main.ledger + pi-state.json (gitignored)
└── docs/architecture.md
```

## Where to look

| Task | File |
|------|------|
| Add HTTP endpoint | `pi-server/src/app.ts` |
| Modify agent behaviour | `pi-server/src/agent/prompts.ts`, `tools.ts` |
| Ledger parse/write | `pi-server/src/ledger/parser.ts`, `writer.ts` |
| Summaries / reports | `pi-server/src/ledger/service.ts` |
| Write validation | `pi-server/src/ledger/validator.ts` (runs `ledger source`) |
| WhatsApp handling | `pi-server/src/whatsapp/service.ts` |
| Weekly recap | `pi-server/src/recap/weekly.ts` |
| Env / config | `pi-server/src/config.ts`, `pi-server/.env.example` |

## Conventions

- `data/main.ledger` is the source of truth. App state (payee memory, dedupe, recap history) lives in `data/pi-state.json`, not in ledger comments.
- Only two-posting transactions authored by this app (have a `gullak:id`) are editable via API.
- Writes validate through `ledger source` when the CLI is available; skippable via `GULLAK_VALIDATE_WRITES=false`.
- Weekly recap math is deterministic; the LLM only phrases the recap.
- JSON-only HTTP. No UI.
- pnpm is the package manager for both apps (see `packageManager` field in each `package.json`).

## Commands

```bash
cd pi-server
pnpm install
pnpm dev             # tsx watch
pnpm build           # tsc
pnpm test            # node --test over test/**/*.test.ts
pnpm recap:weekly
```

```bash
cd whatsapp-bridge
pnpm install
pnpm start           # bun run index.js
```

## Endpoints

- `POST /v1/messages`
- `GET  /v1/accounts`
- `GET  /v1/transactions`
- `PATCH /v1/transactions/:id`
- `DELETE /v1/transactions/:id`
- `GET  /v1/summary`
- `POST /v1/recaps/weekly/run`
- `POST /v1/whatsapp/webhook` (alias: `/api/whatsapp/webhook`)

## Agent flow

1. Inbound message → `AgentService.handleMessage`.
2. `pi-agent-core` runs the tool loop against `agent/tools.ts`.
3. Tools mutate the ledger via `LedgerWriter` and app state via `StateStore`.
4. Response text is returned to the caller (HTTP reply or WhatsApp bridge).

## Deleted surfaces

The Python FastAPI app (`src/gullak/`), its tests, Paisa integration, Dockerfiles, old Vite UI (`web/`), and the abandoned Rust rewrite (`rust-backend/`, `rust-whatsapp-worker/`) have all been removed. Don't look for them.
