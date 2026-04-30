# Gullak (mobile)

A polished Flutter expense tracker that talks to a self-hosted Actual Budget
server through the [`actual-http-api`](https://github.com/jhonderson/actual-http-api)
shim. Optional AI parsing and Android SMS ingestion.

## What this is

- Local-first SQLite cache (Drift) → server is the source of truth.
- Quick-entry sheet (Form + AI) for fast logging.
- SMS inbox on Android: classifier + bank parsers → one-tap confirm.
- Reconciliation: pre-write near-duplicate matching + idempotent pushes
  via `imported_id`.

## Specs first

Read [`plans/`](plans/) before changing behaviour. The plans are the design
contract; this code implements them.

## Run it

You need the Flutter SDK (3.41+) and a desktop (macOS) or device target
hooked up. The repo currently builds for macOS, iOS, and Android.

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run -d macos        # or -d <iOS sim id> / -d <android emulator>
```

You'll need an `actual-http-api` instance and its API key to connect.

## Layout

```
lib/
├─ core/            logger, prefs, secure storage, money helpers
├─ ui/              theme, shared widgets
├─ router/          go_router setup
├─ state/           top-level Riverpod providers
├─ data/
│  ├─ db/           Drift schema + generated database
│  ├─ actual/       HTTP client for actual-http-api
│  ├─ ai/           OpenAI-compatible chat client
│  ├─ sms/          reader, classifier, bank parsers
│  └─ sync/         pull/push orchestration
└─ features/        one folder per user-visible feature
```

See [`plans/02-architecture.md`](plans/02-architecture.md) for the rules
about which layer can import which.

## Status

Early. The app boots, onboards, syncs, logs expenses, and runs the SMS
pipeline on Android. Polish bar: not yet at YNAB level — this is what the
next iteration is for.
