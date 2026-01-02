# WHATSAPP BRIDGE

Node.js service using Baileys. Separate from Python codebase.

## OVERVIEW

Bridges WhatsApp messages to Gullak API. Uses Baileys (unofficial WhatsApp Web API).

## STACK

- **Runtime**: Node.js / Bun
- **Library**: @whiskeysockets/baileys
- **Auth**: QR code scan, session persisted to `auth_state/`

## FILES

```
whatsapp-bridge/
├── index.js       # Main entry, message handling
├── package.json   # Dependencies
└── Dockerfile     # Container build
```

## MESSAGE FLOW

1. User sends WhatsApp message
2. Baileys receives via WebSocket
3. `index.js` extracts text/media
4. POST to `http://gullak:8000/api/whatsapp/webhook`
5. Gullak processes, returns response
6. Bridge sends reply to WhatsApp

## MEDIA HANDLING

```javascript
// Uses normalizeMessageContent for ephemeral/view-once messages
const content = normalizeMessageContent(msg.message)
const mediaTypes = ['imageMessage', 'documentMessage', 'stickerMessage']
```

Media is downloaded, base64 encoded, sent to Gullak for OCR.

## CONFIGURATION

| Env Var | Purpose |
|---------|---------|
| `GULLAK_API_URL` | Gullak backend URL |
| `GULLAK_WHATSAPP_ALLOWED_NUMBERS` | JSON array of allowed phone numbers |

## SECURITY

- Set `GULLAK_WHATSAPP_ALLOWED_NUMBERS` to restrict access
- Format: `["919876543210"]` (country code + number, no +)

## COMMANDS

```bash
npm install          # Install deps
npm start            # Run bridge
docker build -t whatsapp-bridge .
```

## GOTCHAS

- Session expires if phone disconnects for ~14 days
- QR code must be scanned from Gullak UI (`/api/whatsapp/qr`)
- Baileys is unofficial - may break with WhatsApp updates
