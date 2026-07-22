
# Changelog

All notable changes to Gullak are documented here.

## [Unreleased]

### Added

- **Causal CRDT sync protocol v2.** Financial edits are immutable field-level
  events with exact causal context, deterministic multi-value conflict
  projection, authenticated actors, verified checkpoints, and explicit
  quarantine. Wall clocks and full-row LWW snapshots no longer
  decide authoritative state. The Flutter app, sync server, web routes, agent,
  SMS pipeline, recurrences, transfers, splits, tags, budgets, and backup import
  all author through the same atomic command path.
- **Sync recovery and observability.** Clients report duplicates, conflicts,
  quarantine, and protocol version; rebuild only from a content- and
  projection-hash-verified checkpoint; and acknowledge the exact integrated
  frontier. Operators can audit the active epoch and retire replicas only with
  a verified backup and invariant-clean fold.

- **iOS SMS auto-capture** via `POST /v1/sms/ingest`. iOS has no SMS-read API,
  so a Shortcuts personal automation forwards bank/UPI messages to the server,
  which parses them with the same engine as Android and queues a reviewable
  draft into the phone's Inbox (never auto-writes a transaction). The inbox
  delivery queue gained a `source` column so drafts label as SMS vs WhatsApp.
- **End-user documentation site** built with Zensical (`website/`): home,
  install, SMS capture (incl. the iOS Shortcut recipe), and self-hosting.
- **Envelope budgeting (YNAB-style "give every dollar a job").** A Budget view:
  Ready-to-Assign, per-category Assigned / Activity / Available with automatic
  rollover, inline reassignment, per-category **targets** (monthly or by-date,
  funded/underfunded), **Age of Money**, upcoming scheduled outflows, and
  off-budget transfers reducing Ready-to-Assign. Server-only; reuses the budgets
  table plus a new `category_targets` table.
- **Money-manager mechanics ported from Actual/YNAB:** import dedupe (3-pass
  matcher), a rules engine + auto-learned payee→category rules, auto-mirrored
  transfers, account reconciliation (cleared/reconciled lock + adjustment),
  transaction grouping, net-worth + cash-flow history, a calendar month-grid,
  and top-spends / new-payees insights.
- **AI assistant can now edit finances** in real time (categorize, edit, delete,
  log) with a clean read/write tool split, structured result cards + Undo, and
  awareness of transactions selected in the web register.

### Changed

- Linked payee names, payee usage counts, and split/group totals are now
  deterministic derived projections. An unrelated stale transaction edit can
  no longer rename a payee or overwrite any untouched field. Rules and rule
  matches are non-replicated local/server configuration, so legacy rule payloads
  cannot poison the financial stream.
- **Full web app redesign** to a dense, operational "ledger-indigo" language
  (YNAB-inspired): register/grouped tables, instrument summary bars,
  traffic-light status pills, the Figtree typeface — replacing the earlier
  card-dashboard look across every screen.

## [0.4.0] — 2026-07-13

_Version numbering jumps over 0.3.x: the pre-rewrite repository already
published v0.3.0/v0.3.1 tags, and tags are forever._

### Changed

- **Free and open source.** MIT (app) / AGPL-3.0 (server, bridge); public
  repository, landing page, self-hosting guide, and F-Droid metadata.

_Everything below shipped in the 0.2.x self-use builds and lands publicly
with 0.4.0:_

### Added

- **Foreign-currency capture.** Optionally record what an expense was in its
  original currency (e.g. USD 20) alongside the base-currency amount — an
  "Add foreign amount" field in Quick Entry and an "Original" line on the
  transaction detail. Display-only, no conversion. New nullable
  `original_amount_cents` / `original_currency` columns sync and back up.
- **Home-screen shortcut.** A long-press app shortcut jumps straight to Quick
  Entry (via the first-party `quick_actions` plugin).
- **Transfers in the UI.** An Activity-toolbar "New transfer" sheet records a
  transfer between two accounts as a paired debit/credit via the existing
  `createTransfer` repo path, so account balances stay correct (a credit-card
  payment no longer reads as spend). The method existed but had no entry point.
- **Recurrences now post automatically.** On launch/resume, due recurrence
  schedules book their transactions (catching up missed periods, clamping
  month-end dates) and advance. Idempotent by a deterministic per-occurrence id
  so two devices can't double-book. A snackbar reports how many landed.
- **Bundled editorial fonts.** Fraunces/Inter/JetBrains Mono ship as OFL assets
  instead of being fetched at runtime via `google_fonts`, so the offline-first
  app keeps its typography on a first launch with no network. `google_fonts`
  dependency removed.
- **Shared error state.** `AsyncValue.when(error:)` sites now render an
  `ErrorState` with a Retry that re-runs the provider, replacing bare
  `Error: $e` text dumps.
- **Confirm-all preview.** The Inbox bulk-confirm dialog now previews how many
  rows fall back to the first account / land uncategorised before committing.
- **Server rate limits.** Fixed-window per-IP caps on `/v1/ai/*` and the
  WhatsApp webhook (`GULLAK_AI_RATE_PER_MIN` / `GULLAK_WHATSAPP_RATE_PER_MIN`).
- **Onboarding currency** now defaults from the device locale.

### Changed

