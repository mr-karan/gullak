# Self-hosting the Chavanni sync server

The Chavanni app works with **no server at all** — the phone owns your ledger and
everything runs offline. You only need a server when you want:

- **Sync** across multiple devices,
- **Server-side AI** parsing (bank SMS, receipt photos, "describe it" text),
- the **WhatsApp bridge** (chat to log/query expenses), or
- **exports** to Google Sheets / Actual Budget.

The server (`pi-server`) is a merge point and the trusted place to hold your AI
provider keys. The app never stores model credentials. If the server is down,
the app keeps working — it re-syncs when the server comes back.

Everything below uses placeholders. Substitute your own host, keys, and IDs.

---

## Requirements

- **Node 20+** with `tsx` (the server runs the TypeScript sources directly — no
  build step), **or**
- **Docker** (recommended for production — the image handles the native
  `better-sqlite3` build for you).

Storage is a single SQLite file. A Raspberry Pi 4, a small VPS, or any
always-on box is plenty.

---

## Quick start (Node)

From `pi-server/`:

```bash
cp .env.example .env        # all vars optional for local dev
npm install
npm run dev                 # http://127.0.0.1:8787 (migrations run on boot)
```

Production: `npm run start`. Database migrations apply automatically at startup.

---

## Docker

The repo ships a `whatsapp-bridge/Dockerfile`. For `pi-server`, add the
`Dockerfile` below (native `better-sqlite3` needs a compile toolchain at
install time, so `npm ci` runs with build deps present).

### `pi-server/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-slim

# Build deps for the native better-sqlite3 addon. python3 + build-essential
# are needed at `npm ci` time; ca-certificates for outbound HTTPS (model API).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install first (better layer caching). package-lock.json must be present so
# `npm ci` is reproducible.
COPY package.json package-lock.json ./
RUN npm ci

# App sources. The server runs TypeScript directly via tsx (no build step).
COPY . .

ENV NODE_ENV=production \
    CHAVANNI_HOST=0.0.0.0 \
    CHAVANNI_PORT=8787 \
    CHAVANNI_DB_PATH=/data/chavanni.db \
    CHAVANNI_DATA_DIR=/data

# SQLite DB, WAL/SHM, and any local caches live on the mounted volume.
VOLUME ["/data"]
EXPOSE 8787/tcp

CMD ["npm", "run", "start"]
```

> Bind to `0.0.0.0` **inside the container only** — the container port is then
> published (or reverse-proxied) on the host. Never expose an unauthenticated
> server to the public internet; set an API key (below).

### `docker-compose.yml`

Put this at the repo root (or anywhere; adjust build contexts). The
`whatsapp-bridge` service is optional — remove it if you don't want WhatsApp.

```yaml
services:
  pi-server:
    build:
      context: ./pi-server
    restart: unless-stopped
    ports:
      - "8787:8787"          # or keep internal and reverse-proxy it
    volumes:
      - chavanni-data:/data
    environment:
      CHAVANNI_HOST: "0.0.0.0"
      CHAVANNI_PORT: "8787"
      CHAVANNI_DB_PATH: "/data/chavanni.db"
      CHAVANNI_DATA_DIR: "/data"
      CHAVANNI_TIMEZONE: "Asia/Kolkata"
      CHAVANNI_DEFAULT_CURRENCY: "INR"
      # Auth — set a strong secret and require it in production.
      CHAVANNI_HTTP_API_KEY: "${CHAVANNI_HTTP_API_KEY}"
      CHAVANNI_REQUIRE_AUTH: "true"
      # AI (optional) — bring your own OpenAI-compatible provider.
      CHAVANNI_MODEL_BASE_URL: "${CHAVANNI_MODEL_BASE_URL:-}"
      CHAVANNI_MODEL_ID: "${CHAVANNI_MODEL_ID:-}"
      CHAVANNI_MODEL_API_KEY: "${CHAVANNI_MODEL_API_KEY:-}"
      # WhatsApp (optional) — must match the bridge's key.
      CHAVANNI_WHATSAPP_BRIDGE_URL: "http://whatsapp-bridge:3000"
      CHAVANNI_WHATSAPP_API_KEY: "${CHAVANNI_WHATSAPP_API_KEY:-}"

  # Optional. Delete this whole service if you don't use WhatsApp.
  whatsapp-bridge:
    build:
      context: ./whatsapp-bridge
    restart: unless-stopped
    volumes:
      - whatsapp-data:/data          # Baileys session state — do NOT delete
    environment:
      PORT: "3000"
      WEBHOOK_URL: "http://pi-server:8787/v1/whatsapp/webhook"
      AUTH_DIR: "/data/auth_state"
      CHAVANNI_WHATSAPP_API_KEY: "${CHAVANNI_WHATSAPP_API_KEY:-}"
      # Optional allowlists — empty means allow all.
      ALLOWED_PHONE_NUMBERS: "${ALLOWED_PHONE_NUMBERS:-}"
      ALLOWED_GROUPS: "${ALLOWED_GROUPS:-}"
    # No public port — pi-server reaches it on the internal network.

