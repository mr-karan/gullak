# 10 — Deduplication and reconciliation

The same expense can arrive through three channels:

1. **Manual** — the user types it.
2. **AI / Type-tab** — the user dictates and AI parses.
3. **SMS** — the bank SMS shows up minutes later.

Without dedupe, the user ends up with two copies of every Blinkit run.

## Strategy

Dedupe runs at three layers:

### 1. Local pre-write dedupe

Before saving any new candidate (manual, AI, or SMS-confirmed), search the
local DB for a near-match:

- Same account.
- Amount equal in cents.
- Date within ±2 days.
- Payee name fuzzy-match (Levenshtein ≤ 2 OR token overlap ≥ 0.7).

If a match exists with `sync_status = synced` or `pending_push`, prompt
the user with a sheet:

> Looks like a duplicate.
> Existing: ₹450 · Blinkit · Apr 30
> New: ₹450 · Blinkit · Apr 30
> [Skip] [Save anyway] [Merge into existing]

Default action depends on origin:
- For **manual / AI**: default to "Save anyway" (the user explicitly
  typed it).
- For **SMS Confirm**: default to "Merge into existing" — bank SMS is the
  source of truth for what the bank actually charged, so we update the
  existing row's `cleared = true` and add the SMS body to `notes`.

### 2. SMS inbox dedupe

When SMS classifier produces a candidate, before queuing it to the Inbox:

- Check local transactions in last ±2 days, same account hint.
- If a strong match exists (same amount, same payee fuzzy), do NOT add
  the SMS to the inbox. Instead, link it: set the existing row's `cleared
  = true`, append `notes` with the SMS sender + bank ref, and mark
  `sms_messages.candidate_status = 'merged'`.
- The user gets a small toast ("Confirmed Blinkit ₹450 from SMS").

### 3. Server-side dedupe via `imported_id`

Every transaction we push has `imported_id = "gullak:<localUuid>"`. This
makes our pushes idempotent — re-posting the same transaction (e.g. after
a network retry) will not duplicate on the Actual side.

We use the `/transactions/import` endpoint instead of `/transactions` for
all pushes; `import` reconciles by `imported_id` (and falls back to
`(date, amount, account)` matching for non-Gullak imports).

## Match scoring

We compute a score 0..1 for any candidate vs an existing row:

```
score = 0
if amount_equal:         score += 0.5
if account_equal:        score += 0.2
if date_within_1d:       score += 0.15
elif date_within_2d:     score += 0.08
payee_sim = fuzzy(payee_a, payee_b)   // 0..1
score += 0.15 * payee_sim
```

Thresholds:
- `score ≥ 0.8` → strong match, auto-merge for SMS, prompt for manual/AI.
- `0.6 ≤ score < 0.8` → weak match, surface as "possible duplicate" but
  default to save.
- `score < 0.6` → not a duplicate.

## Edits and deletes

- Edit a transaction → push as PATCH to Actual. The local row stays
  `pending_push` until the PATCH succeeds.
- Delete → tombstone locally (`deleted_at` set, `sync_status = pending_delete`),
  then DELETE on Actual. After server confirms, the row is hard-deleted
  from local.
- Server pull finds a row we don't have → insert.
- Server pull finds a row we have but with different data and our local is
  `synced` → server wins, update local.
- Server pull finds a row we have but our local is `pending_push` →
  local wins, ignore server until our push completes.

## Race conditions

- User confirms an SMS at the same moment a manual entry posts → both run
  through pre-write dedupe; whichever lands second sees the other and
  merges.
- Two devices editing the same transaction → out of scope. We are
  single-device for v1.

## Audit

Every dedupe decision (merge, skip, override) is written to `audit_log`
with the linked transaction IDs. Useful for explaining "where did this go?"
later.
