# WhatsApp Bridge

Node/Bun service that connects WhatsApp (via [Baileys](https://github.com/WhiskeySockets/Baileys)) to `pi-server`. It posts inbound messages as webhooks and exposes a small HTTP API that `pi-server` uses to send replies, typing indicators, and read receipts.

## Files

```
whatsapp-bridge/
├── index.js       # Baileys socket, webhook forwarder, HTTP API
├── package.json
├── Dockerfile
└── .env.example
```

## Message flow

1. User sends a WhatsApp message.
2. Baileys receives it over WebSocket.
3. `index.js` extracts text (and optionally media as base64) and POSTs `{event: "message", payload}` to `WEBHOOK_URL`.
4. `pi-server` processes it via `WhatsAppService` and POSTs back to `/api/sendText`.

## Environment

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `WEBHOOK_URL` | `http://localhost:8787/v1/whatsapp/webhook` | Where to forward inbound messages |
| `AUTH_DIR` | `./auth_state` | Baileys multi-file auth state dir |
| `CHAVANNI_WHATSAPP_API_KEY` | – | Shared secret; required on `/api/*` calls when set |
| `ALLOWED_PHONE_NUMBERS` | – | Comma-separated allowlist for DMs. Empty = allow all. |
| `ALLOWED_GROUPS` | – | Comma-separated group-name allowlist. Empty = allow all. |
| `LOG_LEVEL` | `warn` | pino level |

## Auth / QR

Session is persisted under `AUTH_DIR/` (Baileys `useMultiFileAuthState`). On first run there is no UI — the bridge exposes:

- `POST /api/default/auth/start` — begin a session
- `GET  /api/default/auth/qr` — returns a PNG QR code to scan

Scan from your phone's WhatsApp → Linked Devices.

## HTTP API (consumed by pi-server)

- `POST /api/sendText` `{chatId, text}`
- `POST /api/sendSeen` `{chatId}`
- `POST /api/startTyping` `{chatId}`
- `POST /api/stopTyping` `{chatId}`
- `GET  /api/status`
- `GET  /health`

## Commands

```bash
pnpm install
pnpm start             # bun run index.js
```

## Gotchas

- Session can expire if the phone is offline for ~14 days — re-scan QR.
- Baileys is an unofficial WhatsApp Web client; breakage on WhatsApp updates is expected.
- LID (`@lid`) senders in groups get resolved to phone numbers via `groupMetadata` and cached for 2h.