volumes:
  chavanni-data:
  whatsapp-data:
```

Bring it up with `docker compose up -d`. Provide secrets via an `.env` file
next to the compose file (compose reads it automatically) or your host's
environment — do not commit real keys.

---

## Environment variables

Every `CHAVANNI_*` variable the server reads, from `pi-server/src/config.ts`. All
are optional; the defaults run a **local, no-auth dev server**. Harden auth and
set a model key before exposing the server.

### Storage

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAVANNI_DATA_DIR` | `../data` | Base directory for the DB and local caches. |
| `CHAVANNI_DB_PATH` | `${CHAVANNI_DATA_DIR}/chavanni.db` | SQLite database file path. |
| `CHAVANNI_TIMEZONE` | `Asia/Kolkata` | Server timezone for date bucketing. |
| `CHAVANNI_DEFAULT_CURRENCY` | `INR` | Default currency code. |

### HTTP & auth

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAVANNI_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` in a container. |
| `CHAVANNI_PORT` | `8787` | Listen port. Must be a valid integer (fails fast otherwise). |
| `CHAVANNI_HTTP_API_KEY` | *(unset)* | Shared secret for the `x-api-key` header. Unset = open server. |
| `CHAVANNI_REQUIRE_AUTH` | `false` | `true` refuses to boot unless `CHAVANNI_HTTP_API_KEY` is set. Turn on in production. |
| `CHAVANNI_TRUST_PROXY` | `false` | `true` keys rate limits off `X-Forwarded-For`. Only enable behind a trusted reverse proxy. |

### AI model (optional)

If no real key resolves, `/v1/ai/*` returns `503` — AI is simply disabled and
the rest of the server still works. The provider must be OpenAI-compatible
(OpenRouter, OpenAI, a local Ollama, etc.).

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAVANNI_MODEL_BASE_URL` | `http://localhost:11434/v1`¹ | OpenAI-compatible base URL. |
| `CHAVANNI_MODEL_ID` | `gpt-oss:20b`¹ | Model identifier passed to the provider. |
| `CHAVANNI_MODEL_NAME` | `GPT-OSS 20B`¹ | Human-readable model name (display only). |
| `CHAVANNI_MODEL_API_KEY` | *(unset)* | The model provider key. Enables AI when set. |
| `CHAVANNI_MODEL_REASONING` | `true` | Whether to request reasoning from the model. |
| `CHAVANNI_MODEL_THINKING_LEVEL` | `minimal` | One of `off`, `minimal`, `low`, `medium`, `high`, `xhigh`. |
| `CHAVANNI_MODEL_TIMEOUT_MS` | `60000` | Per-call LLM request timeout in ms (vision calls are slow). |
| `CHAVANNI_AI_RATE_PER_MIN` | `30` | Fixed-window req/min/IP cap on `/v1/ai/*` and `/v1/messages`. `0` disables. |
| `CHAVANNI_ALLOW_AMBIENT_MODEL_KEYS` | `false` | When `true`, allow `OPENROUTER_API_KEY` / `OPENAI_API_KEY` from the ambient environment to be used as the model key. |
| `OPENROUTER_API_KEY` | *(unset)* | Alias, only read when the ambient flag is on. Auto-defaults base URL to `https://openrouter.ai/api/v1` and model to `google/gemini-3-flash-preview`. |
| `OPENAI_API_KEY` | *(unset)* | Alias, only read when the ambient flag is on. Auto-defaults base URL to `https://api.openai.com/v1` and model to `gpt-4.1-mini`. |

¹ Defaults shift based on which key resolves: with `OPENROUTER_API_KEY` the base
URL/model default to OpenRouter + Gemini; with `OPENAI_API_KEY`, to OpenAI +
GPT-4.1 Mini; otherwise to a local Ollama. An explicit `CHAVANNI_MODEL_*` always
wins.

### WhatsApp bridge (optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAVANNI_WHATSAPP_BRIDGE_URL` | `http://localhost:3000` | Where the server reaches the bridge's HTTP API. |
| `CHAVANNI_WHATSAPP_API_KEY` | *(unset)* | Shared secret for the webhook + bridge API. Set on **both** server and bridge. |
| `CHAVANNI_WHATSAPP_ALLOWED_NUMBERS` | `[]` | Comma-separated or JSON-array allowlist of numbers. Empty = allow all. |
| `CHAVANNI_WHATSAPP_GROUP_REQUIRE_MENTION` | `false` | `true` = only respond in groups when the bot is mentioned. |
| `CHAVANNI_WHATSAPP_RATE_PER_MIN` | `60` | Fixed-window req/min/IP cap on the webhook. `0` disables. |

### Exports (optional, opt-in, write-only)

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAVANNI_SHEETS_WEBAPP_URL` | *(unset)* | Apps Script `/exec` URL bound to your sheet. |
| `CHAVANNI_SHEETS_SECRET` | *(unset)* | Shared secret matching `CHAVANNI_SECRET` in the Apps Script. |
| `CHAVANNI_SHEETS_SYNC_INTERVAL_MIN` | `0` | Periodic push cadence in minutes. `0` disables the timer (push still fires after each sync push). |
| `CHAVANNI_ACTUAL_SERVER_URL` | *(unset)* | Actual Budget server URL. |
| `CHAVANNI_ACTUAL_PASSWORD` | *(unset)* | Actual Budget password. |
| `CHAVANNI_ACTUAL_SYNC_ID` | *(unset)* | The budget file's Sync ID (Actual → Settings → Advanced). |
| `CHAVANNI_ACTUAL_ACCOUNT_ID` | *(unset)* | Account to import into. Defaults to the first account. |
| `CHAVANNI_ACTUAL_DATA_DIR` | `${CHAVANNI_DATA_DIR}/.actual-cache` | Local cache dir the Actual API downloads the budget into. |

Sheets is enabled when `CHAVANNI_SHEETS_WEBAPP_URL` **and** `CHAVANNI_SHEETS_SECRET`
are both set. Actual is enabled when server URL + password + sync ID are all
set. Enabled destinations fan out after each sync push and upsert by a stable
id, so re-runs never duplicate.

---

## API key & reverse proxy

`/v1/health` is public. `/v1/whatsapp/webhook` is exempt from the general
`x-api-key` gate (so the bridge can reach it) and is instead secured by the
**dedicated** `CHAVANNI_WHATSAPP_API_KEY`. Every other route requires `x-api-key`
once `CHAVANNI_HTTP_API_KEY` is set.

**Before exposing the server beyond localhost:**

1. Set a strong `CHAVANNI_HTTP_API_KEY` and `CHAVANNI_REQUIRE_AUTH=true`.
2. Terminate TLS at a reverse proxy (Caddy, nginx, Traefik) or keep the server
   on a private network / VPN (e.g. Tailscale).
3. If behind a proxy, set `CHAVANNI_TRUST_PROXY=true` so rate limits key off the
   real client IP.

Minimal Caddy example (automatic HTTPS):

```
chavanni.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

---

## Backups

The entire server state is one SQLite file (`CHAVANNI_DB_PATH`). Copy it while the
server is idle, or use SQLite's online backup:

```bash
cp "$CHAVANNI_DB_PATH" "$CHAVANNI_DB_PATH.backup-$(date +%Y%m%d-%H%M%S)"
```

For continuous, point-in-time backups to object storage, run
[**Litestream**](https://litestream.io) against the DB file — it streams the
SQLite WAL to S3-compatible storage and restores on boot. It's the recommended
setup for an always-on self-hosted server.

Because the phone is the source of truth, a lost server can also re-populate
from the next device sync — but a real backup is still worth having for the
server-only state (sync changelog, feedback events).

---

## Connect the app

In the app: **Settings → Sync server**

- **Base URL** — e.g. `https://chavanni.example.com`
- **API key** — matches the server's `CHAVANNI_HTTP_API_KEY`

The app pushes local changes, then pulls server changes. All AI calls
round-trip through the server, so the app never holds provider credentials.

---

## WhatsApp bridge pairing

The bridge relays WhatsApp messages into the conversational agent. Once it's
running (see the compose service above), pair it once:

1. `POST /api/default/auth/start` to begin a session.
2. `GET /api/default/auth/qr` returns a PNG QR code.
3. Scan it from your phone: **WhatsApp → Linked Devices → Link a device**.

Session state persists under `AUTH_DIR` (a Baileys multi-file auth store on the
mounted volume). **Do not delete it** unless you intend to re-pair. The session
can expire if the phone is offline for ~14 days — re-scan the QR if so. Baileys
is an unofficial WhatsApp Web client, so occasional breakage on WhatsApp updates
is expected.

---

## Reset the server DB

Back up first, then stop the server and remove the DB (and its WAL/SHM
sidecars) so migrations recreate an empty database on the next boot:

```bash
cd "$(dirname "$CHAVANNI_DB_PATH")"
cp chavanni.db "chavanni.db.backup-$(date +%Y%m%d-%H%M%S)"
rm -f chavanni.db chavanni.db-wal chavanni.db-shm
```

Do not remove the WhatsApp `auth_state` / `whatsapp.db` unless you specifically
intend to reset WhatsApp pairing.
