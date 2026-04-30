# 04 — Data model

## Local DB (Drift / SQLite)

All money is integer minor units. All UUIDs are TEXT. All timestamps are
INTEGER unix ms.

### `accounts`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | local UUID |
| actual_id | TEXT UNIQUE | Actual's UUID, null until synced |
| name | TEXT NOT NULL | |
| offbudget | INTEGER NOT NULL DEFAULT 0 | bool |
| closed | INTEGER NOT NULL DEFAULT 0 | bool |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| balance_cents | INTEGER | last known cleared balance |
| updated_at | INTEGER NOT NULL | |
| sync_status | TEXT NOT NULL | enum: `synced`, `pending_push`, `failed` |
| sync_error | TEXT | last error message if failed |

### `categories`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | local UUID |
| actual_id | TEXT UNIQUE | |
| name | TEXT NOT NULL | |
| group_id | TEXT NOT NULL | FK categories.id of the group |
| is_income | INTEGER NOT NULL DEFAULT 0 | |
| hidden | INTEGER NOT NULL DEFAULT 0 | |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| updated_at | INTEGER NOT NULL | |
| sync_status | TEXT NOT NULL | |

### `category_groups`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| actual_id | TEXT UNIQUE | |
| name | TEXT NOT NULL | |
| is_income | INTEGER NOT NULL DEFAULT 0 | |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |

### `payees`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| actual_id | TEXT UNIQUE | |
| name | TEXT NOT NULL | |
| transfer_acct | TEXT | non-null for transfer payees |
| updated_at | INTEGER NOT NULL | |
| sync_status | TEXT NOT NULL | |

### `transactions`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | local UUID; also `imported_id` after `gullak:` prefix |
| actual_id | TEXT UNIQUE | server UUID, null until synced |
| account_id | TEXT NOT NULL | local FK |
| category_id | TEXT | nullable |
| payee_id | TEXT | nullable |
| payee_name | TEXT | for un-promoted payees |
| amount_cents | INTEGER NOT NULL | negative = spend |
| date | TEXT NOT NULL | YYYY-MM-DD |
| notes | TEXT | |
| cleared | INTEGER NOT NULL DEFAULT 0 | |
| origin | TEXT NOT NULL | enum: `manual`, `ai`, `sms`, `imported` |
| origin_ref | TEXT | e.g. SMS row id, AI prompt hash |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |
| deleted_at | INTEGER | tombstone for delete-then-sync |
| sync_status | TEXT NOT NULL | `synced`, `pending_push`, `pending_delete`, `failed` |
| sync_error | TEXT | |

Indexes: `(account_id, date)`, `(sync_status)`, `(actual_id)`.

### `sms_messages`
Stores everything we have ingested from the Android SMS inbox so we can
de-dupe across launches and learn parsers.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | local row id |
| android_id | TEXT UNIQUE | telephony provider id |
| address | TEXT NOT NULL | sender (e.g. `VK-HDFCBK`) |
| body | TEXT NOT NULL | |
| received_at | INTEGER NOT NULL | |
| classified_as | TEXT NOT NULL | enum: `pending`, `transactional`, `non_transactional`, `error` |
| parser_version | INTEGER | which parser regex set produced the candidate |
| candidate_json | TEXT | serialised TransactionCandidate (see below) |
| candidate_status | TEXT | enum: `none`, `inbox`, `accepted`, `dismissed`, `merged` |
| linked_transaction_id | TEXT | once accepted / merged |

Indexes: `(classified_as)`, `(received_at DESC)`, `(candidate_status)`.

### `sync_queue` (optional view, not a table)
We do not need a separate queue table. The query
`SELECT * FROM transactions WHERE sync_status IN ('pending_push','pending_delete') ORDER BY updated_at`
is the queue. Same for accounts/categories/payees if they ever mutate
locally.

### `app_state` (singleton k/v)
| Key | Value |
|---|---|
| `last_pull_cursor` | YYYY-MM-DD of the most recent pulled tx |
| `currency_minor_digits` | 2 (default) or 4 |
| `selected_budget_sync_id` | the chosen budget |
| `default_account_id` | local id of the "log to this account" default |

### `audit_log`
Append-only log of user-affecting events for support.

| Column | Type |
|---|---|
| id | INTEGER PK |
| at | INTEGER NOT NULL |
| level | TEXT NOT NULL (info/warn/error) |
| event | TEXT NOT NULL |
| payload_json | TEXT |

## Domain types (Dart, freezed)

```dart
@freezed
class TransactionDraft with _$TransactionDraft {
  const factory TransactionDraft({
    required String id,                 // client uuid
    required String accountId,
    String? categoryId,
    String? payeeId,
    String? payeeName,
    required int amountCents,           // negative = spend
    required DateTime date,
    String? notes,
    @Default(false) bool cleared,
    required TransactionOrigin origin,
    String? originRef,
  }) = _TransactionDraft;
}

enum TransactionOrigin { manual, ai, sms, imported }

@freezed
class TransactionCandidate with _$TransactionCandidate {
  const factory TransactionCandidate({
    required int amountCents,
    required DateTime date,
    String? payeeName,
    String? accountHint,                // e.g. "HDFC ****1234"
    String? notes,
    required double confidence,         // 0..1
  }) = _TransactionCandidate;
}
```

## Migrations

v1 ships `schema_version = 1`. All future changes use Drift's
`MigrationStrategy.onUpgrade` and require a test that creates v_n-1, runs
migration, asserts v_n shape.

## Currency handling

- `amount_cents` is the canonical store; UI multiplies/divides by
  `10^currency_minor_digits` for display.
- INR uses 2 digits in `actual-http-api`, not 4 — confirmed by reading
  example payloads. We default to 2 and expose an override.
