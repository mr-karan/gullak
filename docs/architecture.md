# Architecture

Three components. The phone is authoritative; the server is a merge point and
the home for AI credentials; the WhatsApp bridge is an optional input.

```
┌────────────────────┐   HTTPS: sync + AI    ┌────────────────────────┐
│ Flutter app        │◀─────────────────────▶│ pi-server              │
│ Drift + SQLite     │                       │ Node + Hono + Drizzle  │
│ source of truth    │                       │ better-sqlite3         │
└────────────────────┘                       └───────┬────────┬───────┘
                                          webhook     │        │  export (opt-in)
                                    ┌─────────────────┘        └─────────────┐
                                    │                                        ▼
                          ┌─────────┴──────────┐              ┌──────────────────────────┐
                          │ whatsapp-bridge    │              │ destinations             │
                          │ Baileys (TS/Bun)   │              │ Google Sheets · Actual   │
                          └────────────────────┘              └──────────────────────────┘
```

## Components

### `app/` — Flutter (Android/iOS)
Riverpod for state, Drift over SQLite for storage, `go_router` for navigation.
The local database is the source of truth. Responsibilities: quick manual and
AI-assisted entry, Android SMS review, activity/reporting UI, and the sync
client (push/pull + a scheduler that runs on foreground and after mutations).

### `pi-server/` — Node + Hono + Drizzle + better-sqlite3
An HTTP API run with `tsx`. It mirrors the app's schema, stores the sync
change-log, runs LLM extraction and the multi-turn agent, and pushes categorised
activity to external destinations. It is the only place model/API credentials
live. (It runs on Node specifically because the Actual Budget client needs the
native `better-sqlite3` module.)

### `whatsapp-bridge/` — Baileys (TypeScript)
Optional. Relays inbound WhatsApp messages to `POST /v1/whatsapp/webhook`, where
they flow through the same agent as in-app messages. Pairing/session state lives
in a single local SQLite DB.

## Data model conventions

| Concern | Rule |
| --- | --- |
| Money | integer **minor units** everywhere (`₹490.00` → `49000`). Never decimal-string math. |
| IDs | UUID text, **client-generated**; the server accepts and stores them. |
| Dates | `YYYY-MM-DD` text. |
| Timestamps | epoch-ms integers. |
| Conflicts | **last-write-wins** by `updatedAt`. |

The Drift schema (`app/lib/data/db/tables.dart`) and the Drizzle schema
(`pi-server/src/db/schema.ts`) are deliberate mirrors of each other.

## Sync model

Bidirectional, additive, and idempotent. Every mutation is also an append to a
`change_log`.

1. App repositories write to Drift and append a local `change_log` row with a
   `clientChangeId`.
2. `SyncService.pushPending` batches unsynced mutations to `POST /v1/sync/push`.
3. The server applies row changes and appends server `change_log` entries in a
   single transaction. A unique `(client_id, client_change_id)` makes retries
   idempotent. Last-write-wins is enforced in SQL: an upsert wins only when
   `incoming.updated_at >= stored`; a delete only when its tombstone is newer.
4. `SyncService.pullChanges` pages `GET /v1/sync/changes` and applies remote rows
   via `RemoteApplier`, bypassing repositories so it never recurses into the
   local change-log.
5. The server filters out changes that originated from the requesting `clientId`,
   so a client never re-applies its own writes.

`syncOnce` = push → pull → prune synced log rows older than a retention window.

## SMS + AI

All LLM work runs on the server; the app holds no provider keys.

- On Android, incoming bank SMS are routed to the server and parsed by the LLM
  into draft transactions, which surface in an **Inbox** for one-tap review and
  confirmation.
- `POST /v1/ai/quick-entry/parse` turns free text or a receipt image into a
  parsed draft expense.
- `POST /v1/messages` is the multi-turn **agent** — it can book, edit, and delete
  transactions conversationally (used by both the app and the WhatsApp bridge).
- `/v1/ai/*` routes are **draft-only** and must not mutate financial rows; they
  return `503` when no model key is configured.

Category resolution for parsed SMS follows a fixed order: learned payee→category
rule → LLM-returned category → deterministic merchant fallback → uncategorised.

## Exports (destinations)

Categorised activity can be mirrored *out* to write-only external targets, opt-in
per destination. Each keeps its own high-water cursor and upserts by a stable id,
so re-runs never duplicate. The fan-out fires after each successful sync push.
Google Sheets (via a bound Apps Script web app) and Actual Budget (via the
official API) ship today. Full spec: [destinations.md](destinations.md).

## Where things live

| Area | Path |
| --- | --- |
| Drift schema / database | `app/lib/data/db/` |
| Sync client / remote applier | `app/lib/sync/` |
| Drizzle schema | `pi-server/src/db/schema.ts` |
| HTTP routers (one per resource) | `pi-server/src/routes/` |
| Change-log helper | `pi-server/src/repos/changelog.ts` |
| LLM extraction prompts | `pi-server/src/ai/` |
| Multi-turn agent | `pi-server/src/agent/` |
| Export destinations | `pi-server/src/destinations/` |
