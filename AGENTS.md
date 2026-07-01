# Gullak — Agent Knowledge Base

Gullak is a local-first mobile expense tracker with an optional self-hosted
sync/AI server and WhatsApp bridge. The phone is the source of truth; the server
is a merge point and trusted place to hold model credentials.

## Components

- **`app/`** — Flutter Android/iOS app. Riverpod + Drift/SQLite. Optimized for
  quick manual logging, SMS review, and offline-first operation.
- **`pi-server/`** — Node + Hono + Drizzle + better-sqlite3 HTTP API (run with
  `tsx`; migrated off Bun so `@actual-app/api`'s native better-sqlite3 works).
  Mirrors the app schema, stores sync changelog, runs AI extraction/agent calls,
  and records developer feedback.
- **`whatsapp-bridge/`** — Bun + Baileys bridge. Posts inbound WhatsApp messages
  to `/v1/whatsapp/webhook`; auth/cache state lives in one SQLite DB.

## Layout

```
gullak/
├── app/                     # Flutter app — UI, Drift, SMS, sync client
│   ├── lib/core/            # money, prefs, snackbars, secure storage
│   ├── lib/data/            # db, SMS, AI client
│   ├── lib/features/        # screens/repos by feature
│   ├── lib/sync/            # push/pull sync client + remote applier
│   └── test/                # widget/unit tests
├── pi-server/               # Node + Hono API
│   ├── src/ai/              # SMS + QuickEntry extraction prompts
│   ├── src/agent/           # multi-turn assistant for app/WhatsApp
│   ├── src/db/schema.ts     # Drizzle schema mirroring Drift tables
│   ├── src/routes/          # Hono routers per resource
│   ├── src/repos/changelog.ts
│   ├── src/app.ts           # Hono app factory + auth middleware
│   └── drizzle/             # generated migrations
├── whatsapp-bridge/         # Baileys bridge
├── CHANGELOG.md
├── README.md
└── Justfile
```

`data/gullak.db` is local pi-server persistence (gitignored); production sets
`GULLAK_DB_PATH` to a path on the server's mounted data volume.

## pi-server endpoints

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
POST   /v1/ai/quick-entry/parse
POST   /v1/feedback
GET    /v1/feedback?limit=<n>
```

Auth: `x-api-key` header. `/v1/health` and `/v1/whatsapp/webhook` are exempt.
Set `GULLAK_HTTP_API_KEY` to enable the gate.

The pi-server holds OpenRouter/OpenAI/local-Ollama credentials. Configure via
`GULLAK_MODEL_BASE_URL`, `GULLAK_MODEL_ID`, `GULLAK_MODEL_API_KEY`, or aliases
`OPENROUTER_API_KEY` / `OPENAI_API_KEY`. The Flutter app never stores model
provider keys.

## Where to look

| Task | File |
| --- | --- |
| Drift schema | `app/lib/data/db/tables.dart` |
| Drift database | `app/lib/data/db/database.dart` |
| Flutter pi-server AI client | `app/lib/data/ai/pi_ai_client.dart` |
| SMS pipeline | `app/lib/data/sms/sms_pipeline.dart` |
| SMS Inbox UI | `app/lib/features/inbox/inbox_screen.dart` |
| SMS Inbox repo/confirm | `app/lib/features/inbox/data/sms_repository.dart` |
| Quick Entry UI | `app/lib/features/entry/quick_entry_sheet.dart` |
| Payee/account/category memory | `app/lib/features/entry/entry_memory.dart` |
| Category emoji helpers | `app/lib/features/categories/category_visuals.dart` |
| Activity rows | `app/lib/features/transactions/transactions_screen.dart` |
| Timed snackbar helper | `app/lib/core/snackbars.dart` |
| Sync client | `app/lib/sync/sync_service.dart` |
| Remote applier | `app/lib/sync/remote_applier.dart` |
| Drizzle schema | `pi-server/src/db/schema.ts` |
| New server route | `pi-server/src/routes/<resource>.ts`, then mount in `app.ts` |
| Change log helper | `pi-server/src/repos/changelog.ts` |
| LLM HTTP helper | `pi-server/src/llm/client.ts` |
| SMS parser prompt | `pi-server/src/ai/sms_parser.ts` |
| QuickEntry parser prompt | `pi-server/src/ai/quick_entry_parser.ts` |
| Feedback route | `pi-server/src/routes/feedback.ts` |
| Config/env | `pi-server/src/config.ts` |
| Just recipes | `Justfile` |

## Conventions

- **Money:** integer minor units everywhere. Never decimal-string math.
- **IDs:** UUID text. Clients generate; server accepts/stores.
- **Dates:** `YYYY-MM-DD` text. Timestamps are epoch ms integers.
- **Server writes:** mutations to financial rows must call `recordChange(db,
  resource, id, op, payload)` so sync clients can pull them.
- **SQLite:** `better-sqlite3` and Drizzle better-sqlite3 are synchronous. Do not
  add `await` to `db.select().get()` style calls.
- **Sync conflicts:** last-write-wins by `updatedAt`.
- **Snackbars:** all app snackbars must use `showTimedSnackBar`; do not call
  `ScaffoldMessenger.showSnackBar` directly outside that helper.
- **AI routes:** `/v1/ai/*` are draft-only and must not mutate financial rows.
  `/v1/messages` is the agent path that may write transactions.
- **Feedback events:** append-only diagnostics, not part of financial sync. Store
  JSON payload in `feedback_events`; no change-log row required.

## Commands

### App

```bash
just format
just analyze
just test
just gate
just apk
just install
just clear-data
just launch
just logcat
```

Focused tests used often:

```bash
cd app
flutter test test/data/sms/sms_pipeline_test.dart \
  test/features/entry/ai_extractor_test.dart \
  test/features/onboarding/onboarding_flow_test.dart
```

### pi-server

```bash
cd pi-server
npm install
npm run db:generate
npm run dev
npm run start
npm run typecheck
npm test
GULLAK_DB_PATH=/path/gullak.db npm run start
```

### Release

```bash
just apk
git tag v0.1.0
git push origin main v0.1.0
tea release create --repo mr-karan/gullak --tag v0.1.0 --title "Gullak 0.1.0" --note-file CHANGELOG.md --asset app/dist/gullak-latest.apk
```

## Sync model

- Every Drift mutation writes a local `change_log` row with `clientChangeId`.
- `SyncService.pushPending` POSTs batches to `/v1/sync/push`.
- Server applies data table changes and appends server `change_log` entries in
  one transaction. Unique `(client_id, client_change_id)` makes retries
  idempotent.
- `SyncService.pullChanges` pages `/v1/sync/changes` and applies via
  `RemoteApplier`, bypassing repos so it does not recurse into local changelog.
- `syncOnce`: push → pull → prune synced log rows older than 14 days.
- Server filters rows originated by the requesting `clientId`.

## AI / SMS architecture

All LLM work runs on pi-server. The app posts over its sync URL/API key:

- `POST /v1/ai/sms/parse` — classifier-positive bank SMS → `SmsCandidate`.
- `POST /v1/ai/quick-entry/parse` — text or receipt image → parsed expense.
- `POST /v1/messages` — multi-turn assistant.
- `POST /v1/whatsapp/webhook` — WhatsApp bridge inbound events.
- `POST /v1/feedback` — user-submitted parser/app diagnostics.

SMS category resolution order:

1. learned payee→category mapping from app prefs,
2. LLM-returned category hint,
3. deterministic merchant fallback if it matches an existing category,
4. `null` / Unknown.

Important SMS rescan behavior: old failed rows can be stuck by Android SMS id
dedupe. `retryFailedBackfill()` deletes retryable `sms_messages` statuses
(`error`, `none`, `duplicate`) and clears `sms_parse_cache` before backfill so
fixed parser versions actually reparse old SMS.

## Fresh-start reset

Server DB reset: back up first, stop/remove DB/WAL/SHM, restart the stack so
migrations recreate an empty DB. Do not remove `whatsapp.db` unless explicitly
resetting WhatsApp pairing.

Android app state reset: `just clear-data` (`adb shell pm clear dev.mrkaran.gullak`).

## Outstanding work

- Foreground/post-mutation auto-sync triggers; today sync is manual.
- Server-side AI rate caps, request timeout budgets, and image-size limits.
- Richer feedback triage UI; currently `GET /v1/feedback` returns recent events.

## Removed surfaces (do not resurrect)

- Python FastAPI app and Paisa integration.
- Old TypeScript ledger-cli plumbing (`src/ledger/`, `src/state/`, `src/recap/`,
  `src/evals/`, `src/cli/`).
- Express + tsx server; replaced by Hono + Bun.
- `data/main.ledger`, `pi-state.json`; replaced by SQLite.
- Old Vite UI, Rust rewrites, `flake.nix`, `.envrc`, `docs/architecture.md`.
