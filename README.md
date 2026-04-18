# Gullak

Ledger-first expense tracker. Natural-language messages in, plain-text [`ledger-cli`](https://ledger-cli.org/) entries out.

> _"Spent 450 on groceries at Blinkit on HDFC UPI"_ → a structured, double-entry transaction appended to `data/main.ledger`.

## Why

Paisa-style dashboards and fancy UIs get in the way. Gullak keeps a single plain-text ledger file as the source of truth, uses a small LLM to turn messages into postings, and exposes everything through a minimal JSON HTTP API. WhatsApp is a thin transport on top.

## Architecture

```
              ┌──────────────┐         ┌──────────────┐
  WhatsApp ──▶│   bridge     │──POST──▶│  pi-server   │──▶ data/main.ledger
              │ (Baileys)    │         │ (TypeScript) │──▶ data/pi-state.json
              └──────────────┘         └──────┬───────┘
                    ▲                         │
                    └─────── /api/sendText ◀──┘
```

- **`pi-server/`** — Express JSON API, pi-sdk agent, ledger IO, weekly recap. Node ≥ 20.
- **`whatsapp-bridge/`** — Baileys WhatsApp socket; posts `{event, payload}` webhooks to `pi-server`.
- **`data/main.ledger`** — the only persistent store. App state (payee memory, dedupe, recap history) sits next to it in `pi-state.json`.

## Quick start

Requires `pnpm`, `node >=20`, and `ledger` (for write validation — optional, can be disabled).

```bash
# pi-server
cd pi-server
cp .env.example .env           # fill in model + api keys
pnpm install
pnpm dev                       # http://127.0.0.1:8787

# whatsapp-bridge (separate terminal; optional)
cd whatsapp-bridge
cp .env.example .env
pnpm install
pnpm start                     # prints a URL to fetch the QR
```

Scan the QR at `http://localhost:3000/api/default/auth/qr` from WhatsApp → Linked Devices.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/messages` | Free-form natural-language message → agent |
| GET  | `/v1/accounts` | List accounts from the ledger |
| GET  | `/v1/transactions` | Query transactions (filter by date, payee, account) |
| PATCH | `/v1/transactions/:id` | Edit an app-authored transaction |
| DELETE | `/v1/transactions/:id` | Remove an app-authored transaction |
| GET  | `/v1/summary` | Totals for a period |
| POST | `/v1/recaps/weekly/run` | Generate (and optionally send) a weekly recap |
| POST | `/v1/whatsapp/webhook` | Inbound WhatsApp messages (alias: `/api/whatsapp/webhook`) |

Auth: set `GULLAK_HTTP_API_KEY` and pass it via `X-Api-Key`. Webhook paths are exempt.

## Weekly recap

```bash
cd pi-server
pnpm recap:weekly                       # writes data/recaps/<iso-week>.md
pnpm recap:weekly --send-whatsapp       # also posts to GULLAK_RECAP_WHATSAPP_CHAT_ID
```

Math is deterministic — the LLM only phrases the summary.

## Configuration

All env is documented in [`pi-server/.env.example`](./pi-server/.env.example) and [`whatsapp-bridge/.env.example`](./whatsapp-bridge/.env.example). Key pieces:

- `GULLAK_LEDGER_PATH` — path to `main.ledger` (default `../data/main.ledger`)
- `GULLAK_MODEL_*` — model endpoint, id, key. Works with any OpenAI-compatible API (Ollama, OpenRouter, etc.)
- `GULLAK_WHATSAPP_ALLOWED_NUMBERS` — DM allowlist
- `GULLAK_VALIDATE_WRITES` — run `ledger source` on every write (default `true`)

## Repo layout

```
gullak/
├── pi-server/          # the app
├── whatsapp-bridge/    # Baileys bridge
├── data/               # main.ledger (gitignored)
├── docs/               # architecture notes
├── AGENTS.md / CLAUDE.md
└── README.md
```

## License

[AGPL v3](./LICENSE)
