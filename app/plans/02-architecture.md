# 02 — Architecture

## Layers

```
┌───────────────────────────────────────────────────────────┐
│  ui/         widgets, screens, theme                      │
├───────────────────────────────────────────────────────────┤
│  features/   one folder per user-visible feature          │
│  ├─ entry/        quick-entry sheet, AI parse card        │
│  ├─ inbox/        SMS suggestion review                   │
│  ├─ transactions/ list + detail + edit                    │
│  ├─ accounts/     account list, balances                  │
│  ├─ home/         dashboard                               │
│  ├─ onboarding/   first-run wizard                        │
│  └─ settings/                                             │
├───────────────────────────────────────────────────────────┤
│  domain/     pure-Dart models + use cases                 │
│  ├─ models/       Account, Category, Payee, Transaction   │
│  ├─ services/     ExpenseLogger, SmsClassifier, AiParser  │
│  └─ dedupe/       Matcher, MergeStrategy                  │
├───────────────────────────────────────────────────────────┤
│  data/       repositories, sync                           │
│  ├─ db/           Drift schema, DAOs, migrations          │
│  ├─ actual/       ActualClient (dio), DTOs                │
│  ├─ sms/          SMS reader, bank parsers                │
│  ├─ ai/           LlmClient (OpenAI-compatible)           │
│  └─ sync/         SyncQueue, SyncWorker                   │
├───────────────────────────────────────────────────────────┤
│  core/       app-wide infra                               │
│  ├─ logging/                                              │
│  ├─ result/       Result<T,E> sealed type                 │
│  ├─ time/         Clock for testability                   │
│  └─ env/          AppConfig (loaded once at boot)         │
└───────────────────────────────────────────────────────────┘
```

Rules:
- `ui/` and `features/` may import from `domain/`. They may NOT import from
  `data/` directly — they go through Riverpod providers that expose domain
  services.
- `domain/` is pure Dart. No Flutter imports. No `dio`, no `drift`. This is
  what we test heaviest.
- `data/` implements interfaces declared in `domain/`. It owns I/O.
- `core/` is at the bottom. Everyone may import it.

## Threading

Flutter has one UI isolate. Heavy work (regex parsing of 1000 SMS, Drift
migrations) goes through `compute()` or a long-lived isolate. SQLite via
Drift is on its own isolate by default in `NativeDatabase.createInBackground`.

## Riverpod topology

- Providers are declared next to the thing they expose, not in a global file.
- Anything that touches I/O is `AsyncNotifier` or a plain `FutureProvider`.
- Pure derivations (totals, filters) are `Provider`.
- The DB and HTTP client live in top-level singletons, exposed via
  `Provider`. They are constructed in `main.dart`.

## Sync model

The phone is the editor. Actual is the truth. Our local DB has every record
plus a `sync_status` column (see [04-data-model.md](04-data-model.md)).

Write path:
1. UI writes to local DB synchronously, marks the record `pending_push`.
2. Returns to the user immediately (optimistic).
3. Background `SyncWorker` picks up `pending_push` rows, calls Actual,
   flips them to `synced` on success or `failed` with reason on error.

Pull path:
1. On app launch and on pull-to-refresh, fetch deltas from Actual since the
   stored cursor.
2. Reconcile against local rows by `actualId` (server-side ID); merge.
3. New server-only rows land as `synced`.

We never edit a row that has `pending_push` from a pull. The local edit
wins; the pull is staged in a side table until the push resolves.

## Failure handling

- HTTP fails → row stays `pending_push`, retry with exponential backoff
  (60s, 5m, 30m, 2h, then daily). User can force-retry from settings.
- Local DB write fails → surface error, do not optimistically claim
  success.
- AI parse fails → fall back to the manual form with whatever fields the
  parser did extract.
- SMS parser fails → SMS is dropped silently. Not in the inbox.

## App lifecycle

- Cold start: open DB → load `AppConfig` from secure storage → if
  unconfigured, route to onboarding; else home.
- Background: `workmanager` runs `SyncWorker` periodically (every 15 min on
  Android, opportunistic on iOS).
- Foreground resume: trigger one immediate sync.
