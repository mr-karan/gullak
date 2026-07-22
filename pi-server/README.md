# Gullak pi-server

The self-hosted sync + AI server for [Gullak](../README.md). The phone app is the
source of truth; this server is the merge point for sync, the trusted home for
model credentials, and the runtime for SMS/quick-entry extraction, the multi-turn
agent, and exports to external destinations (Google Sheets, Actual Budget).

Stack: **Node + Hono + Drizzle + better-sqlite3**, run with `tsx`. (Node
specifically — the Actual Budget client needs the native `better-sqlite3`, which
Bun cannot load.)

## Quick start

```bash
cp .env.example .env            # all vars optional for local dev
npm install
npm run dev                     # http://127.0.0.1:8787 (migrations run on boot)
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | hot-reload server (`tsx watch`) |
| `npm run start` | production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | run the suite (vitest) |
| `npm run db:generate` | generate a Drizzle migration from schema changes |
| `npm run db:migrate` | apply migrations (also runs automatically on boot) |

## Endpoints

```
GET    /v1/health                       (no auth)
GET/POST/PATCH/DELETE  /v1/accounts /v1/category-groups /v1/categories
                       /v1/payees /v1/transactions /v1/budgets /v1/recurrences
GET    /v1/summary?startDate=&endDate=&accountId=
GET    /v1/sync/v2/capabilities                     POST /v1/sync/v2/register
GET    /v1/sync/v2/bootstrap /changes               POST /v1/sync/v2/push /ack
POST   /v1/messages                     (agent; may write transactions)
POST   /v1/whatsapp/webhook             (no auth; bridge → server)
POST   /v1/ai/sms/parse                 (draft-only; 503 if no model key)
POST   /v1/ai/quick-entry/parse         (draft-only)
POST   /v1/sheets/sync[?replace=true]   GET /v1/sheets/status
POST   /v1/export[?target=&replace=]    (fan out to enabled destinations)
POST   /v1/feedback                     GET /v1/feedback?limit=
```

Auth: send `x-api-key: <GULLAK_HTTP_API_KEY>`. `/v1/health` and
`/v1/whatsapp/webhook` are exempt. Set `GULLAK_REQUIRE_AUTH=true` to refuse
booting without a key. Request bodies are capped (15 MB); `/v1/ai/*` returns 503
when no real model key is configured.

## Configuration

See [`.env.example`](.env.example) for the full, annotated list: storage
(`GULLAK_DB_PATH`), auth (`GULLAK_HTTP_API_KEY`, `GULLAK_REQUIRE_AUTH`), model
(`GULLAK_MODEL_*` + `GULLAK_ALLOW_AMBIENT_MODEL_KEYS`), WhatsApp, and the opt-in
exports (Google Sheets + Actual Budget).

## Sync model

Every command authors an immutable causal event containing only the fields it
changed. Replicas merge the same event union into per-field multi-value
registers; Lamport/actor/sequence ordering chooses a deterministic visible value
only for concurrent candidates. Wall clocks never decide correctness. Event
dots make retries idempotent, checkpoints provide verified bootstrap/recovery,
and malformed events are quarantined explicitly. See
[../docs/sync-crdt-v2.md](../docs/sync-crdt-v2.md).

## Exports (destinations)

Categorised activity can be mirrored out to external targets — opt-in, write-only,
and idempotent (each row keyed by its id so re-runs upsert rather than duplicate).
Enabled destinations fan out after each sync push. Google Sheets and Actual Budget
ship today; see [../docs/destinations.md](../docs/destinations.md).
