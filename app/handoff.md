# Gullak — Handoff to Production

You are the engineer taking Gullak from "works on my simulator" to "shipping APK on Karan's Pixel." Read this whole doc once, then drive.

## What Gullak is

A local-first Flutter expense tracker for Android + iOS. SQLite is the source of truth — nothing syncs to a server. The user's mental model: open app, log expense in <3 seconds, see month at a glance. Polish bar: YNAB / Money Manager (realbyteapps).

The Python/Paisa/Actual Budget integration was ripped out earlier (`bcbcefc` and `9f149d4`). Don't try to bring it back.

## Repo layout

```
gullak/
├── app/                      ← THIS IS THE FLUTTER APP. Work here.
│   ├── lib/
│   ├── android/              ← AndroidManifest, gradle
│   ├── ios/
│   ├── pubspec.yaml
│   └── (no test/ dir yet)
├── pi-server/                ← unrelated old TS WhatsApp/ledger backend, ignore
├── whatsapp-bridge/          ← unrelated, ignore
└── CLAUDE.md                 ← stale, refers to old pi-server world
```

The Flutter project is **`app/`**. `cd app` for every flutter command.

## Stack (already in `app/pubspec.yaml`)

- Flutter SDK ≥3.11.5, Dart 3.x
- `flutter_riverpod ^3.3.1` + `go_router ^17.2.2`
- `drift ^2.20.3` + `sqlite3_flutter_libs` + `drift_dev` codegen
- `dio ^5.7.0` for the LLM HTTP client
- `flutter_secure_storage ^10.0.0` (LLM creds), `shared_preferences ^2.3.3` (prefs, JSON hint maps)
- `another_telephony ^0.4.1` + `permission_handler ^12.0.1` (Android SMS)
- `flutter_slidable ^4.0.0`, `share_plus`, `file_picker`, `intl`, `uuid`

## What's built today

**Working flows on iOS sim (verified):** onboarding (2-step: welcome+currency, first account → seeds defaults) → home (Net hero card + Today + Recent) → Activity (day-grouped, slidable swipe Edit/Delete with undo) → Accounts (Money Manager-style cards) → Account detail → Categories (CRUD + groups) → Budgets (envelope, per category × month) → Reports → Settings → Backup (JSON export/import via share sheet).

**Built but unverified on real Android:** SMS pipeline (`lib/data/sms/`) — `SmsClassifier` regex-filters bank/non-bank, `ParserRegistry` dispatches to `HdfcCardParser`, `HdfcUpiParser`, `IciciParser`, `AxisParser`, `SbiParser`. `SmsPipeline.backfill()` reads last 90d, `startListening()` subscribes to live SMS via `another_telephony`. Parsed candidates land in `Inbox` for confirm/dismiss. Manifest has `READ_SMS RECEIVE_SMS POST_NOTIFICATIONS INTERNET`.

**AI parsing (Quick Entry "Type" tab):** `lib/data/ai/llm_client.dart` — Dio against any OpenAI-compatible `/chat/completions`, JSON mode. `lib/features/entry/ai_extractor.dart` builds a system prompt that constrains amount/payee/category/date and feeds known accounts/categories/payees as hints. Toggleable via `prefs.aiEnabled`. Endpoint + model + key live in flutter_secure_storage.

