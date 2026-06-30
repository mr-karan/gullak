# Gullak pi-server

The self-hosted sync + AI server for [Gullak](../README.md). The phone app is
the source of truth; this server is the merge point for sync, the trusted place
to hold model credentials, and the runtime for SMS/quick-entry extraction, the
multi-turn agent, and exports to external destinations (Google Sheets, …).

Stack: **Bun + Hono + Drizzle + bun:sqlite**.

## Quick start

```bash
cp .env.example .env            # adjust as needed (all vars optional for local dev)
bun install
bun run db:migrate              # apply migrations (also runs automatically on boot)
bun run dev                     # http://127.0.0.1:8787
```

## Scripts

| Command | Purpose |
|---------|---------|
| `bun run dev` | hot-reload server |
| `bun run start` | production server |
| `bun run typecheck` | `tsc --noEmit` |
| `bun test` | run the test suite |
| `bun run db:generate` | generate a Drizzle migration from schema changes |
| `bun run db:migrate` | apply migrations |

## Endpoints

```
GET    /v1/health                       (no auth)
GET/POST/PATCH/DELETE  /v1/accounts /v1/category-groups /v1/categories
                       /v1/payees /v1/transactions /v1/budgets /v1/recurrences
GET    /v1/summary?startDate=&endDate=&accountId=
GET    /v1/sync/changes?since=&limit=&clientId=
POST   /v1/sync/push
POST   /v1/messages                     (agent; may write transactions)
POST   /v1/whatsapp/webhook             (no auth; bridge → server)
POST   /v1/ai/sms/parse                 (draft-only; 503 if no model key)
POST   /v1/ai/quick-entry/parse         (draft-only)
POST   /v1/sheets/sync[?replace=true]   (export to the Sheets destination)
GET    /v1/sheets/status
POST   /v1/feedback                     GET /v1/feedback?limit=
```

Auth: send `x-api-key: <GULLAK_HTTP_API_KEY>`. `/v1/health` and
`/v1/whatsapp/webhook` are exempt. Set `GULLAK_REQUIRE_AUTH=true` to refuse
booting without a key. Request bodies are capped (15 MB); `/v1/ai/*` returns 503
when no real model key is configured.

## Configuration

See [`.env.example`](.env.example) for the full, annotated list. Highlights:
storage (`GULLAK_DB_PATH`), auth (`GULLAK_HTTP_API_KEY`, `GULLAK_REQUIRE_AUTH`),
model (`GULLAK_MODEL_*` + `GULLAK_ALLOW_AMBIENT_MODEL_KEYS`), WhatsApp, and the
opt-in Google Sheets export (`GULLAK_SHEETS_WEBAPP_URL` + `GULLAK_SHEETS_SECRET`).

## Sync model

Last-write-wins by `updatedAt`, enforced in SQL on push (an upsert wins only
when `incoming.updated_at >= stored`; a delete only when its tombstone does).
Retries are idempotent via a unique `(client_id, client_change_id)`. The app
pushes its local change-log, then pulls server changes (filtering out its own)
and applies them. See the root README for the end-to-end picture.

## Exports (destinations)

Categorised activity can be mirrored out to external targets. Google Sheets is
the first destination (via a bound Apps Script web app); it's **opt-in** —
nothing is sent unless `GULLAK_SHEETS_WEBAPP_URL` + `GULLAK_SHEETS_SECRET` are
set. The export pushes every transaction keyed by its id so re-runs upsert
rather than duplicate.
