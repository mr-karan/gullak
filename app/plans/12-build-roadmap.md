# 12 — Build roadmap

The realistic order for a single-day push to a working compile. Cuts are
explicit so we always have a runnable artefact.

## Phase 0 — Tooling (target: 30 min)

- Install Flutter via Homebrew. `flutter doctor` should show iOS toolchain
  ready (Xcode is on the box) and Android (we don't strictly need
  Android tooling to compile for iOS simulator, but we will install it for
  Android builds).
- `flutter create app` (no, see below — the directory is `app/`, scaffold
  already there).
- Pin Dart SDK. Set up `analysis_options.yaml`.

## Phase 1 — Skeleton that boots (target: 60 min)

- `pubspec.yaml` with all production deps from
  [01-tech-stack.md](01-tech-stack.md).
- `main.dart` boots a `ProviderScope`, sets a Material 3 theme, shows a
  placeholder home screen.
- `go_router` configured with stub routes.
- Drift schema scaffolded (empty tables, migrations file).
- `flutter analyze` clean. App boots on iOS sim.

**Gate:** the app must compile and run an empty home screen on the iOS
simulator. If it doesn't, we stop and fix.

## Phase 2 — Connection + onboarding (target: 90 min)

- `ActualClient` (dio) with `getBudgets`, `getAccounts`, `getCategoryGroups`,
  `getCategories`, `getPayees`, `getTransactions`.
- Onboarding screens 1–4 wired.
- Settings → connection page (read-only first, edit second).
- Initial pull populates local DB.

**Gate:** point at a real Actual server, complete onboarding, see accounts
list populated.

## Phase 3 — Quick Entry (target: 90 min)

- Quick Entry sheet, Form mode only (no AI yet).
- Payee/category/account pickers, custom amount keypad.
- Save inserts local + queues push.
- `SyncWorker` (foreground first, workmanager later) flushes the queue.

**Gate:** type an expense, save, see it in `actual-server`.

## Phase 4 — Lists and detail (target: 60 min)

- Home dashboard with month/today totals + recent.
- Transactions list with search + month filter.
- Transaction detail with edit + delete.
- Account list + detail.
- Pull-to-refresh.

**Gate:** can browse and edit existing data fluently.

## Phase 5 — AI extraction (target: 60 min)

- `LlmClient` with OpenAI-compatible chat completions.
- Quick Entry "Type" tab, debounce + parse + chip preview.
- Settings → AI page.

**Gate:** typing "blinkit 450 hdfc" produces a sensible draft.

## Phase 6 — SMS ingestion (target: 90 min)

- Permission flow.
- Backfill + live listener.
- Classifier (tiers 1+2).
- 4 bank parsers shipped (HDFC card, HDFC UPI, ICICI card, Axis card).
- Inbox screen with Confirm / Dismiss.
- Local notification on high-confidence arrival.

**Gate:** on Android, granting permission backfills last 90 days, and a
new bank SMS appears in the inbox.

## Phase 7 — Dedupe + reconciliation (target: 60 min)

- Local pre-write dedupe with the prompt sheet.
- SMS auto-merge against existing manual entries.
- Server-side `imported_id` on all pushes via `/import`.

**Gate:** typing the same expense twice prompts; SMS for an already-typed
expense merges silently.

## Phase 8 — Polish (target: 90 min)

- Empty states everywhere.
- Error banners.
- Snackbar undo on save.
- Haptics.
- Theme refinement (light + dark side-by-side check).
- Bottom-nav transitions.

**Gate:** every screen looks done. No "coming soon".

## Phase 9 — Verify and harden (target: 60 min)

- Unit tests for parsers, dedupe, AI mapping.
- Widget tests for Quick Entry and Inbox.
- `flutter analyze` zero warnings.
- `flutter build apk --debug` succeeds.
- `flutter build ios --debug --no-codesign` succeeds.

**Gate:** can hand the APK to someone and have them run it.

## Cut lines (if time runs short)

In priority order, what stays vs what gets pushed to v1.1:

| Stays | Cut |
|---|---|
| Onboarding | Multi-budget switching |
| Form-mode Quick Entry | Type-mode AI (cut Phase 5) |
| Lists + detail + edit | Background workmanager (run only on resume) |
| Manual sync (pull on refresh) | Account/category create from app |
| SMS regex for top 3 banks | LLM SMS fallback (cut from Phase 6) |
| Local pre-write dedupe | Auto-merge SMS — leave as Inbox prompt |
| Empty/error states | Animations beyond stock |
| Light + dark | Per-account colour custom theming |

Phases 1–4 are non-negotiable: that's the minimum loop (connect, log,
sync, view).

## Test seeds we need

For development without an Actual server, we ship a `--seed` flag that
populates the local DB from `assets/seed.json` and pretends sync is paused.
Lets us iterate UI without standing up Docker on the dev machine.
