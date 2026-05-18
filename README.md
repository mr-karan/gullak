# Gullak

Gullak is a local-first mobile expense tracker. Phone owns the ledger (Drift +
SQLite); a self-hosted server holds the merge point, the AI credentials, and an
optional WhatsApp bridge. The phone works offline; the server is a coordination
peer, not a runtime dependency.

## Layout

```
gullak/
├── app/                 # Flutter Android/iOS — Riverpod, Drift, Phosphor icons
│   ├── lib/
│   │   ├── core/        # money, prefs, notifications, secure store, snackbars
│   │   ├── data/        # Drift schema, SMS pipeline, AI client
│   │   ├── features/    # one folder per screen / domain
│   │   └── sync/        # push/pull client, remote applier, scheduler
│   └── test/
├── pi-server/           # Bun + Hono + Drizzle + bun:sqlite
│   ├── src/ai/          # SMS, QuickEntry, WhatsApp parsers + enricher
│   ├── src/agent/       # multi-turn assistant for messages / WhatsApp
│   ├── src/routes/      # one router per resource
│   ├── src/repos/       # changelog + small repo helpers
│   └── drizzle/         # generated migrations
├── whatsapp-bridge/     # Bun + Baileys → POST /v1/whatsapp/webhook
├── CHANGELOG.md
├── Justfile             # repo-wide recipes (apk, install, gate, …)
└── README.md
```

## Architecture

```
┌────────────────────┐     HTTPS sync / AI    ┌──────────────────────┐
│ Flutter app        │◀──────────────────────▶│ pi-server            │
│ Drift + SQLite     │                        │ Bun + Hono + Drizzle │
│ source of truth    │                        │ bun:sqlite           │
└────────────────────┘                        └──────────┬───────────┘
                                                         │ webhook
                                              ┌──────────┴───────────┐
                                              │ whatsapp-bridge      │
                                              │ Bun + Baileys        │
                                              └──────────────────────┘
```

Money is integer minor units everywhere (`₹490.00` → `49000`). IDs are
client-generated UUIDs. Dates are `YYYY-MM-DD`; timestamps are epoch ms.
Sync conflict policy is last-write-wins by `updatedAt`.

## What ships today (0.2.x)

- **Quick Entry** — manual, AI-from-text, AI-from-receipt-image, and the share-
  sheet target. Split transactions, transfers, tags, and optional per-row
  location capture.
- **Activity** — daily / week / calendar / month / summary segments with
  filters across account, category, tag, amount range, date, origin, status,
  and free-text SMS body search.
- **Inbox** — SMS triage with Ready / Needs review / Ignored / Already matched
  buckets, parser-debug dialog, and "Send feedback" upload.
- **SMS pipeline** — local classifier → server LLM parser, auto-confirm with a
  configurable confidence threshold, background enrichment worker that fills
  in payee/category from user replies on the notification.
- **Sync** — bidirectional via local + server `change_log` rows, idempotent by
  `(clientId, clientChangeId)`. Auto-pull on resume.
- **Categories** — single visible hierarchy (parent → subcategory), Phosphor
  icons resolved by name with an editorial accent-colour palette.
- **Rules** — synced payee/category mappings with priority + match history.
- **WhatsApp** — Baileys bridge pipes inbound messages through the same
  multi-turn agent.
- **Backup** — local JSON export, CSV transactions export, last-export-at
  status, restore preview.

## Commands

```bash
# from repo root
just devices                  # list connected Android devices
just apk                      # build release APK into app/dist/
just install                  # build release + adb install latest
just install debuggable=true  # release build with android:debuggable=true
                              # — for ad-hoc `adb shell run-as` DB pulls
just clear-data               # wipe dev.mrkaran.gullak state on device
just launch                   # launch installed app
just logcat                   # tail logcat filtered to the app's pid
just gate                     # dart format --check + analyze + test
```

```bash
cd app && flutter analyze && flutter test
cd pi-server && bun install && bun run dev   # hot reload on :8787
cd pi-server && bun run typecheck && bun test
cd whatsapp-bridge && bun install && bun run start
```

The pi-server auto-applies Drizzle migrations at startup. Set
`GULLAK_DB_PATH` to override the default `../data/gullak.db`.

## Configuration

### pi-server environment