- **Sync survives a corrupt row.** A malformed change-log payload no longer
  wedges sync forever: the server skips it on pull (was an uncaught `JSON.parse`
  → 500 for every client) and the client quarantines an undecodable local row
  on push instead of throwing out of the whole batch.
- **WhatsApp webhook is authenticated** whenever the server has any key set
  (`GULLAK_WHATSAPP_API_KEY` or `GULLAK_HTTP_API_KEY`); a fully-open server logs
  a boot warning since the webhook can write transactions.
- **LLM calls time out** (`GULLAK_MODEL_TIMEOUT_MS`, default 60s) so a hung
  upstream can't pin requests.
- **Faster Budget + Activity at scale.** Budget spend is one grouped query
  instead of one SUM per category; the Activity SMS-text filter is one SQL
  `LIKE` instead of a per-row lookup; Inbox enrichment uses O(1) name maps.
- Server transaction indexes on `date`, `(account_id, date)`, `category_id`.
- CRUD route string fields (names, notes) are length-capped.

### Fixed

- **SMS rows stranded by a crash recover.** Rows stuck in `parsing` (mid
  server round-trip) or `processing` (mid Inbox confirm) are reset on the next
  launch/resume so they aren't lost.

### Performance

- **Home no longer keeps the SMS enrichment pipeline warm.** The Daily Review
  badge now reads a lightweight counts stream instead of watching the full
  enriched Inbox list.

### Tests

- New coverage for the sync engine (`RemoteApplier` LWW/deletes/malformed,
  `SyncService` push quarantine + pull cursor), recurrence auto-posting,
  stuck-row recovery, foreign-currency round-trip, the server corrupt-payload
  path, and the server AI write paths (agent log/undo, SMS reprocess staleness
  guard) via a mockable LLM seam.

## [0.2.1] - 2026-05-18

### Added

- Phosphor icon pack for categories. The Activity, Home recent, and
  Categories admin screens render category-specific glyphs sourced from
  a name-keyed lookup with a 64-entry memo cache. Replaces the previous
  emoji-first rendering. Legacy `categories.icon` strings still display
  in the form dialog's picker for back-compat.
- SMS auto-confirm now fires a high-importance notification with an
  inline "Add note" reply, matching the existing Inbox candidate flow.
  Replies to the action enqueue a WorkManager job that posts to
  `POST /v1/ai/sms/enrich` and back-fills payee + category on both the
  SMS row and the linked transaction. Previously, auto-confirmed SMS
  silently created uncategorised rows with no triage prompt.
- `just install debuggable=true` (and `just apk debuggable=true`) flips
  `android:debuggable` on the release build via the `GULLAK_DEBUGGABLE`
  env var, so `adb shell run-as` works for ad-hoc DB pulls without
  building a separately-signed debug variant.

### Changed

- `TransactionRepository.unset` is now public, so background workers
  (the enrichment isolate) can call `update()` with the same partial-
  update sentinel pattern instead of writing drift companions manually.
  The enrichment worker now reuses `PayeeRepository.ensure()` and
  `TransactionRepository.update()` end-to-end, picking up the existing
  change_log + last-write-wins semantics for free.
- `NotificationService`'s three SMS notification methods now share a
  single `_showSmsPrompt` builder; the `Add note` action is a const
  re-used across them.
- README rewritten for the 0.2.x feature set, including the new
  enrichment flow and the debuggable-build toggle.
- Notification id derived from the SMS row id (`& 0x7FFFFFFF`) so
  follow-up enrichment notifications replace the original in-place.

### Removed

- `app/handoff.md`, `app/plans/`, and `plans/` — stale planning docs
  that no longer matched shipped state.

## [0.2.0] - 2026-05-10

### Added

- Inbox row amounts now show signed `+₹` for refunds, salary, cashback, and
  other credits; expenses keep their `-₹`. Same convention applied to the
  Activity row trailing amount.
- Per-row Dismiss button in the Inbox Ready bucket, with an Undo snackbar that
  reopens the SMS if pressed within 4 seconds.
- Confirm flow for an SMS row now opens the Quick Entry sheet pre-filled
  (amount, sign, account, category if known, payee, date, tags). The user
  fills any missing metadata — usually the category — and Save creates the
  transaction and links the SMS row in one step. Near-duplicate matches
  surface as a warning before save instead of silently no-opping.
- App-wide error screen has a Send feedback action that posts the full
  diagnostic payload (exception, stack, context, build sha+time, platform,
  locale) to `/v1/feedback`. Feedback events older than 7 days are pruned
  server-side.
- Sync server health is now actively monitored. Offline banner has a Retry
  button, shows a spinner while checking, and the green "Sync server back
  online" toast fires automatically once reachability returns. The monitor
  uses exponential backoff with jitter (5s → 15s → 30s → 1m → 2m → 5m cap)
  while offline and a 2-minute poll while healthy. Foreground-only.

### Changed

- Activity tab dropped the Daily mode; the new default is Week.

### Fixed

- Daily Review card on Home, account balances, budget overview, and tag
  breakdowns no longer go stale after SMS arrive, transactions are
  added/edited/deleted, budgets are edited, or categories are hidden.
  Affected providers now watch the right Drift streams instead of a single
  unrelated source.
- `accountBalanceProvider` was watching the accounts list (which only changes
  on account renames/creates) instead of the transactions stream — fixed so
  balances refresh on every transaction mutation.

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
