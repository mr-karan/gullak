# Export destinations

The pi-server can mirror categorised activity *out* to external, write-only
targets. Google Sheets is the first such **destination**; Actual Budget is the
next. This is the generalisation of the old Sheets-only export ("pushes") into
one pluggable abstraction.

> Principle: **if a transaction exists in SQLite it should exist in every
> enabled destination.** Nothing is dropped on a category we don't recognise —
> it's pushed with a blank/uncategorised marker for the user to sort at the
> destination. Only structural non-expenses (transfer legs, split children) and
> income (positive amounts) are withheld, and those are explained below.

## The model

```ts
// A neutral, target-free view of one exportable expense (src/destinations/types.ts)
interface CanonicalExpense {
  date: string;            // YYYY-MM-DD
  description: string;     // merchant/payee, bank boilerplate stripped
  category: string | null; // raw Chavanni category; the destination maps it
  amountMinor: number;     // positive magnitude (paise)
  isOutflow: boolean;
  accountKind: string | null;
  notes: string | null;
  tags: string[];
  sourceId: string;        // Chavanni txn id — the idempotency/upsert key
}

interface Destination {
  readonly name: string;           // "sheets" | "actual"
  isEnabled(): boolean;            // opt-in via config; never runs otherwise
  export(rows: CanonicalExpense[], opts: { replace: boolean }): Promise<{ sent; skipped }>;
}
```

- `collectExpenses(db, since)` (src/destinations/collect.ts) builds the
  `CanonicalExpense[]` once — the query, the transfer/split skip, and neutral
  cleaning live here, shared by every destination.
- Each destination maps a `CanonicalExpense` onto its own schema and upserts by
  `sourceId`, so re-running is idempotent (no duplicates).

### What's collected

Only **debits** (`amountMinor` of a negative txn) that are **not** transfer legs
(`transferAccountId`) or split children (`parentId`). Transfer legs move money
between the owner's own accounts; split children are the same money as their
exported parent. Income/credits are withheld because the current sheet schema
writes amounts as positive magnitudes with no income/expense sign — surfacing
them would read as expenses. (A future destination with a signed/typed amount
column can lift this.)

## Destinations

### Sheets (`src/destinations/sheets.ts`) — shipping

Posts rows to a bound Apps Script web app (no service account). Opt-in:

| Env | Meaning |
| --- | --- |
| `CHAVANNI_SHEETS_WEBAPP_URL` | Apps Script `/exec` URL |
| `CHAVANNI_SHEETS_SECRET` | Shared secret; must equal the `CHAVANNI_SECRET` script property |
| `CHAVANNI_SHEETS_SYNC_INTERVAL_MIN` | Periodic cadence; 0 = only after each `/v1/sync/push` |

Endpoint: `POST /v1/sheets/sync[?replace=true]`. The Apps Script upserts by the
hidden `chavanni_id` column; `replace=true` clears + rewrites (preserving manual,
id-less rows). Soft failures (`{error}` on HTTP 200) are detected and abort the
cursor advance so nothing is silently lost.

### Actual Budget (`src/destinations/actual.ts`) — shipping (opt-in)

Adapter over the official `@actual-app/api` (init → `downloadBudget(syncId)` →
`importTransactions` → `sync`), keyed on `imported_id = sourceId` for
idempotency. Amounts already match Actual (integer minor units, outflow
negative). Enabled when SERVER_URL + PASSWORD + SYNC_ID are all set:

| Env | Meaning |
| --- | --- |
| `CHAVANNI_ACTUAL_SERVER_URL` | e.g. `https://budget.example.com` |
| `CHAVANNI_ACTUAL_PASSWORD` | Actual server login password (UI-set; not derivable) |
| `CHAVANNI_ACTUAL_SYNC_ID` | the budget file's Sync ID |
| `CHAVANNI_ACTUAL_ACCOUNT_ID` | account to import into; defaults to the first account |
| `CHAVANNI_ACTUAL_DATA_DIR` | local budget cache dir; defaults to `<data>/.actual-cache` |

Runtime note: `@actual-app/api` pulls `better-sqlite3` (native). It is a regular
dependency and runs in-process. The server runs on **Node**, which loads that
native module fine; Bun cannot (bun#4290 — `ERR_DLOPEN_FAILED`), which is the
reason the server was migrated off Bun. It is still imported lazily (only when
the destination actually runs) to keep startup lean.

Concurrency: `@actual-app/api` syncs from a single on-disk budget cache, so only
one Actual export runs at a time. Since the post-push hook is fire-and-forget, a
run that arrives while another is in flight throws (recorded as a failure, not a
cursor advance) and the next push retries the still-pending rows.

## Per-destination state (`export_state`)

Each destination keeps its own high-water cursor (`updatedAt`), so one being
down or back-filling doesn't stall another. The generic runner
(`runExport(db, config, { target?, replace })`) loads each enabled
destination's cursor, collects the changed rows, exports, and advances that
destination's cursor only on success — recording the error otherwise.

## Consistency note (Sheet as a writer)

Edits made directly in the Sheet are **not** part of the change-log/`updatedAt`
sync. To pull them back, an import must go through the server's normal write
path (`recordChange` + a fresh `updatedAt`, keyed by `chavanni_id`) so the phone
pulls them — never a raw write that bypasses the change log.
