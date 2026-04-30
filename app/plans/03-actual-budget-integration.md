# 03 — Actual Budget integration

## The wire

We do not implement Actual's CRDT sync protocol. We talk to **`actual-http-api`**
([github.com/jhonderson/actual-http-api](https://github.com/jhonderson/actual-http-api)),
a community-maintained Docker image that wraps `@actual-app/api` behind a
REST surface.

Topology:
```
[ Flutter app ] --HTTPS--> [ actual-http-api :5007 ] --node--> [ actual-server :5006 ]
```

The user runs both containers (we ship a `docker-compose.yml` template).
Path of least resistance for self-hosters.

## Auth

- Header: `x-api-key: <API_KEY>`
- `API_KEY` is a secret the user generates when they deploy `actual-http-api`.
- `actual-http-api` itself holds the Actual server password; the phone never
  sees it.
- For E2EE-encrypted budgets, `budgetEncryptionPassword` query param is
  required on every call. Out of scope for v1.

## Endpoint surface (v1, what we use)

All paths are prefixed with `/v1`. `:budgetSyncId` is the cloud ID of the
chosen budget (we capture it during onboarding).

### Discovery

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/budgets` | List available budgets. Returns name + syncId. |

### Accounts

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/budgets/:budgetSyncId/accounts` | All accounts |
| GET | `/v1/budgets/:budgetSyncId/accounts/:accountId/balance` | Cleared balance |
| POST | `/v1/budgets/:budgetSyncId/accounts` | Create (rare; out of v1) |

### Categories & groups

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/budgets/:budgetSyncId/categorygroups` | Groups, with nested categories |
| GET | `/v1/budgets/:budgetSyncId/categories` | Flat list |

### Payees

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/budgets/:budgetSyncId/payees` | All payees |
| POST | `/v1/budgets/:budgetSyncId/payees` | Create payee |

### Transactions

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/budgets/:budgetSyncId/accounts/:accountId/transactions?since_date=YYYY-MM-DD&until_date=YYYY-MM-DD&page=N&limit=M` | Paginated list |
| POST | `/v1/budgets/:budgetSyncId/accounts/:accountId/transactions` | Create one |
| POST | `/v1/budgets/:budgetSyncId/accounts/:accountId/transactions/batch` | Create many (no reconcile) |
| POST | `/v1/budgets/:budgetSyncId/accounts/:accountId/transactions/import` | Create many (with import-side reconcile via `imported_id`) |
| PATCH | `/v1/budgets/:budgetSyncId/transactions/:transactionId` | Update |
| DELETE | `/v1/budgets/:budgetSyncId/transactions/:transactionId` | Delete |

### Months (read-only for home dashboard)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/budgets/:budgetSyncId/months` | All months |
| GET | `/v1/budgets/:budgetSyncId/months/:month` | One month detail |

## Transaction shape (Actual)

Posting body for create:
```json
{
  "transaction": {
    "account": "729cb492-...",
    "category": "9fa2550c-...",
    "amount": -7374,
    "payee_name": "Blinkit",
    "date": "2026-04-30",
    "notes": "groceries",
    "imported_id": "gullak:<client_uuid>",
    "cleared": false
  },
  "learnCategories": false,
  "runTransfers": false
}
```

Field rules:
- `amount` is integer minor units, **negative for spend, positive for
  income**. ₹450 spend = `-45000` (Actual stores 4 minor digits for INR via
  the budget config? — actually Actual uses 2 digits for most currencies; we
  read the budget's currency setting at onboarding and store the multiplier).
- `payee_name` (string) auto-creates the payee if `payee` (UUID) is
  missing. We use this on the first occurrence of a free-text payee, then
  prefer `payee` UUID after we have learnt it.
- `imported_id` is **our dedupe key on the Actual side**. We always set it
  to `gullak:<uuid>` so re-pushes are idempotent (when using `/import`).
- `cleared: false` for SMS-derived (we do not yet know if the bank actually
  posted vs auth-only). Flip to true after manual review.

## Currency and minor units

`actual-http-api` does not surface currency on the budget endpoint reliably.
We default to 2 minor digits and let the user override in settings. INR
(₹450 → `45000`), USD ($120.30 → `12030`).

## Pagination

`since_date` is required. `page` and `limit` together. We pull in 200-row
pages. Initial backfill on onboarding: last 90 days.

## Error envelope

- 401 / 403 → bad API key, surface "Server credentials look wrong" and
  bounce to settings.
- 404 → unknown budget / account / transaction. For PATCH on a missing
  transaction, drop the queue entry and log.
- 5xx → backoff and retry (network or `actual-http-api` itself is down).

## Setup that the user does once

We document (and link from onboarding):

```yaml
# docker-compose.yml that the user runs alongside Actual server
services:
  actual-server:
    image: actualbudget/actual-server:latest
    ports: ["5006:5006"]
    volumes: ["./actual-data:/data"]
  actual-http-api:
    image: jhonderson/actual-http-api:latest
    ports: ["5007:5007"]
    environment:
      ACTUAL_SERVER_URL: "http://actual-server:5006"
      ACTUAL_SERVER_PASSWORD: "<server password>"
      API_KEY: "<random 32-byte key>"
    depends_on: [actual-server]
```

The phone connects to `https://actualapi.<your-domain>` (user is responsible
for TLS). For local testing, `http://192.168.x.x:5007`.

## Existing Python tooling (sister projects)

The user already maintains two Python projects that talk to the same Actual
server (`https://budget.mrkaran.dev`, budget `AllFinances`):

- **`~/Code/actual-api/`** — declarative bootstrap of accounts and
  categories from YAML, plus CSV importers (Amex, Zerodha MF, SBI Loan).
  Built on [`actualpy`](https://github.com/bvanelli/actualpy).
- **`~/Code/actual-agent/`** — interactive Claude-powered CLI for natural-
  language ops on the budget. Also uses `actualpy`.

Neither exposes an HTTP server, so they don't replace `actual-http-api` for
our use. They DO, however:

1. Confirm the user already self-hosts Actual and trusts Python + `actualpy`.
2. Provide a ready-made bootstrap path (`bootstrap_accounts.py`,
   `setup_budget.py`) that the user can run before installing Gullak. We
   link to it from onboarding.
3. Suggest a swap-out option for v2: replace `actual-http-api` Docker with
   a thin FastAPI server inside `actual-api/` that wraps `actualpy`. The
   Flutter `ActualClient` is already abstracted enough to make this
   transparent.

For v1 we still ship with `actual-http-api` Docker. Less code to write, and
the JS path is the official-est one Actual supports.

## Out-of-scope for v1

- Rules, schedules, notes, tags, bank-sync — we read enough to populate
  pickers (categories, payees) and write transactions. Everything else is
  managed in the Actual web UI.
- Multi-budget switching at runtime.
- E2EE budgets.
