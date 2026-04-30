# 03 — Local-first storage

## What lives where

```
[ Flutter app on the phone ]
       │
       ├── SQLite (Drift)        ← single source of truth, file at
       │                           Application Documents / gullak.db
       │
       ├── shared_preferences    ← non-secret prefs (theme, currency,
       │                           last-used-account, payee→account hints)
       │
       └── flutter_secure_storage← only for the LLM endpoint config
                                   (API key, base URL, model)
```

There is no server. No sync. No accounts.

## What's in SQLite

See `04-data-model.md` for the table-by-table breakdown. High level:

- `accounts` — bank-ish accounts: name, kind, opening balance, on-budget
  flag, archived flag. The kind drives the icon and the on-budget default.
- `category_groups` and `categories` — two-level categorisation.
  Categories may have a colour and an icon for visual flair.
- `payees` — find-or-created on first use; `use_count` drives the
  recent-payees chip strip in Quick Entry.
- `transactions` — every entry, including transfers (paired rows linked
  by `transfer_group_id`) and splits (parent + children linked by
  `parent_id`).
- `budgets` — monthly target per (category, month). The "envelope"
  budgeting model.
- `recurrences` — templates for recurring transactions. Applied on app
  launch when their `next_date` ≤ today.
- `sms_messages` — the SMS classifier's working set. Android-only;
  empty on iOS.
- `app_kv` — single-row k/v for app state (e.g. `onboarded=true`).

## What's NOT in SQLite

- The LLM API key. Goes in flutter_secure_storage so it survives
  app reinstall via keychain backup, and is encrypted at rest.
- Theme + currency + entry-memory hints. These are non-sensitive,
  small, and don't deserve a DB roundtrip per keystroke. They live
  in shared_preferences.

## Backup & restore

`features/backup/backup_service.dart` exports a single JSON file of
every interesting table. Every user-visible export is the same file.

Schema version is the first field in the payload. Imports refuse a
mismatched version with a clear error rather than corrupt the DB.

The export is offered via `share_plus` (system share sheet on iOS,
intent on Android). The user picks where it goes — iCloud Drive,
email, AirDrop, etc. We do not call any cloud API.

Import uses `file_picker` to pick a JSON file. The import is a single
DB transaction: wipe-then-restore. There is no merge mode in v1.

## Why local-first is enough

Single-device tracker with under 100k transactions is comfortably below
SQLite's "boring" performance envelope. With Drift's stream queries we
re-render lists in well under a frame. The full DB is small enough that
JSON export is instant.

## When this won't work

- If you want to log expenses on two phones and have them merge.
- If you lose your phone without ever exporting a backup.

These are real failure modes. The mitigation is making backup *easy* —
one tap → share sheet → save anywhere — and shipping a "you haven't
backed up in 30 days" nudge in v1.1.

## What the integration with Actual would have been

We had three paths in the prior design:

- `actual-http-api` Docker shim (Node.js, wraps `@actual-app/api`).
  Adds one container next to the Actual server.
- A Python FastAPI shim that wraps `actualpy`. One language, no Docker,
  but still a server to babysit.
- Reimplement Actual's CRDT sync protocol in Dart. Months of work.

We picked option 0 — don't integrate. The user can always export JSON
and import it elsewhere if they ever want to.
