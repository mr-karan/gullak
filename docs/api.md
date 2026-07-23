# Gullak API

Base URL: `/v1`

The server publishes the route contract it is actually running:

- Browsable reference: `GET /v1/docs`
- OpenAPI 3.1 document: `GET /v1/openapi.json`

Both routes are public so a new installation can be inspected before an API key
is configured. Financial endpoints remain protected when
`GULLAK_HTTP_API_KEY` is set.

## Authentication

Send the server key on ordinary API requests:

```http
x-api-key: your-server-key
```

`GET /v1/health`, `GET /v1/openapi.json`, `GET /v1/docs`, and the configured
WhatsApp webhook are exempt. Sync v2 additionally authenticates each registered
replica with `x-sync-actor-token`; that credential is returned exactly once by
`POST /v1/sync/v2/register`.

## Conventions

- Money is an integer number of minor units. `54900` means ₹549.00 for INR.
- IDs are client-generated UUID text unless an endpoint explicitly says otherwise.
- Calendar dates are `YYYY-MM-DD`; timestamps are epoch milliseconds.
- Validation failures return HTTP 400 with an `error` and safe field-level issues.
- Retriable sync events are idempotent by their immutable actor/sequence dot.
- AI parsing endpoints return drafts. They do not mutate financial rows.

## Core ledger

```text
GET    /accounts                 POST /accounts
GET    /accounts/:id            PATCH /accounts/:id
POST   /accounts/:id/reconcile  DELETE /accounts/:id

GET    /category-groups         POST /category-groups
PATCH  /category-groups/:id     DELETE /category-groups/:id
GET    /categories              POST /categories
PATCH  /categories/:id          DELETE /categories/:id
GET    /payees                  POST /payees
PATCH  /payees/:id              DELETE /payees/:id

GET    /transactions            POST /transactions
GET    /transactions/:id        PATCH /transactions/:id
DELETE /transactions/:id
POST   /transactions/group
POST   /transactions/ungroup/:parentId
```

Transaction listing accepts `startDate`, `endDate`, `accountId`, and `limit`.
Group parents never carry money; their displayed total is derived from children.

## Budget, planning, and wealth

```text
GET    /budget/plan             POST /budget/assign
GET    /budget/targets          PUT /budget/targets/:categoryId
DELETE /budget/targets/:categoryId
GET    /budget/age-of-money

GET    /holdings                POST /holdings/import
PATCH  /holdings/:id            DELETE /holdings/:id
GET    /goals                   POST /goals
PATCH  /goals/:id               DELETE /goals/:id
GET    /desires                 POST /desires
GET    /desires/:id             PATCH /desires/:id
DELETE /desires/:id
GET    /net-worth
```

The holdings import accepts a broker workbook as multipart form data. Imported
prices are snapshots, not a live quote feed.

## Read models

```text
GET /summary
GET /calendar
GET /insights/net-worth-history
GET /insights/cash-flow
GET /insights/top-spends
GET /insights/new-payees
```

These endpoints are read-only projections. They never append sync events.

## Causal sync v2

```text
GET  /sync/v2/capabilities
POST /sync/v2/register
POST /sync/v2/push
GET  /sync/v2/changes?epoch=…&actorId=…&after=0&limit=500
GET  /sync/v2/bootstrap?actorId=…
POST /sync/v2/ack
```

The event dot `(actorId, sequence)` is immutable and unique. Pull cursors order
transport only; causal context determines whether one event observed another.
Clients below retained history install a verified checkpoint through `bootstrap`.

## AI and assistant

```text
POST /ai/sms/parse
POST /ai/sms/enrich
POST /ai/quick-entry/parse
POST /messages
POST /messages/stream
GET  /messages/threads
GET  /messages/threads/:threadId
POST /messages/action
```

`/ai/*` routes are draft-only. `/messages/action` is the reviewed mutation path.
Model credentials stay on the server.

## Example

```bash
curl -sS "http://127.0.0.1:8787/v1/transactions?limit=20" \
  -H "x-api-key: $GULLAK_HTTP_API_KEY"
```

Use the browsable reference for the complete route set running on a particular
server version. It is generated from Hono's mounted route registry, so new
routes cannot be omitted from the path index by accident.
