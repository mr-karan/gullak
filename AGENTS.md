# Gullak — Agent Knowledge Base

Local-first mobile expense tracker with an optional self-hosted sync server. Three components live in this repo:

- **`app/`** — Flutter app (Android + iOS). Drift/SQLite on-device is the source of truth. Sub-3-second logging is the point.
- **`pi-server/`** — Bun + Hono + Drizzle + bun:sqlite HTTP API. Cross-device merge point for the app + the WhatsApp bridge.
- **`whatsapp-bridge/`** — Baileys WhatsApp socket on Bun. Posts inbound messages to `pi-server`'s `/v1/whatsapp/webhook`. Auth state and per-process caches (LID→phone, group metadata) live in a single SQLite file (`store.js`).

## Layout

```
gullak/
├── app/                     # Flutter app — work here for UI / Drift
├── pi-server/               # Bun + Hono + Drizzle (the API)
│   ├── src/
│   │   ├── db/schema.ts     # Drizzle schema mirroring Drift tables
│   │   ├── db/index.ts      # bun:sqlite + Drizzle instance
│   │   ├── routes/          # Hono routers per resource
│   │   ├── repos/changelog.ts
│   │   ├── app.ts           # Hono app factory + auth middleware
│   │   ├── config.ts
│   │   └── index.ts         # Bun.serve entrypoint
│   └── drizzle/             # Generated SQL migrations
├── whatsapp-bridge/         # Baileys bridge
└── Justfile
```

`data/gullak.db` is the pi-server's persistence (gitignored). Set `GULLAK_DB_PATH` to override.

## pi-server endpoints

```
GET    /v1/health
GET    /v1/accounts            POST/PATCH/DELETE /v1/accounts(/:id)
GET    /v1/category-groups     POST/PATCH/DELETE /v1/category-groups(/:id)
GET    /v1/categories          POST/PATCH/DELETE /v1/categories(/:id)
GET    /v1/payees              POST/PATCH/DELETE /v1/payees(/:id)
GET    /v1/transactions        POST/PATCH/DELETE /v1/transactions(/:id)
GET    /v1/budgets             POST/PATCH/DELETE /v1/budgets(/:id)
GET    /v1/recurrences         POST/PATCH/DELETE /v1/recurrences(/:id)
GET    /v1/summary?startDate=&endDate=&accountId=
GET    /v1/sync/changes?since=<id>&limit=<n>
POST   /v1/sync/push           # client batch push of mutations
POST   /v1/messages            # natural-language → agent (STUB; pending rewrite)
POST   /v1/whatsapp/webhook    # bridge inbound (STUB; pending rewrite)
```

Auth: `x-api-key` header. `/v1/health` and `/v1/whatsapp/webhook` exempt. Set `GULLAK_HTTP_API_KEY` to enable.

## Where to look

| Task | File |
|------|------|
| Drizzle schema | `pi-server/src/db/schema.ts` |
| New endpoint | `pi-server/src/routes/<resource>.ts`, register in `app.ts` |
| Change log helper | `pi-server/src/repos/changelog.ts` |
| Config / env | `pi-server/src/config.ts` |
| Flutter Drift schema | `app/lib/data/db/tables.dart` |
| Flutter LLM client | `app/lib/data/ai/llm_client.dart` |
| Flutter onboarding | `app/lib/features/onboarding/onboarding_flow.dart` |
| Reactive prefs helpers | `app/lib/state/providers.dart` (`watchPrefs`, `bumpPrefs`) |
| Justfile recipes | `/Justfile` |

## Conventions

- **Money**: integer minor units, both server and client. Never decimal-string math.
- **IDs**: UUIDs (text). Clients generate; server accepts and stores. `crypto.randomUUID()` on both sides.
- **Dates**: `YYYY-MM-DD` text columns. Timestamps are ms since epoch (sqlite int).
- **Mutations** must call `recordChange(db, resource, id, op, payload)` so the change log captures every server-side write — this is what sync clients pull.
- **bun:sqlite** is sync. Drizzle's bun-sqlite driver is sync. No `await` on `db.select().get()`.
- **Conflict policy** (sync): last-write-wins by `updatedAt`. Fine for one-or-two-person personal use.

## Just recipes (mobile side; same as before)

`just gate`, `just install`, `just launch`, `just logcat`, `just clear-data`, `just devices`, `just apk`, `just ipa`, `just testflight`, `just bump-build`, `just android-smoke`, `just pixel-acceptance`, `just ai-acceptance`.

## pi-server commands

```bash
cd pi-server
bun install
bun run db:generate                          # regenerate migrations from schema
bun run dev                                  # hot-reload server on :8787
bun run start                                # plain run
bun test                                     # bun's built-in test runner
GULLAK_DB_PATH=/path/gullak.db bun run start
```

## Sync model

Local-first. The Flutter app's Drift DB is the source of truth on-device; the homelab pi-server's SQLite is the cross-device merge point. Both schemas are 1:1 mirrors.

- Every Drift mutation (account, category, payee, transaction, budget, recurrence) writes a row into a local `change_log` table via `ChangeLogWriter`. Each row has a UUID `clientChangeId`.
- `SyncService.pushPending` batches unsynced rows and POSTs them to `/v1/sync/push`. Server applies upserts/deletes to its data tables AND appends to its own change log inside one transaction. The unique index on `(client_id, client_change_id)` makes retries idempotent.
- `SyncService.pullChanges` pages through `GET /v1/sync/changes?since=&clientId=` and feeds each change into `RemoteApplier`, which does LWW per row by `updatedAt` directly against Drift (bypassing repos so it doesn't recurse into the local change log).
- `SyncService.syncOnce`: push → pull → prune (drops synced log rows older than 14 days).
- The server filters out rows originated by the requesting `clientId` so clients don't echo their own mutations back.
- Conflict policy: last-write-wins. Fine for single-user-with-spouse personal use.

## Outstanding work

- **Agent rewrite**: `/v1/messages` and `/v1/whatsapp/webhook` are stubs returning 501. The pi-sdk `Agent` loop + Zod-typed tools + SQL writes need to be reimplemented; the old TS version was too coupled to ledger-cli to port directly.
- **Auto-sync triggers**: today sync runs only when the user taps Settings → Sync now. Foreground + post-mutation triggers are a follow-up.
- **Photo → expense flow**: vision-capable LLM call from QuickEntry; Android share-target wiring so Gullak appears in the Share menu for images.

## Removed surfaces (don't go looking)

- Python FastAPI app and Paisa integration
- TypeScript pi-server's ledger-cli plumbing (`src/ledger/`, `src/state/`, `src/recap/`, `src/evals/`, `src/cli/`)
- Express + tsx; replaced by Hono + Bun
- `data/main.ledger`, `pi-state.json` — replaced by `data/gullak.db`
- Old Vite UI, Rust rewrites, `flake.nix`, `.envrc`, `docs/architecture.md`
