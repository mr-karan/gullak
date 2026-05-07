# Gullak Product Polish Plan

Objective: make Gullak feel like a daily money review assistant with local-first
offline UX and server-persisted, synced product state. The phone can keep a full
local SQLite replica, but durable user primitives must sync to the server.

## Status

- [x] Tags: schema, sync, entry picker, tag screens, tag analytics.
- [x] Optional transaction location capture and transaction detail map preview.
- [x] Duplicate SMS hardening at ingest and Inbox display.
- [x] Simplified Inbox top bar: advanced scan/retry/ignored actions moved to menu.
- [x] Daily review card on Home with pending SMS, failed SMS, uncategorized work,
      and budget alerts.
- [x] Budget guidance card with left/overspent/near-limit summary.
- [x] SMS confirm now checks near-duplicate transactions before creating a row.
- [x] Latest server image built, pushed, and deployed to homelab.
- [x] First-class synced rules and rule match history: app schema, server schema,
      sync push/pull, backup, basic Rules screen, and SMS confirm application.
- [x] Payee memory migrated to synced rules: Quick Entry and AI/SMS hinting now
      read/write rule-backed mappings instead of prefs-only state.
- [x] Inbox triage buckets: Ready, Needs review, Ignored, Already matched.
- [x] Money Manager-style Activity modes: daily, calendar, weekly, monthly,
      summary.
  - [x] Daily / Week / Calendar / Month / Summary / All segmented Activity modes.
- [x] Strong filters: account, category, tag, amount, date, origin, status, SMS
      text.
  - [x] First pass: search now covers merchant/payee, notes, category, account,
        plus date-mode filtering.
  - [x] Dedicated filter sheet for account/category/tag/origin/cleared.
  - [x] Amount range filters.
  - [x] Dedicated SMS body text filter for transactions created from SMS.
- [x] One/two-tap transaction correction for category, payee, account, and tags.
- [x] Reconciliation: expected balance vs user-entered actual balance.
- [x] Backup confidence UX: last backup/export time, restore preview, CSV export,
      local/synced status.
- [x] First pass backup confidence: last JSON export status and transaction CSV
      export.
- [x] Clear AI failure buckets throughout: amount missing, merchant unclear,
      transfer-like, not a transaction.
- [x] Reduce settings-first flows: daily surfaces expose common review, confirm,
      correction, filtering, reconciliation, and export actions.
- [x] Category model simplified to one visible hierarchy: parent category >
      subcategory. Internal groups remain only for spending/income compatibility.
- [x] App/server category writes enforce one nesting level and inherit parent
      type for subcategories.
- [x] Theme picker redesigned as a full-width bottom sheet.

## Rules Model

Rules must be a synced resource, not prefs-only state.

### `rules`

- `id`
- `name`
- `enabled`
- `priority`
- `trigger_type`: `sms_sender`, `sms_body`, `payee`, `account_hint`, `amount`,
  `merchant`
- `trigger_payload`: JSON
- `action_payload`: JSON
- `created_at`
- `updated_at`

### `rule_matches`

- `id`
- `rule_id`
- `source_type`: `sms`, `manual`, `whatsapp`
- `source_id`
- `transaction_id`
- `matched_at`
- `outcome`: `applied`, `skipped`, `overridden`
- `updated_at`

### Example Action Payload

```json
{
  "payeeName": "Blinkit",
  "categoryId": "...",
  "accountId": "...",
  "autoConfirm": true,
  "tags": ["..."],
  "ignore": false
}
```

## Implementation Order

1. Add `rules` and `rule_matches` to Drift, Drizzle, backup, sync push/pull,
   and server migrations.
2. Add `RuleRepository` and apply rules in SMS Inbox confirmation and Quick Entry.
3. Add a lightweight Rules screen from Settings, then move it to a more visible
   daily surface once proven.
4. Convert payee/category memory from prefs into synced rules.
5. Add Activity tabs and dense filters inspired by Money Manager.
6. Add reconciliation fields and flows for accounts.
7. Add backup/export confidence and CSV export.
8. Iterate visual density and chart polish toward Money Manager/YNAB quality.
9. Keep schema/API foundations strict: durable user intent syncs as rows, UI
   avoids exposing storage-only concepts, and server routes enforce model
   invariants accepted by the app.
