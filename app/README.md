# Chavanni (app)

The Flutter client for [Chavanni](../README.md). A local-first expense tracker:
the on-device SQLite database (Drift) is the source of truth, and it syncs to an
optional self-hosted [pi-server](../pi-server/README.md).

## Stack

- **Flutter** (Android/iOS) with **Riverpod** for state and **`go_router`** for
  navigation.
- **Drift** over SQLite for local storage; the schema mirrors the server's.
- Sync, SMS, and AI features are additive — the app is fully usable offline with
  no server configured.

## Run it

Requires the Flutter SDK and a device or emulator.

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run                 # or: just install  (build release + adb install)
```

To use sync / server-side AI / SMS parsing, run a [pi-server](../pi-server/) and
set its URL + API key in **Settings → Sync server**. All AI calls round-trip
through the server, so the app never stores model credentials.

## Layout

```
lib/
├─ core/         money, prefs, secure storage, notifications, snackbars
├─ ui/           theme + shared widgets
├─ data/
│  ├─ db/        Drift schema + generated database
│  ├─ ai/        pi-server AI client
│  └─ sms/       reader, classifier, server-parse pipeline
├─ sync/         push/pull client, remote applier, scheduler
└─ features/     one folder per user-visible feature
```

## Development

```bash
just gate        # dart format --check + flutter analyze + flutter test
```

Before shipping a release APK, work through [`ACCEPTANCE.md`](ACCEPTANCE.md).
