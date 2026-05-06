# Changelog

All notable changes to Gullak are documented here.

## [0.1.0] - 2026-05-06

### Added

- Local-first Flutter expense tracker with Drift/SQLite persistence.
- Bun + Hono + Drizzle `pi-server` with mirrored SQLite schema, API-key auth,
  migrations, CRUD resources, summaries, and row-level sync changelog.
- Push/pull sync with client change IDs, idempotent server application, and
  last-write-wins remote application on the phone.
- Quick Entry for manual expenses/income, transfers, split transactions, receipt
  images, and AI-assisted text parsing.
- SMS Inbox with classifier-positive bank message ingestion, server-side LLM
  parsing, confirm/dismiss flows, and confirm-all.
- Category-aware AI/SMS parsing using local categories and learned
  payee→category mappings.
- Category emoji system across onboarding defaults, category management, Quick
  Entry picker, and Activity rows.
- Inline category creation from the expense picker.
- WhatsApp bridge based on Baileys with SQLite-backed auth/session/cache storage.
- Feedback endpoint and mobile “Send feedback” action for parser failures:
  `POST /v1/feedback`, `GET /v1/feedback`.
- Build stamping and release APK generation via `just apk`.

### Fixed

- SMS parser direction detection now treats credited/received/deposited/refund/
  cashback/salary messages as income and debited/spent/paid/sent/charged/
  purchase messages as expenses.
- Inbox parse failures are visible instead of being silently dropped.
- Inbox refresh clears retryable stale rows and the old parse cache before
  rescanning, so Android SMS id dedupe no longer prevents reparsing fixed rows.
- Settings dialogs avoid using deactivated contexts after pop.
- SMS Inbox clear cancels in-flight ingest/backfill work, clears queued
  background SMS, and restarts listening without replaying stale messages.
- WhatsApp bridge starts directly from SQLite-backed auth state instead of a
  stale multi-file creds path.
- Snackbars are centralized through `showTimedSnackBar`. The helper now calls
  `clearSnackBars()` instead of `hideCurrentSnackBar()` so a fresh toast
  supersedes both the visible one and any queued ones — the
  "SMS refresh complete — N new" toast no longer surfaces seconds late and
  looks sticky. Action snackbars (Undo affordances) still get a Timer-backed
  force-close to defeat Android accessibility's extended display behaviour.
- Onboarding large-text/small-viewport regressions are covered by widget tests.
- SMS parser system prompt: a transactional verb attached to an amount
  (Spent/Debited/Credited/Paid/etc.) now wins over an "Avl Limit" /
  "Bal" / "Not you?" footer line, so Axis-style "Spent INR 189 …
  Avl Limit: …" SMS no longer get silently classified as
  non-transactional.

### Added (Inbox)

- Inbox AppBar gains a "Show ignored SMS" toggle. Hidden by default;
  when enabled it lists messages the classifier rejected
  (`non_transactional`), duplicates, and rows the user dismissed.
- Each ignored row exposes a "Log manually" action that re-opens
  Quick Entry on the natural-language tab pre-filled with the SMS
  body — useful when the classifier or LLM was wrong.
- Quick Entry now accepts an `initialNote` so callers (Inbox today,
  share-target tomorrow) can hand it text to parse without making
  the user retype.

### Changed

- All LLM work now runs on pi-server; the app only stores the sync URL/API key.
- Quick Entry/SMS parser requests include accounts, categories, payees, and
  learned payee category hints as context.
- Activity rows show category emoji instead of letter-only category swatches
  where possible.

### Operational notes

- The pi-server SQLite DB can be reset by backing up and removing
  `/mnt/storage/gullak/gullak.db*`, then restarting the stack.
- Android app state can be reset with `just clear-data`.
- 0.1.0 release artifact: `app/dist/gullak-latest.apk` attached to the Gitea
  `v0.1.0` release.
