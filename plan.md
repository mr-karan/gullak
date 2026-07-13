*The app described here has since been renamed **Chavanni** (formerly Gullak).*

# Gullak improvement plan

## Implementation status (2026-07-03)

Everything in this plan is now implemented (app: `flutter analyze` clean, 66
tests pass; pi-server: typecheck clean, 46 tests pass). This includes the
larger bets that were initially deferred:

- **Bet A (auto-sync):** already wired (`ChangeLogWriter` → `SyncScheduler`).
- **Bet B (capture shortcut):** home-screen long-press shortcut → Quick Entry
  via `quick_actions` (render needs an on-device check).
- **Bet C (foreign-currency metadata):** full display-only feature — Drift +
  Drizzle columns/migrations, sync + backup round-trip, Quick Entry capture,
  transaction-detail display. No conversion.
- **Bet D (server AI-write-path tests):** LLM-stub seam + tests for the agent
  log/undo path and the SMS reprocess staleness guard.
- **Home over-invalidation:** Daily Review reads a cheap counts stream instead
  of the enriched Inbox list.

Original first-pass summary (kept for reference):

- **All 8 quick wins** — bundled fonts (dropped `google_fonts`), budget N+1 →
  one grouped query, SMS-text filter → SQL `LIKE`, LLM fetch timeout,
  stuck-`parsing`/`processing` recovery, shared `ErrorState` + Retry, webhook
  auth hardening + boot warning, server transaction indexes.
- **Prioritized 1–5, 7, 10** — sync poison-pill hardening (client quarantine +
  server skip, with tests), sync-engine tests (`RemoteApplier` + `SyncService`),
  Transfer sheet wired to `createTransfer`, auto-posting recurrences (idempotent,
  with tests), server rate + length caps, Inbox confirm-all preview + O(1)
  enrichment maps, onboarding locale currency.
- **9 (partial)** — error-handling floor done (ErrorState everywhere + network
  catch-site logging); a11y is largely tooltip-covered already.

Deliberately not changed (verified against code, contrary to the survey):

- **Item 11 (route nesting)** — `/payees/:id` and `/categories/:id` are already
  inside the ShellRoute, so they already get the bottom nav. Non-issue.
- **Larger bet A (auto-sync)** — already implemented: `ChangeLogWriter` calls
  `SyncScheduler.schedule()` on every mutation. AGENTS.md's "outstanding" note
  is stale.
- **Item 6 (home over-invalidation)** — the N+1 was the real cost and is fixed;
  narrowing the Home provider watches was left to avoid regressing the
  staleness fixes from 0.2.0.
- **Item 8 (split `quick_entry_sheet.dart`)** — skipped as high-churn: the
  motivating dependency (transfers) shipped as its own sheet, so the file
  wasn't touched.