| Variable | Purpose |
| --- | --- |
| `GULLAK_DB_PATH` | SQLite file path (default `../data/gullak.db`) |
| `GULLAK_HOST`, `GULLAK_PORT` | HTTP bind, default `127.0.0.1:8787` |
| `GULLAK_HTTP_API_KEY` | Enables `x-api-key` auth for all non-public endpoints |
| `GULLAK_MODEL_BASE_URL` | OpenAI-compatible base URL |
| `GULLAK_MODEL_ID` | Model id for AI extraction + agent |
| `GULLAK_MODEL_API_KEY` | Model provider key |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | Aliases — auto-default the base/model |
| `GULLAK_WHATSAPP_BRIDGE_URL` | Internal bridge URL for outbound replies |

If no hosted model key is set, the server falls back to a local Ollama-style
OpenAI-compatible endpoint. The Flutter app never stores model credentials —
all AI calls round-trip through the pi-server.

### App configuration

`Settings → Sync server`:

- Base URL (e.g. `https://gullak.mrkaran.dev`)
- API key matching `GULLAK_HTTP_API_KEY`

## pi-server HTTP API

`/v1/health` and `/v1/whatsapp/webhook` are public; everything else requires
`x-api-key` when the server has `GULLAK_HTTP_API_KEY` set.

```
GET    /v1/health
GET    /v1/accounts                 POST/PATCH/DELETE /v1/accounts(/:id)
GET    /v1/category-groups          POST/PATCH/DELETE /v1/category-groups(/:id)
GET    /v1/categories               POST/PATCH/DELETE /v1/categories(/:id)
GET    /v1/payees                   POST/PATCH/DELETE /v1/payees(/:id)
GET    /v1/transactions             POST/PATCH/DELETE /v1/transactions(/:id)
GET    /v1/budgets                  POST/PATCH/DELETE /v1/budgets(/:id)
GET    /v1/recurrences              POST/PATCH/DELETE /v1/recurrences(/:id)
GET    /v1/summary?startDate=&endDate=&accountId=
GET    /v1/sync/changes?since=<id>&limit=<n>&clientId=<uuid>
POST   /v1/sync/push
POST   /v1/messages
POST   /v1/whatsapp/webhook
POST   /v1/ai/sms/parse
POST   /v1/ai/sms/enrich
POST   /v1/ai/quick-entry/parse
POST   /v1/feedback
GET    /v1/feedback?limit=<n>
```

## Sync model

1. App repositories write to Drift and append a row to local `change_log` via
   `ChangeLogWriter`.
2. `SyncService.pushPending` batches unsynced mutations to `/v1/sync/push`.
3. The server applies row changes and appends server `change_log` entries in
   a single transaction. `(client_id, client_change_id)` uniqueness makes the
   push idempotent under retry.
4. `SyncService.pullChanges` pages `/v1/sync/changes` and applies remote rows
   directly via `RemoteApplier`, bypassing repos so it doesn't recurse into
   the local changelog.
5. The server filters changes originated by the requesting `clientId` so a
   client never echoes its own writes back.

## SMS and AI

- Android receiver wakes the app; a local classifier sorts transactional SMS
  from noise.
- `POST /v1/ai/sms/parse` returns an `SmsCandidate`: amount, direction, payee,
  account hint, category hint/id, date, bank ref, confidence.
- Server-side category resolution order: learned payee mapping → LLM category
  → deterministic merchant fallback → null.
- If auto-confirm is on and confidence ≥ threshold, the app writes the
  transaction and fires a notification with an inline "Add note" reply. The
  reply enqueues a WorkManager job that calls `POST /v1/ai/sms/enrich`, and
  the result back-fills the payee + category on both the SMS row and the
  linked transaction.
- Old failed Inbox rows are rescannable: `retryFailedBackfill()` clears
  retryable statuses and the parse cache before backfill so parser fixes
  actually reparse historical SMS.

## Releases

```bash
just apk
git tag v0.2.0
git push origin main v0.2.0
tea release create --repo mr-karan/gullak --tag v0.2.0 \
  --title "Gullak 0.2.0" --note-file CHANGELOG.md \
  --asset app/dist/gullak-latest.apk
```

Artifacts are written to `app/dist/`:

- `gullak-<git-sha>-<timestamp>.apk`
- `gullak-latest.apk` symlink

The build is stamped via `--dart-define` so `Settings → About` shows the
exact commit on-device.

## Resetting

Homelab DB reset, with a backup:

```bash
ssh floyd-homelab-1 'cd /mnt/storage/gullak && \
  cp gullak.db gullak.db.backup-$(date +%Y%m%d-%H%M%S) && \
  rm -f gullak.db gullak.db-wal gullak.db-shm'
```

Then restart the stack so migrations recreate an empty DB.

Android app state reset:

```bash
just clear-data
```

## License

[AGPL v3](./LICENSE)
