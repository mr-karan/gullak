# 04 — Data model

All money is integer minor units. All UUIDs are TEXT. All timestamps are
INTEGER unix ms.

## `accounts`

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | |
| kind | TEXT NOT NULL DEFAULT 'checking' | enum: checking, savings, credit_card, cash, wallet, investment, loan |
| opening_balance_cents | INTEGER NOT NULL DEFAULT 0 | signed; lets us seed an account without a synthetic transaction |
| on_budget | INTEGER NOT NULL DEFAULT 1 | bool; off-budget = tracking-only |
| archived | INTEGER NOT NULL DEFAULT 0 | bool |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |

Account balance = `opening_balance_cents + Σ amount_cents` for
non-split transactions on the account (split children are excluded —
they're already counted in the parent's amount).

## `category_groups`

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| is_income | INTEGER NOT NULL DEFAULT 0 | drives colour and ordering in pickers |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |

## `categories`

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| group_id | TEXT NOT NULL | FK |
| color | INTEGER NULL | ARGB int; UI derives one from name if null |
| icon | TEXT NULL | optional Material icon code-point name |
| hidden | INTEGER NOT NULL DEFAULT 0 | |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| updated_at | INTEGER NOT NULL | |

## `payees`

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| use_count | INTEGER NOT NULL DEFAULT 0 | drives recent-payees chip ordering |
| updated_at | INTEGER NOT NULL | |

## `transactions`

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| account_id | TEXT NOT NULL | |
| category_id | TEXT NULL | |
| payee_id | TEXT NULL | |
| payee_name | TEXT NULL | for un-promoted typed names |
| amount_cents | INTEGER NOT NULL | negative = expense, positive = income |
| date | TEXT NOT NULL | YYYY-MM-DD |
| notes | TEXT NULL | |
| cleared | INTEGER NOT NULL DEFAULT 0 | bool |
| origin | TEXT NOT NULL DEFAULT 'manual' | enum: manual, ai, sms, transfer, split, split_child, recurrence |
| origin_ref | TEXT NULL | free-form ref for the origin (e.g. SMS row id) |
| transfer_account_id | TEXT NULL | the *other* leg's account |
| transfer_group_id | TEXT NULL | shared by both legs of a transfer |
| parent_id | TEXT NULL | for split children, points to the parent row |
| split_total_cents | INTEGER NULL | only set on split parents |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |

Indexes:
- `(account_id, date)` for account-scoped lists.
- `(parent_id)` for fetching split children.
- `(transfer_group_id)` for fetching the paired leg.

### Transaction shapes

- **Normal expense / income** — `transfer_account_id` and `parent_id`
  are null. Amount sign carries the direction.
- **Transfer** — two rows, same `transfer_group_id`. Source row has
  negative amount on the source account; destination has positive.
- **Split parent** — represents the row in lists. `split_total_cents`
  set; `category_id` left null. Children have `parent_id` = parent.id;
  visible only when drilling into the parent.

## `budgets`

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| category_id | TEXT NOT NULL | FK |
| month | TEXT NOT NULL | YYYY-MM |
| target_cents | INTEGER NOT NULL | |
| rollover_cents | INTEGER NOT NULL DEFAULT 0 | leftover carried from previous month |
| updated_at | INTEGER NOT NULL | |

Unique index on `(category_id, month)`.

## `recurrences`

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| account_id | TEXT NOT NULL | |
| category_id | TEXT NULL | |
| payee_id | TEXT NULL | |
| payee_name | TEXT NULL | |
| amount_cents | INTEGER NOT NULL | |
| notes | TEXT NULL | |
| cadence | TEXT NOT NULL | enum: daily, weekly, monthly, yearly |
| next_date | TEXT NOT NULL | YYYY-MM-DD; advanced after each emission |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |

On app launch we scan rows where `next_date <= today`, materialise
transactions, and advance `next_date`.

## `sms_messages`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| android_id | TEXT NULL UNIQUE | SMS provider id |
| address | TEXT NOT NULL | sender |
| body | TEXT NOT NULL | |
| received_at | INTEGER NOT NULL | |
| classified_as | TEXT NOT NULL DEFAULT 'pending' | pending / transactional / non_transactional / error |
| parser_version | INTEGER NULL | which parser regex set produced the candidate |
| candidate_json | TEXT NULL | serialised SmsCandidate |
| candidate_status | TEXT NOT NULL DEFAULT 'none' | none / inbox / accepted / dismissed / merged |
| linked_transaction_id | TEXT NULL | once accepted/merged |

## `app_kv`

Singleton k/v table for tiny app state.

| Column | Type | Notes |
|---|---|---|
| key | TEXT PK | |
| value | TEXT NULL | |

Known keys today: `onboarded`, `seeded`.

## `audit_log`

Append-only event log. Used for support and "where did this go" debugging.
Not user-visible.

| Column | Type |
|---|---|
| id | INTEGER PK AUTOINCREMENT |
| at | INTEGER NOT NULL |
| level | TEXT NOT NULL |
| event | TEXT NOT NULL |
| payload | TEXT NULL |

## Migrations

`schema_version = 1`. Pre-pivot v0 had `actual_id` and `sync_status`
columns; we did not migrate (the prior shape was pre-release and nobody
depends on it). Future bumps will follow Drift's `MigrationStrategy`.
