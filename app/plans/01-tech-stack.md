# 01 — Tech stack

Pinned, opinionated. Each entry has a why.

## Toolchain

- **Flutter** — stable channel, Dart 3.x. Single codebase for iOS and
  Android. Native-quality animations and gestures, which we need for the
  YNAB polish bar.
- **Xcode + Android SDK** — for builds. The macOS dev box has Xcode already.
  Android SDK comes via Android Studio or `flutter doctor --android-licenses`.
- **VS Code or Android Studio** — agnostic. CI/build does not depend on the
  IDE.

## Runtime packages

| Concern | Package | Why |
|---|---|---|
| State | `flutter_riverpod` ^2 | Compile-checked DI, no boilerplate, async-aware. |
| Routing | `go_router` ^14 | Declarative, deep-linking ready, plays well with Riverpod. |
| Local DB | `drift` ^2 + `sqlite3_flutter_libs` | Type-safe SQLite, migrations, streams. The schema is non-trivial and we want compile-time safety. |
| HTTP | `dio` ^5 | Interceptors for auth + retry, multipart, cancellation. |
| JSON / models | `freezed` + `json_serializable` | Sealed classes, copyWith, equality. Cuts ~70% of model boilerplate. |
| Secure storage | `flutter_secure_storage` | Keychain / Keystore-backed, for Actual server password and API key. Never in SharedPreferences. |
| Prefs | `shared_preferences` | Non-secret config (theme, last opened account). |
| Permissions | `permission_handler` | One API for SMS, notifications, etc. |
| SMS read (Android) | `another_telephony` ^0.4 | Maintained fork, query inbox + listen for incoming SMS. iOS is a no-op. |
| Background sync | `workmanager` ^0.5 | Periodic retries when offline → online. |
| Local notifications | `flutter_local_notifications` ^17 | Notify when an SMS suggestion lands. |
| Money | none — int cents | Match Actual's wire format (integer minor units). One helper file for parse/format. |
| Date / locale | `intl` | Formatting only. |
| Logging | `logger` | Tiny, leveled, off in release. |
| UUID | `uuid` ^4 | Generate transaction client IDs (the dedupe key). |
| Cryptographic random | `crypto` (stdlib) + `Random.secure()` | For nonces, never `Random()`. |
| Env loader | none | Settings come from secure storage, not `.env`. |

## Dev / build packages

| Concern | Package |
|---|---|
| Codegen runner | `build_runner` |
| Lints | `flutter_lints` (baseline) + custom `analysis_options.yaml` |
| Tests | `flutter_test` + `mocktail` |
| Drift codegen | `drift_dev` |

## Versions

We pin to the latest stable Flutter at scaffold time. `pubspec.yaml` records
exact resolved versions; `pubspec.lock` is committed.

## Things we will NOT add

- `bloc` / `provider` — we picked Riverpod, do not mix.
- `dio_cache_interceptor` — caching is local DB, not HTTP.
- `get` — opinionated routing/state package; reinvents what Riverpod + go_router give us.
- `hive` — Drift covers it.
- `firebase_*` — no Firebase. Not needed for our model and not self-hostable.
- `sentry_flutter` — keep telemetry out of v1. Logs go to local file; user can share if reporting a bug.
- Charting libs (`fl_chart`, `syncfusion_*`).
- Heavy animation libs. Default Flutter motion is enough for the polish bar.

## Codegen

`pubspec.yaml` declares `dev_dependencies` for `build_runner`, `freezed`,
`json_serializable`, `drift_dev`. The build is:

```
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run
```

CI later: `flutter analyze && flutter test && flutter build apk --debug`.
