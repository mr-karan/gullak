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
  category: string | null; // raw Gullak category; the destination maps it
  amountMinor: number;     // positive magnitude (paise)
  isOutflow: boolean;
  accountKind: string | null;
  notes: string | null;
  tags: string[];
  sourceId: string;        // Gullak txn id — the idempotency/upsert key
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
| `GULLAK_SHEETS_WEBAPP_URL` | Apps Script `/exec` URL |
| `GULLAK_SHEETS_SECRET` | Shared secret; must equal the `GULLAK_SECRET` script property |
| `GULLAK_SHEETS_SYNC_INTERVAL_MIN` | Periodic cadence; 0 = only after each `/v1/sync/push` |

Endpoint: `POST /v1/sheets/sync[?replace=true]`. The Apps Script upserts by the
hidden `gullak_id` column; `replace=true` clears + rewrites (preserving manual,
id-less rows). Soft failures (`{error}` on HTTP 200) are detected and abort the
cursor advance so nothing is silently lost.

### Actual Budget (`src/destinations/actual.ts`) — built (opt-in, gated)

Adapter over the official `@actual-app/api` (init → `downloadBudget(syncId)` →
`importTransactions` → `sync`), keyed on `imported_id = sourceId` for
idempotency. Amounts already match Actual (integer minor units, outflow
negative). Config (planned):

| Env | Meaning |
| --- | --- |
| `GULLAK_ACTUAL_SERVER_URL` | e.g. `https://budget.example.com` |
| `GULLAK_ACTUAL_PASSWORD` | Actual server login password (UI-set; not derivable) |
| `GULLAK_ACTUAL_SYNC_ID` | the budget file's Sync ID |

Runtime note: `@actual-app/api` pulls `better-sqlite3` (native). If it doesn't
build under the Bun image it runs as a small Node sidecar the server calls,
rather than risking the main runtime.

## Per-destination state (`export_state`)

Each destination keeps its own high-water cursor (`updatedAt`), so one being
down or back-filling doesn't stall another. The generic runner
(`runExport(db, config, { target?, replace })`) loads each enabled
destination's cursor, collects the changed rows, exports, and advances that
destination's cursor only on success — recording the error otherwise.

## Consistency note (Sheet as a writer)

Edits made directly in the Sheet are **not** part of the change-log/`updatedAt`
sync. To pull them back, an import must go through the server's normal write
path (`recordChange` + a fresh `updatedAt`, keyed by `gullak_id`) so the phone
pulls them — never a raw write that bypasses the change log.
