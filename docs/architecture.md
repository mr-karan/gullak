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
An HTTP API run with `tsx`. It mirrors the app's schema, stores the immutable
causal event journal, runs LLM extraction and the multi-turn agent, and pushes categorised
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
| Conflicts | Causal per-field multi-value registers; deterministic projection of concurrent candidates. |

The Drift schema (`app/lib/data/db/tables.dart`) and the Drizzle schema
(`pi-server/src/db/schema.ts`) are deliberate mirrors of each other.

## Sync model

Bidirectional, append-only, and idempotent. The immutable event set is the
replicated authority; relational rows are a materialized projection.

1. `SyncWriter.command` commits the local row changes and one event containing
   only the fields that action changed in the same Drift transaction.
2. `SyncService` registers an authenticated actor, bootstraps from a verified
   checkpoint when necessary, and pushes exact event dots `(actorId, sequence)`.
3. The server validates and folds events into causal per-field registers,
   materializes affected rows, and advances frontiers in one SQLite transaction.
4. Pull pages exchange immutable events. Duplicate delivery and echoes are
   idempotent; malformed events are quarantined and surfaced without wedging the
   cursor.
5. Acknowledgements contain the exact cursor and causal frontier. A pruned or
   invalid cursor requires checkpoint bootstrap rather than guessing.

Different-field concurrent edits both survive. Same-field concurrent candidates
are retained; Lamport/actor/sequence ordering selects one visible projection on
every replica. Wall-clock timestamps are audit metadata only.

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
| Sync client / CRDT fold | `app/lib/sync/` |
| Drizzle schema | `pi-server/src/db/schema.ts` |
| HTTP routers (one per resource) | `pi-server/src/routes/` |
| Command/event boundary | `pi-server/src/repos/changelog.ts` |
| LLM extraction prompts | `pi-server/src/ai/` |
| Multi-turn agent | `pi-server/src/agent/` |
| Export destinations | `pi-server/src/destinations/` |