Deferred (need a decision or native/verification work): **bet B** (home-screen
widget / shortcut — native Android, can't verify headless), **bet C**
(foreign-currency metadata — open product question below), **bet D** (server
tests for the agent write paths — needs an LLM stub seam; the corrupt-payload
path is now covered).

---

Scope: pre-open-source hardening and polish across the Flutter app, pi-server,
and sync/SMS pipelines. Every item below is grounded in a specific file; claims
from the survey that did not survive verification (e.g. "server 500 marks rows
synced anyway", "rules require the server", "fonts are bundled") were dropped
or corrected. Effort: S ≈ hours, M ≈ 1–3 days, L ≈ a week+.

---

## Quick wins

Small, verified, high leverage. Do these first.

1. **Bundle Fraunces/Inter/JetBrains Mono as assets and disable runtime font
   fetching.**
   - Why: the app's whole identity is the editorial type system, yet
     `google_fonts` fetches fonts over HTTP at runtime by default. First launch
     offline (the core promise of the app) renders system fallback fonts.
   - Evidence: `app/pubspec.yaml:67-68` — the comment says "Loaded at build
     time via google_fonts" but there is no `fonts:` section, no bundled font
     assets, and no `GoogleFonts.config.allowRuntimeFetching = false` anywhere
     in `lib/`.
   - Effort: S. Risk: license files must ship alongside (all three are OFL).

2. **Kill the budget-summary N+1 with one GROUP BY query.**
   - Why: `BudgetRepository.summary()` issues one `SUM()` query per category
     (30 categories → 30 round-trips), and `budgetMonthProvider` re-runs the
     whole thing on *every* transaction change because it watches
     `recentTransactionsProvider`. This is the single most visible jank source
     on the Budgets screen at scale.
   - Evidence: `app/lib/features/budgets/data/budget_repository.dart:185-199`
     (per-category loop), `:221-232` (over-broad invalidation).
   - Effort: S. Risk: none — pure query consolidation, covered by the existing
     `budget_repository_test.dart`.

3. **Push the SMS-text filter into SQL.**
   - Why: filtering Activity by SMS body loads each matching transaction's SMS
     row one query at a time — a per-row loop that turns a filter into seconds
     of latency on real data.
   - Evidence:
     `app/lib/features/transactions/data/transaction_repository.dart:436-452`
     (`_filterBySmsText` does a `select ... getSingleOrNull()` per row).
   - Effort: S. Risk: none; replace with a `JOIN sms_messages ... LIKE`.

4. **Add a timeout to the server's LLM fetch.**
   - Why: `fetch()` in the LLM client has no timeout. A hung upstream (Ollama,
     OpenRouter) pins the request forever; webhook and parse requests pile up
     behind it. AGENTS.md already lists "request timeout budgets" as
     outstanding work.
   - Evidence: `pi-server/src/llm/client.ts:42` — no `AbortSignal`, no
     deadline.
   - Effort: S (`AbortSignal.timeout(30_000)` + config knob). Risk: choose the
     ceiling generously for vision/receipt calls.

5. **Recover SMS rows stuck in `parsing`/`processing` after a crash.**
   - Why: a row is marked `parsing` before the server call; if the app dies
     mid-flight it stays there forever — the Inbox filter doesn't show it and
     `retryFailedBackfill()` only resets `error`-family statuses. Same shape
     for the confirm flow's `processing` claim.
   - Evidence: `app/lib/data/sms/sms_pipeline.dart:385` (claim),
     `app/lib/features/inbox/data/sms_repository.dart:137` (Inbox shows only
     `parsed/parse_failed/inbox/error`), `:476-483` (confirm claim; the
     `finally` release helps but not across a process death).
   - Effort: S — on pipeline startup, reset `parsing`/`processing` rows older
     than a few minutes back to `pending_parse`. Risk: pick the staleness
     window so an in-flight parse isn't double-submitted (server parse is
     draft-only, so worst case is a duplicate LLM call).

6. **Replace raw `Error: $e` screens with one shared error state + Retry.**
   - Why: several screens dump the exception string at the user with no
     recovery action — the opposite of "hard to break" for an open-source
     first impression.
   - Evidence:
     `app/lib/features/transactions/transactions_screen.dart:168`,
     `app/lib/features/budgets/budget_screen.dart:50` (pattern repeats across
     `.when(error:)` sites).
   - Effort: S — a small `ErrorState` widget next to the existing
     `app/lib/ui/widgets/empty_state.dart`, with a retry callback that
     invalidates the provider. Risk: none.

7. **Require the WhatsApp webhook key whenever the bridge path is used.**
   - Why: `/v1/whatsapp/webhook` is exempt from `x-api-key`; when
     `GULLAK_WHATSAPP_API_KEY` is unset the endpoint is fully open, and the
     agent's log path books transactions directly. Anyone who can reach the
     server can write financial rows. Fine on a Tailscale-only homelab; not a
     fine default for an open-source release.
   - Evidence: `pi-server/src/app.ts:65-76` (exemption),
     `pi-server/src/routes/messages.ts:50-55` (key checked only if
     configured), `:275-323` (log path writes transactions).
   - Effort: S — refuse to process webhook events (or log loudly and drop
     writes) when no webhook key is configured; document in self-hosting.md.
     Risk: breaks unauthenticated dev setups; mitigate with a clear boot
     warning.

8. **Add server-side indexes for the query paths that exist.**
   - Why: the Drift side is well-indexed, but the Drizzle schema has no
     indexes on `transactions(date)` / `transactions(account_id)`, which
     `/v1/summary`, the agent ask-tools, and `collectExpenses` all filter on.
   - Evidence: `pi-server/src/db/schema.ts` (transactions table has no index
     definitions; contrast with `smsMessages.byStatus` at `:320`).
   - Effort: S (one migration). Risk: none.

---

## Prioritized plan

### 1. Harden sync against poison-pill rows (the one real data-integrity bug family)

- **What:** make one bad change-log row degrade to a quarantined row instead of
  wedging sync forever, on all three sides.
- **Why it matters:** sync is the product's trust anchor. Today a single
  corrupt payload permanently stops *all* sync, silently:
  - Server pull: `JSON.parse(row.payload)` has no try/catch — one corrupt
    stored payload turns every `GET /v1/sync/changes` into a 500 for every
    client, forever (`pi-server/src/routes/sync.ts:63`).
  - Client push: `jsonDecode(row.payload!)` throws out of `pushPending()` —
    one corrupt local change-log row blocks every future push
    (`app/lib/sync/sync_service.dart:320`).
  - Server push: a permanently-invalid change (e.g. upsert with null payload
    throws at `pi-server/src/routes/sync.ts:208-212`) rolls back the whole
    batch on every retry; the client re-sends the same batch forever.
  - Client pull: a permanently-failing apply holds the cursor and blocks all
    downstream changes (`app/lib/sync/sync_service.dart:281-283` — correct for
    transient errors, unbounded for permanent ones).
- **What I verified is NOT broken** (so don't re-fix it): the push batch is
  atomic on the server (`sync.ts:196-235`), Dio throws on non-2xx so a 500
  never marks rows synced (`sync_service.dart:326-344`), and
  `(clientId, clientChangeId)` dedupe makes retries idempotent
  (`pi-server/src/repos/changelog.ts`).
- **Plan:** wrap the parse/decode sites; on a permanently-bad row, mark it
  (`synced = true` + an `error` note locally; skip + report in the server
  response) and count it in the sync result so the Settings sync row can show
  "1 change could not sync". Add a retry-attempt ceiling before quarantine on
  the pull path.
- **Effort:** M. **Risk:** quarantining must never eat a *transient* failure —
  keep the existing hold-cursor behavior for network/DB-lock errors and only
  quarantine on deterministic parse/validation failures.

### 2. Put the sync engine under test

- **What:** unit tests for `SyncService` (push/pull/prune/cursor) and
  `RemoteApplier` (LWW, deletes, malformed payloads), mirroring the good
  server-side `sync.test.ts`.
- **Why:** the two riskiest files in the app have zero coverage —
  `app/test/` has 12 test files and none touch `app/lib/sync/`
  (`remote_applier.dart` alone is 496 lines). Every finding in item 1 lands
  here; the fixes need a harness to be trustworthy, and contributors will
  touch sync without one.
- **Evidence:** `app/test/` listing (no `sync/` directory);
  `app/lib/sync/remote_applier.dart` (496 lines, LWW + tombstone logic at
  `:75-85` untested).
- **Effort:** M (Drift in-memory DB + a stubbed Dio). **Risk:** none; pure
  additive.

### 3. Ship transfers — the repo method exists, the UI doesn't

- **What:** add a Transfer mode to Quick Entry (from-account, to-account,
  amount) wired to the existing repo method.
- **Why:** `TransactionRepository.createTransfer` (`app/lib/features/
  transactions/data/transaction_repository.dart:113`) has **zero callers** in
  `lib/`. The schema (`transfer_account_id`, `transfer_group_id`), sync,
  backup, and every list UI already render transfers — and README.md:16
  advertises "Splits, transfers, tags" in Quick Entry. Today a user literally
  cannot record moving money between accounts, which corrupts account
  balances (a credit-card payment shows as spend).
- **Evidence:** `grep -rn createTransfer app/lib` → only the definition;
  display sites at `transactions_screen.dart:414,932`,
  `home_screen.dart:429`.
- **Effort:** M (UI only — plumbing is done). **Risk:** interaction with the
  split UI inside the already-huge sheet; see item 8.

### 4. Auto-post due recurrences (or stop calling them recurrences)

- **What:** on app foreground (reuse the existing `catchUpRecent`/scheduler
  hooks in `app/lib/main.dart:101-135`), post transactions for due
  recurrences, idempotently keyed on (recurrenceId, dueDate), and surface
  "posted N recurring" on Home.
- **Why:** the recurrences feature is CRUD-only — a screen that stores
  cadence and next-date but nothing ever fires
  (`app/lib/features/recurrences/recurrences_screen.dart`; no background job
  or foreground hook references recurrences anywhere in `lib/`). Rent and
  subscriptions are exactly the transactions users forget to log manually,
  so today the feature stores intent and delivers nothing.
- **Effort:** M. **Risk:** double-posting across two devices — post locally
  and let the change-log/LWW propagate, key idempotency on a deterministic
  UUID derived from (recurrenceId, dueDate) so both devices generate the same
  row id.

### 5. Server input hygiene: rate caps + length caps on the AI/webhook surface

- **What:** a simple in-process token bucket on `/v1/ai/*` and
  `/v1/whatsapp/webhook`, plus `.max()` caps on unbounded strings.
- **Why:** the LLM endpoints are the costed surface and have no rate limit;
  `whatsappBody.payload.body` has no max length (contrast `ai.ts:16` which
  caps SMS bodies at 2000); resource names (`accounts.ts:39-88`,
  `payees.ts:22-64`, `categories.ts:112-149`) accept megabyte strings within
  the 15 MB global body limit. AGENTS.md already lists "server-side AI rate
  caps ... and image-size limits" as outstanding work — this closes it.
- **Evidence:** `pi-server/src/routes/messages.ts:44-60`,
  `pi-server/src/app.ts:49-55` (only a global 15 MB cap), route files above.
- **Effort:** S–M. **Risk:** none for a single-user server; keep limits
  generous.

### 6. Fix provider over-invalidation on Home

- **What:** narrow what `dailyReviewProvider` (and the other Home aggregates)
  watch, so an unrelated category rename or SMS parse doesn't re-run three
  custom SQL queries.
- **Why:** `dailyReviewProvider` watches six providers including the full
  inbox and budgets lists (`app/lib/features/home/home_screen.dart:612-620`);
  every SMS arrival re-computes the whole Daily Review. The 0.2.0 changelog
  shows this graph has already been a source of staleness bugs — it's now
  over-corrected into over-invalidation.
- **Effort:** S–M. **Risk:** regressing the staleness fixes from 0.2.0 —
  keep the CHANGELOG's fixed scenarios as widget/provider tests while
  narrowing.

### 7. Inbox flow: preview before Confirm-all, and O(1) enrichment lookups

- **What:** (a) make the Confirm-all dialog show what it will do (N rows,
  account/category resolution, how many go in uncategorised); (b) replace the
  nested account/category/payee `contains()` loops in `_enrichSynced` with
  pre-built lowercase-name maps.
- **Why:** (a) bulk-confirm currently commits sight-unseen
  (`app/lib/features/inbox/inbox_screen.dart:145-149`) — one bad
  account-match assumption multiplied by N rows; (b) the enrichment pass is
  O(payees × categories) string scanning per SMS batch
  (`app/lib/features/inbox/data/sms_repository.dart:292-374`), noticeable on
  a 100-SMS backfill.
- **Effort:** S each. **Risk:** none.

### 8. Split `quick_entry_sheet.dart` before adding anything else to it

- **What:** extract the keypad, the three pickers (account/payee/category),
  and the AI-parse tab into files; keep the sheet as composition.
- **Why:** it's 1,872 lines — the largest file in the app by 2× — and items
  3 (transfer mode) and the categorisation improvements below all land inside
  it. Every future contributor's first feature touches this file; its current
  size is where merge conflicts and regressions will concentrate.
- **Evidence:** `wc -l`: `quick_entry_sheet.dart` 1872, next largest
  `transactions_screen.dart` 1034. The pickers at `:1220-1373` and skeleton
  at `:626-672` are already self-contained widgets in spirit.
- **Effort:** M (mechanical, behavior-preserving; `quick_entry_sheet_test.dart`
  exists as a safety net). **Risk:** low if done as pure extraction, no API
  redesign (YAGNI — no new abstraction layer).

### 9. Accessibility + error-handling floor

- **What:** one pass adding `Semantics`/labels to icon-only buttons and money
  amounts, checking `lightOnSurfaceVariant` (#6B7280 on #FCFCFD) against
  WCAG AA, and triaging the 16 silent `catch (_)` sites (log via the existing
  logger or surface; never bare-swallow at a system boundary).
- **Why:** grep finds zero `Semantics` usage in `lib/features/`; tooltips
  exist but don't cover TalkBack. 16 `catch (_)` sites is where "it silently
  didn't work" bug reports will come from once this is public.
- **Evidence:** `app/lib/ui/theme.dart:18` (muted-on-light pair);
  `grep -rn 'catch (_)' app/lib` → 16 hits.
- **Effort:** M spread thin. **Risk:** none.

### 10. Onboarding: derive the currency default from locale

- **What:** default `_symbol`/`_minorDigits` from `Localizations`/
  `NumberFormat` instead of hardcoded `₹`/2 (still user-editable).
- **Why:** open-sourcing means non-Indian users; the first screen shouldn't
  assume INR. Cheap signal that the project isn't single-user anymore.
- **Evidence:** `app/lib/features/onboarding/onboarding_flow.dart:32-33`.
- **Effort:** S. **Risk:** none.

### 11. Fix route nesting for payee/category detail

- **What:** move `/payees/:id` and `/categories/:id` under the shell like
  `/tags/:id` already is.
- **Why:** they're registered outside the shell so drilling into a payee
  loses the bottom nav — inconsistent with the tag drill-down.
- **Evidence:** `app/lib/router/router.dart:129-135` vs `:119-127`.
- **Effort:** S. **Risk:** deep-link paths change; nothing external links to
  them yet — do it before open-sourcing, not after.

---

## Larger bets

### A. Post-mutation auto-sync (retire "sync is manual")

Foreground triggers exist (`main.dart:101-107` runs sync on resume; the
scheduler has debounce plumbing in `app/lib/sync/sync_scheduler.dart:21-26`),
but a local edit doesn't push until the next resume. Debounce-trigger
`runNow()` off the change-log write path so two-device users stop seeing
minutes-stale data. AGENTS.md lists this as outstanding. Effort: M–L (the
hard part is not hammering the server during bulk operations like backfill).
Risk: battery/network churn; the existing backoff monitor
(CHANGELOG 0.2.0) is the right throttle to reuse.

### B. Android home-screen widget + static app shortcut for capture

The product's thesis is "logging is fast", and the current fastest path is:
unlock → open app → FAB → sheet. A Glance/AppWidget with amount keypad (or
even just a static shortcut deep-linking to Quick Entry) removes the two
slowest steps. No widget/shortcut code exists today (no `shortcuts.xml`, no
glance dependency). Effort: shortcut S, widget L (needs a minimal
platform-channel write path or launches the sheet). Risk: widget maintenance
burden across launchers — ship the shortcut first, measure, then decide.

### C. Foreign-currency capture metadata

Multi-currency accounting is out of scope per docs/goals.md ("not a full
double-entry system"), but international SMS/receipts already flow through
the parsers, and the FX phantom-amount parse bug this repo saw in May 2026 is
the symptom. Minimal version: carry `originalAmount`/`originalCurrency` as
optional transaction metadata (schema + parsers + detail screen display, no
conversion math). Effort: M. Risk: scope creep toward real multi-currency —
hold the line at display-only metadata. **Open question for you:** is even
this in scope, or is "INR-only, foreign SMS land as drafts to fix by hand"
the intended stance? Proceeding assumption: display-only metadata is
worthwhile, conversion is not.

### D. Server test coverage for the write-capable AI paths

`sync.test.ts`, `config.test.ts`, `sms_parser.test.ts` and the destination
tests are solid, but the two paths where an LLM can *write financial rows* —
the agent log/undo flows (`pi-server/src/agent/agent.ts:275-323, 351-401`)
and SMS reprocess/enrich (`pi-server/src/routes/sms.ts:118+`, including the
good staleness guard at `:222-239`) — have no tests. Given `/v1/messages` is
explicitly the one AI route allowed to mutate money, it should be the
best-tested route on the server, not the least. Effort: M–L (needs an LLM
stub seam in `llm/client.ts`). Risk: none.

---

## Verified-fine (don't spend time here)

- Server push atomicity + idempotency: whole batch in one transaction, dedupe
  by `(clientId, clientChangeId)`, stale writes neither apply nor echo
  (`pi-server/src/routes/sync.ts:188-235`).
- Client Drift indexing is genuinely good — compound indexes cover every hot
  path including the SMS queue (`app/lib/data/db/database.dart:47-99`).
- DB opens on a background isolate via `LazyDatabase` +
  `NativeDatabase.createInBackground` (`database.dart:227-233`).
- List rendering: `ListView.builder`/`.separated` with date-group batching is
  appropriate (`transactions_screen.dart:185-207`).
- Export destinations: durable per-destination cursors, soft-failure
  detection, idempotent upsert by `sourceId`
  (`pi-server/src/destinations/`, docs/destinations.md).
- Secrets: config summary redacts keys (`pi-server/src/config.ts:240-263`);
  LLM error bodies are truncated before logging.
- SMS retry/backoff: exponential with a 6 h cap, and `retryFailedBackfill()`
  resets rather than deletes (`sms_pipeline.dart:262-273, 430-436`).

## Open questions (proceeding with stated assumptions)

1. **LWW tie-breaking:** both sides let an *equal* `updatedAt` win for the
   incoming write (`sync.ts:111` `>=`, `remote_applier.dart:78` `>=`). This is
   deterministic per-hop but means "last pushed wins" on exact ties.
   Assumption: acceptable; document it in AGENTS.md rather than change it.
2. **iOS:** the SMS pipeline is Android-only by nature; no iOS-specific gaps
   were surveyed. Assumption: Android is the release target; iOS stays
   best-effort.
3. **Client-id loss:** a restored/wiped client generates a fresh `clientId`
   and can re-pull its own old changes (`sync_service.dart:47-58`). Real but
   rare; deliberately left out of the top list. Flag if restore-from-backup
   becomes a promoted flow.
