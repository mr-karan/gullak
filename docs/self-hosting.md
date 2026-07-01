# Self-hosting

The app works with no server at all. Run a server when you want sync across
devices, server-side AI parsing, the WhatsApp bridge, or exports to Google
Sheets / Actual Budget.

Everything below uses placeholders — substitute your own host, keys, and IDs.

## pi-server

Node ≥ 20. From `pi-server/`:

```bash
cp .env.example .env        # all vars optional for local dev
npm install
npm run dev                 # http://127.0.0.1:8787 (migrations run on boot)
```

Production: `npm run start`. Migrations apply automatically at startup.

### With Docker

```bash
cd pi-server
docker build -t gullak-server .
docker run -d --name gullak \
  -p 8787:8787 \
  -v /srv/gullak:/data \
  --env-file /srv/gullak/gullak.env \
  gullak-server
```

The image runs the TypeScript sources with `tsx`; the SQLite DB and any local
caches live under the mounted `/data` volume.

### Configuration

See [`pi-server/.env.example`](../pi-server/.env.example) for the full annotated
list. The essentials:

| Variable | Purpose |
| --- | --- |
| `GULLAK_DB_PATH` | SQLite file path (default `../data/gullak.db`) |
| `GULLAK_HOST`, `GULLAK_PORT` | HTTP bind (default `127.0.0.1:8787`) |
| `GULLAK_HTTP_API_KEY` | Shared secret for the `x-api-key` header |
| `GULLAK_REQUIRE_AUTH` | `true` refuses to boot without an API key |
| `GULLAK_MODEL_BASE_URL` / `GULLAK_MODEL_ID` / `GULLAK_MODEL_API_KEY` | OpenAI-compatible model config |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | Aliases that auto-default base URL + model |

`/v1/health` and `/v1/whatsapp/webhook` are public; every other route requires
`x-api-key` once `GULLAK_HTTP_API_KEY` is set. If no model key resolves, `/v1/ai/*`
simply returns `503` — AI is off, the rest of the server still works.

> **Expose it safely.** Put the server behind a reverse proxy with TLS, or keep
> it on a private network / VPN. Always set `GULLAK_HTTP_API_KEY` (and
> `GULLAK_REQUIRE_AUTH=true`) before exposing it beyond localhost.

## Connect the app

In the app: **Settings → Sync server**

- **Base URL** — e.g. `https://gullak.example.com`
- **API key** — matches the server's `GULLAK_HTTP_API_KEY`

The app pushes local changes, then pulls server changes, on foreground and after
mutations. All AI calls round-trip through the server, so the app never holds
provider credentials.

## WhatsApp bridge (optional)

Relays WhatsApp messages into the agent. From `whatsapp-bridge/`, set
`WEBHOOK_URL` to your server's `/v1/whatsapp/webhook` and an auth key that
matches `GULLAK_WHATSAPP_API_KEY` on the server, then start it and scan the
pairing QR once. Session state persists in a local SQLite DB — don't delete it
unless you intend to re-pair.

## Exports: Google Sheets & Actual Budget (optional)

Both are opt-in and write-only; enabling them mirrors categorised activity out
without changing anything in Gullak. Full setup and behaviour:
[destinations.md](destinations.md). In short:

- **Google Sheets** — deploy the bundled Apps Script as a web app, set a shared
  secret, and configure `GULLAK_SHEETS_WEBAPP_URL` + `GULLAK_SHEETS_SECRET`.
- **Actual Budget** — set `GULLAK_ACTUAL_SERVER_URL`, `GULLAK_ACTUAL_PASSWORD`,
  and `GULLAK_ACTUAL_SYNC_ID` (plus optionally `GULLAK_ACTUAL_ACCOUNT_ID`).

Enabled destinations fan out after each sync push, and each upserts by a stable
id so re-runs never duplicate.

## Backup & reset

**Back up** by copying the SQLite file (the app can also export JSON/CSV):

```bash
cp "$GULLAK_DB_PATH" "$GULLAK_DB_PATH.backup-$(date +%Y%m%d-%H%M%S)"
```

**Reset the server DB** (back up first), then restart so migrations recreate an
empty database:

```bash
cd "$(dirname "$GULLAK_DB_PATH")"
cp gullak.db gullak.db.backup-$(date +%Y%m%d-%H%M%S)
rm -f gullak.db gullak.db-wal gullak.db-shm
```

Because the phone is the source of truth, a reset server re-populates from the
next sync. Reset app state on Android with `just clear-data`.
