# Gullak Pi Server

Minimal ledger-first Gullak runtime built around [pi-sdk](https://github.com/mariozechner/pi).

## What it does

- Exposes a small JSON HTTP API over `data/main.ledger`
- Uses `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` for the NL → tools loop
- Accepts WhatsApp traffic via `whatsapp-bridge` webhooks
- Generates weekly recap files; optionally posts them to WhatsApp

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm dev                       # http://127.0.0.1:8787
```

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | `tsx watch src/index.ts` |
| `pnpm build` | `tsc -p tsconfig.json` |
| `pnpm start` | `node dist/index.js` (after build) |
| `pnpm test` | `tsx --test test/**/*.test.ts` |
| `pnpm recap:weekly` | Weekly recap CLI |

## Endpoints

- `POST /v1/messages`
- `GET  /v1/accounts`
- `GET  /v1/transactions`
- `PATCH /v1/transactions/:id`
- `DELETE /v1/transactions/:id`
- `GET  /v1/summary`
- `POST /v1/recaps/weekly/run`
- `POST /v1/whatsapp/webhook` (alias: `/api/whatsapp/webhook`)

Auth: set `GULLAK_HTTP_API_KEY` and send `X-Api-Key`. The health and webhook routes are exempt.

## Weekly recap

```bash
pnpm recap:weekly                       # writes data/recaps/<iso-week>.md
pnpm recap:weekly --send-whatsapp       # also posts to GULLAK_RECAP_WHATSAPP_CHAT_ID
```

## WhatsApp

`whatsapp-bridge` ships with `WEBHOOK_URL=http://localhost:8787/v1/whatsapp/webhook` as its default — no wiring needed when both run on the same host.
