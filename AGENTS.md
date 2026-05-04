# Gullak — Agent Knowledge Base

Local-first mobile expense tracker with an optional self-hosted sync server. Three components live in this repo:

- **`app/`** — Flutter app (Android + iOS). Drift/SQLite on-device is the source of truth. Sub-3-second logging is the point.
- **`pi-server/`** — Bun + Hono + Drizzle + bun:sqlite HTTP API. Cross-device merge point for the app + the WhatsApp bridge.
- **`whatsapp-bridge/`** — Baileys WhatsApp socket on Bun. Posts inbound messages to `pi-server`'s `/v1/whatsapp/webhook`. (SQLite-backed auth state — pending.)

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

## Outstanding work (not yet wired in this checkpoint)

- **Agent rewrite**: `/v1/messages` and `/v1/whatsapp/webhook` are stubs returning 501. The pi-sdk `Agent` loop + Zod-typed tools + SQL writes need to be reimplemented (the old TS version was too coupled to ledger-cli to port directly).
- **whatsapp-bridge SQLite**: still uses `useMultiFileAuthState` on disk. Should move to a SQLite-backed `AuthenticationState` for consistency.
- **Flutter sync layer**: `Settings → Sync` (Base URL + API key) + a `SyncService` that maintains a Drift `change_log` table, pushes to `/v1/sync/push` after every mutation, and pulls `/v1/sync/changes?since=<cursor>` on foreground.
- **Dockerfiles + docker-compose**: pi-server Dockerfile is still the old `node:20`/`pnpm` shape; switch to `oven/bun`. Bridge Dockerfile already on Bun, just verify.

## Removed surfaces (don't go looking)

- Python FastAPI app and Paisa integration
- TypeScript pi-server's ledger-cli plumbing (`src/ledger/`, `src/state/`, `src/recap/`, `src/evals/`, `src/cli/`)
- Express + tsx; replaced by Hono + Bun
- `data/main.ledger`, `pi-state.json` — replaced by `data/gullak.db`
- Old Vite UI, Rust rewrites, `flake.nix`, `.envrc`, `docs/architecture.md`
