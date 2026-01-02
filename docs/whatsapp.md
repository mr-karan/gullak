---
summary: "WhatsApp integration setup, configuration, and troubleshooting"
read_when:
  - Setting up WhatsApp integration
  - Troubleshooting WhatsApp connection issues
  - Configuring WhatsApp security
---

# WhatsApp Integration

Gullak features a built-in WhatsApp integration that allows you to log expenses on the go by simply messaging yourself (or a group).

## Overview

Unlike many other projects that use heavy WhatsApp APIs like WAHA, Gullak uses a lightweight, custom-built bridge based on [Baileys](https://github.com/WhiskeySockets/Baileys). This bridge runs as a sidecar service in Docker and manages the connection to WhatsApp by emulating a web session.

## How It Works

The WhatsApp integration consists of two main components:

1.  **WhatsApp Bridge (Node.js)**: A small service that handles the real-time connection to WhatsApp servers. It exposes a simple HTTP API for Gullak to send messages and uses webhooks to notify Gullak of incoming messages.
2.  **Gullak API (Python)**: Handles the business logic, security checks, and routes messages to the AI agent for processing.

### Architecture Diagram

```mermaid
graph LR
    User((User))
    WA[WhatsApp App]
    Bridge[WhatsApp Bridge <br/> Node.js + Baileys]
    Gullak[Gullak Server <br/> Python + FastAPI]
    LLM[AI Agent <br/> LLM]
    Ledger[(Ledger File)]

    User --> WA
    WA <-> Bridge
    Bridge -- Webhook --> Gullak
    Gullak -- API --> Bridge
    Gullak <-> LLM
    Gullak --> Ledger
```

## Setup Steps

Follow these steps to connect your WhatsApp account:

1.  **Start Services**: Ensure your Docker services are running:
    ```bash
    docker compose up -d
    ```
2.  **Access Settings**: Open the Gullak Web UI (usually at `http://localhost:8000`) and navigate to **Settings > WhatsApp Integration**.
3.  **Start Session**: Click the **"Generate QR Code"** (or "Start Session") button. This initializes the bridge.
4.  **Scan QR Code**: A QR code will appear on the screen. Open WhatsApp on your phone, go to **Linked Devices > Link a Device**, and scan the code.
5.  **Verification**: Once connected, the status should change to **"WORKING"**. You can now try sending a message like `"Lunch 500"` to the connected number.

## Security Configuration

Since anyone who knows your bot's number could potentially write to your ledger, Gullak provides security settings to restrict access.

### Allowed Numbers

You can restrict which phone numbers the bot responds to by setting the `GULLAK_WHATSAPP_ALLOWED_NUMBERS` environment variable in your `.env` file.

```bash
# Provide a JSON array of phone numbers with country codes (no '+' sign)
GULLAK_WHATSAPP_ALLOWED_NUMBERS='["919876543210", "919999999999"]'
```

If this variable is empty or not set, the bot will process messages from **any** number (not recommended for public-facing instances).

### Group Chat Behavior

By default, Gullak processes all messages from allowed numbers, even in group chats. If you want to use Gullak in a group but don't want it to log every single message, you can enable "Mention Required" mode.

- **Variable**: `GULLAK_WHATSAPP_GROUP_REQUIRE_MENTION`
- **Behavior**: When set to `true`, Gullak will only process messages in group chats if they start with `@gullak` or `gullak`.

```bash
GULLAK_WHATSAPP_GROUP_REQUIRE_MENTION=true
```

## Troubleshooting

### QR Code not generating
- Check the logs of the `whatsapp-bridge` container: `docker compose logs whatsapp-bridge`.
- Ensure the `WEBHOOK_URL` in `docker-compose.yml` correctly points to the Gullak service.
- If you see "Timeout" errors, try refreshing the page or restarting the services.

### "Logging in" spinner stuck
- This usually happens if the session files are corrupted.
- Try **Resetting the Session** (see below).

### Connection drops
- The Baileys bridge is designed to auto-reconnect. However, if it stays disconnected for a long time, you might need to re-scan the QR code.
- Check if your phone has a stable internet connection.

### Resetting the Session
If you need to completely log out and start fresh:
1. Stop the services: `docker compose down`.
2. Delete the WhatsApp session volume: `docker volume rm gullak_whatsapp_session` (or delete the folder mapped to `/data/whatsapp-session` if not using a named volume).
3. Start the services again and scan the QR code.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GULLAK_WHATSAPP_BRIDGE_URL` | URL of the WhatsApp bridge service | `http://whatsapp-bridge:3000` |
| `GULLAK_WHATSAPP_API_KEY` | Optional API key for bridge security | - |
| `GULLAK_WHATSAPP_ALLOWED_NUMBERS` | JSON array of allowed numbers | `[]` |
| `GULLAK_WHATSAPP_GROUP_REQUIRE_MENTION` | Require @gullak mention in groups | `false` |
| `WEBHOOK_URL` | (Bridge only) URL to send incoming messages to | `http://gullak:8000/api/whatsapp/webhook` |
| `LOG_LEVEL` | (Bridge only) Logging level (debug, info, warn, error) | `info` |