**Not built (TaskList #20, #22):** split transaction UI; recurring transaction UI. The `Transactions.parentId/splitTotalCents` and `Recurrences` tables exist; the screens don't.

**Tests:** none exist. Empty `test/` dir doesn't even exist. This is your single biggest gap.

## Codebase map

```
app/lib/
├── main.dart                     entry, ProviderScope overrides
├── core/                         money, clock, prefs, secure_store, logger
├── data/
│   ├── db/
│   │   ├── tables.dart           ← drift schema (read this first)
│   │   ├── database.dart         AppDatabase + migrations
│   │   └── database.g.dart       (generated)
│   ├── ai/llm_client.dart        Dio LLM HTTP
│   └── sms/
│       ├── sms_models.dart, classifier.dart, sms_reader.dart
│       ├── parser_registry.dart, sms_pipeline.dart
│       └── parsers/              hdfc, icici, axis, sbi
├── features/
│   ├── onboarding/onboarding_flow.dart
│   ├── home/{home_shell.dart, home_screen.dart}
│   ├── entry/                    ★ THE HOT FILE
│   │   ├── quick_entry.dart      modal opener
│   │   ├── quick_entry_sheet.dart  (~1100 lines — Type tab + Form tab + keypad + pickers)
│   │   ├── ai_extractor.dart     LLM → ParsedExpense
│   │   └── entry_memory.dart     payee→account/category JSON hints
│   ├── transactions/             list (slidable) + repository
│   ├── accounts/                 list + detail + form sheet + repo
│   ├── categories/, payees/, budgets/, reports/, inbox/, backup/, settings/
├── router/router.dart            GoRouter w/ refreshListenable for onboarded state
├── state/providers.dart          dbProvider, prefsProvider, onboardedProvider, …
└── ui/{theme.dart, widgets/}     MoneyText, CategorySwatch, EmptyState, SectionHeader
```

DB tables: `Accounts`, `CategoryGroups`, `Categories`, `Payees`, `Transactions` (with transfer linkage `transferAccountId/transferGroupId` and split linkage `parentId/splitTotalCents`), `Budgets`, `Recurrences`, `SmsMessages`, `AppKv`, `AuditLog`.

Money convention: integer minor units (₹4.50 → 450 with `minorDigits=2`, ¥123 → 123 with `minorDigits=0`). Quick Entry's keypad is *whole-unit* — multiply by `pow10(minorDigits)` at save. Don't add decimal input back.

## Recent fixes you should know about (don't undo)

- `c2db158` — capture `ScaffoldMessenger`/`Navigator` *before* `Navigator.pop` in QuickEntry; using a deactivated context for `InheritedWidget` lookups was tripping `_dependents.isEmpty`.
- `1f0ded7` — Quick Entry layout overflow: hide the digit keypad when `MediaQuery.viewInsets.bottom > 0` (system keyboard is up for note field), and don't double-subtract status-bar inset on sheet height (SafeArea already handles it).
- `restore()` in `transaction_repository.dart` uses `insertOnConflictUpdate` (stale Undo can't blow up on PK).
- Onboarding `_finish` does NOT call `context.go('/')` after `ref.invalidate(onboardedProvider)` — the router redirects on its own; double-nav races the unmount.

## Priorities, in order

### P0 — Bug-free Quick Entry

This is the most-used surface. The user has said repeatedly: "this IS the most important aspect of the app."

- Drive every code path on a real device (open from FAB, open from row tap, swipe Edit, swipe Delete + Undo, AI Type tab, edit hydration, payee picker with keyboard, category picker, date picker, picker-then-back-then-save).
- For each: zero `flutter analyze` warnings, zero red overlay errors, zero `Another exception` cascades in the run log.
- Loading skeleton on edit hydration (today it just goes blank for ~200ms while `_hydrateFromExisting` runs).
- Search field on Activity needs **debounced** `onChanged` (250–300ms) — currently rebuilds the StreamProvider on every keystroke.
- Category picker needs a search input like the Payee picker.
- Drop the "2d ago" date chip — Today/Yesterday/Pick is enough.
- Bigger tap target for "Add note" (48dp min).
- Verify split-second double-tap on Save is idempotent (the `_saving` guard exists; prove it with a test).

### P1 — Tests, tests, tests

Set up `app/test/` and `app/integration_test/`. Aim for:

- **Unit (`test/`)**:
  - `core/money_test.dart` — `Money.parseToMinor`, `Money.format` round-trips for INR (2 digits), JPY (0 digits), edge cases (commas, negative, empty, "Rs.").
  - `data/sms/classifier_test.dart` — table-driven: real SMS bodies (paste anonymized samples) → `transactionalHigh / transactionalLow / nonTransactional`. Cover OTP, marketing, EMI offer, debit, credit, refund.
  - `data/sms/parsers/*_test.dart` — for each parser, real bank message strings → `SmsCandidate` with expected amount/payee/date.
  - `features/transactions/data/transaction_repository_test.dart` — drift in-memory: create normal + transfer + split, update, delete, **restore round-trip**, sumSpend/Income, near-duplicate detection.
  - `features/entry/ai_extractor_test.dart` — mock `LlmClient`, assert prompt shape and that hint lists are passed in.
- **Widget (`test/`)** for Quick Entry: golden-test the Form tab in income vs. expense state; verify keypad hidden when keyboard up via `tester.testTextInput.show()`.
- **E2E (`integration_test/`)** — at minimum a "happy path" scenario: launch → onboarding → add expense via keypad → see it on Home + Activity → swipe-delete → undo → assert it's back. Run with `flutter test integration_test/ -d <android-device>`.

CI later, but locally: `flutter test` must be green before commit. Add `dart format` + `flutter analyze` to a pre-commit script under `app/scripts/`.

### P2 — Natural-language input that actually works

Today: AI tab exists, prompt is decent, but the loop is *type → wait 350ms debounce → see preview chips → Save*. Two problems:

1. The model can return garbage; we have `confidence < 0.5` warning chip but no auto-resolve to known accounts/categories. **Add a fuzzy-match step:** after `chatJson` returns, if `account_hint` is set, fuzzy-match against `accountRepo.list()` and resolve to `accountId` (Levenshtein ≤2 on lowercased name). Same for `category_hint` and `payee_name`. This is the missing link — model says "hdfc" and we never map it back to the account row.
2. There's no examples block in the prompt. Add 4–6 few-shot examples in `_system` covering: "blinkit 450 hdfc groceries", "300 zomato yesterday", "got 5k from mom", "12.50 coffee" (decimal handling), "1.5L emi axis" (Indian shorthand), "$45 uber".

Then wire the local Mac dev story: the user runs an OpenAI-compatible endpoint somewhere (LM Studio / Ollama-cli / paid API). Settings already has the endpoint/model/key fields. Make the "Test connection" path in Settings actually do a one-shot parse with a canned input and show the result, not just check 200 OK.

### P3 — Pixel APK distribution

Goal: `just apk` (or whatever recipe) produces a release APK Karan can `adb install` on his Pixel, and SMS + AI both work.

Concretely:

1. **Signing config**. Today `android/app/build.gradle.kts` reuses the debug keystore for release — every build has a different key, so `adb install` after re-build fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Generate a long-lived dev keystore at `~/.android/gullak-dev.jks`, store its passphrase in `android/key.properties` (gitignored), wire it into `signingConfigs.release { ... }`. Do NOT commit the keystore.
2. **Permission flow on first SMS toggle**. Today `_toggleSms` in `settings_screen.dart` flips the pref but I'm unsure if it requests `READ_SMS` runtime permission first. Verify; if not, gate the toggle on `Permission.sms.request()`.
3. **Background SMS while app is closed.** `SmsPipeline.startListening()` only works while the Activity is alive. For "wake to log a transaction" we need a `BroadcastReceiver` for `SMS_RECEIVED` that wakes the Flutter engine in headless mode. `another_telephony` may not give us this — check; if not, write a tiny native receiver that writes to `SmsMessages` directly via a SharedPreferences flag and we re-process on next foreground.
4. **Notifications** when the inbox gets a high-confidence candidate. `flutter_local_notifications` (add it). One tap → opens Inbox.
5. **Bigger SMS parser corpus.** Today only HDFC/ICICI/Axis/SBI. Karan banks with X — find out which banks he uses and add parsers for them. Each parser is ~40 lines + a test.
6. `flutter build apk --release` must succeed and the APK must run on a Pixel without a debugger attached.

### P4 — Outstanding TaskList items

`#20 Split transactions UI` and `#22 Recurring transactions UI`. Tables exist. Wire screens in `features/transactions/` and `features/recurrences/`. Use the existing `createSplit` and add a `Recurrences` repository.

## Working agreement

- Always work in `app/`. Read `CLAUDE.md` at repo root for context but treat the "pi-server" world as deleted history.
- Before any change to `quick_entry_sheet.dart`: re-read the file end-to-end. It's the most fragile surface.
- After any UI change: run on iOS sim *and* Android emulator (or device). UI bugs hide in `viewInsets`, safe-area, font scaling. Run logs go to `/tmp/gullak-run.log`; grep them after every interaction for `EXCEPTION`, `Another exception`, `RenderFlex`, `assertion`.
- `flutter analyze` must be clean before every commit. `dart format .` on every changed file.
- After any drift table change: `dart run build_runner build --delete-conflicting-outputs`. Add a migration in `database.dart`, don't just bump `schemaVersion`.
- Commit messages: lowercase scope, what + why. One logical change per commit.
- Don't add features beyond P0–P4 without checking in.
- If you find a bug that contradicts this doc (e.g. a test exists, a parser is for a different bank), trust the code, update this doc, then keep going.

## Done definition

- `flutter test` green, `flutter test integration_test/` green on Android emulator
- `flutter analyze` clean
- `flutter build apk --release` produces a signed APK that installs on Karan's Pixel and survives an upgrade
- Quick Entry: 0 red overlays through 50 round-trips of every flow
- AI tab parses these without manual tweaking: `blinkit 450 hdfc`, `zomato 300 yesterday`, `salary 1.2L`, `uber 250 split with karan`
- SMS: a real HDFC debit SMS on the Pixel within 90s lands in Inbox, confirm → creates a transaction on the right account
- Backup → Restore round-trip preserves every transaction, account, category, budget byte-for-byte

Start by writing tests for what already works (P1 setup + `core/money_test.dart` + classifier tests) — that locks in the ground truth before you start changing things.
