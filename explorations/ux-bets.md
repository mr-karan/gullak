*The app described here has since been renamed **Chavanni** (formerly Gullak).*

# Gullak — UX bets (prioritized)

> Deliverable of the exploration brief (`explore-brief.md`). Grounded in the
> post-overhaul codebase (design.md phases 1–9 shipped). Every bet is framed
> against the three product goals — glanceable visuals, frictionless capture,
> reports that answer questions — plus the FOSS/F-Droid pivot: a stranger with
> **no server** must have a great first hour. Paid cloud is out of scope.
>
> Format per brief §6: problem → flow → grounding (files + invariant check) →
> scope → owner decisions. Ranked by daily-life impact; cut list at the end.

---

## Bet 1 — Zero-thought repeat capture: recent-payee chips in Quick Entry

**Rank #1 · Scope S–M · Goal 2 (frictionless capture)**

### Problem

The 90% real-world entry is *amount → known payee → save*. Today that path is
amount (keypad) → tap payee chip → **search/scroll a full picker** → save.
Payee memory already auto-fills account+category once a payee is picked
(`_onPayeePicked` fetches hints and applies them —
`app/lib/features/entry/quick_entry_form.dart:272–300`), so the picker is the
only slow step left. The data to skip it already exists: payees carry a
`useCount` bumped on every save and the repo already orders by it
(`app/lib/features/payees/data/payee_repository.dart:25,106–108`).

### Flow

A single horizontal strip of the top-N payees appears between the segmented
control and the context-chip row, only while no payee is set:

```
            ₹ 4 5 0
      [ Expense | Income | Transfer ]

  RECENT   (Blinkit) (Swiggy) (Auto) (Chaayos) (…)   ← top ~6 by useCount,
                                                        expense mode only
  (🏦 HDFC) (Category?) (@ payee) (📅 Today) …        ← existing chip row
```

- Tap a recent chip → runs the existing `_onPayeePicked` path → account +
  category fill from memory → Save button already names the action
  ("Save ₹450 to HDFC"). **Total: amount digits + 2 taps.**
- Strip hides once a payee is set (it answered its question) and in
  Transfer mode. On a fresh install with <3 payees it doesn't render — no
  empty-state needed, strangers see nothing half-baked.
- Stretch (same bet, second commit): long-pressing a recent chip pre-fills the
  payee's **modal amount** (most frequent amountCents for that payee this
  quarter — one GROUP BY query). Auto ₹40, chai ₹30: capture becomes 1 tap +
  save. Only pre-fill when the keypad is still at 0.

### Grounding

- `app/lib/features/entry/quick_entry_form.dart` — chip row build (~:530),
  `_onPayeePicked` (:272), save path untouched (:306+). This is where design.md
  wants the `entry/widgets/` split anyway; the strip can land as the first
  extracted widget.
- `app/lib/features/payees/data/payee_repository.dart:25` — `useCount`
  ordering already exists; add `topPayees({limit})` and (stretch) a
  modal-amount query on `transactions`.
- `app/lib/features/entry/entry_memory.dart:22–66` — hint resolution reused
  verbatim.
- **Invariants:** read-only queries + existing save path; no schema, no sync
  impact, fully offline. ✅

### Owner decisions

1. Recency vs frequency ranking? Recommend frequency (`useCount`) with a
   90-day transaction filter so dead payees age out — one query, no new state.
2. Does the strip earn Home-FAB-adjacent space, or should it live *inside*
   the payee picker as a "recent" row? Recommend in-sheet strip: the picker
   opening at all is the friction.
3. Ship the amount-prefill stretch now or after the strip proves itself?
   (Recommend after — it's the only part with guess-wrong risk.)

---

## Bet 2 — Inbox chips you can fix, and fixes that teach rules

**Rank #2 · Scope M · Goal 2 + shrinks the review pile permanently**

### Problem

Triage cards show suggested account/category chips but they're display-only
(design.md Phase 8 deferred item). One wrong guess forces the full Quick Entry
sheet — the exact "modal-in-modal" cost the overhaul removed elsewhere. Worse,
the correction is *thrown away*: confirm doesn't write payee memory, so next
month's Swiggy SMS makes the same wrong guess. The learning loop that manual
entry has (`rememberPayeeMapping` → synced rule,
`app/lib/features/entry/entry_memory.dart:36–66`) is missing from the highest-
volume inflow.

### Flow

```
┌──────────────────────────────────────────┐
│ 🏦 HDFC Bank · AD-HDFCBK                 │
│ ₹1,240                        2 Jul      │
│ (🏦 HDFC ✓) (🍔 Eating Out ▾) (@Swiggy)  │ ← chips now tappable
│         [ Dismiss ]  [ Confirm → ]       │
└──────────────────────────────────────────┘
   tap category chip:
┌──────────────────────────────────────────┐
│  Fix category for Swiggy                 │ ← anchored mini-picker
│  ◉ Eating Out   ○ Groceries  ○ …         │   (same picker widget QE uses)
│  [✓] Always use this for Swiggy          │ ← writes the synced rule
└──────────────────────────────────────────┘
```

- Chip tap opens the **same** category/account picker Quick Entry uses, as a
  small sheet. Selection updates a per-row draft override; the card chip
  re-renders with the fix; Confirm books with the override.
- The "always use this" checkbox (default **on** when a payee is present)
  calls `rememberPayeeMapping` — the same synced rule manual entry writes. Over
  weeks, Ready-bucket precision rises and triage becomes confirm-all.
- No schema change: overrides live in a Riverpod
  `Map<int smsId, SmsDraftOverride>` held by the Inbox controller until
  confirm; `confirmFromTransaction`
  (`app/lib/features/inbox/data/sms_repository.dart:477`) already accepts an
  explicit draft, so the confirm path just merges the override before calling
  the existing `_confirmOne`/`confirmFromTransaction` machinery (:438–604).
  Overrides die with the screen — acceptable, they're one-tap to recreate.

### Grounding

- `app/lib/features/inbox/inbox_screen.dart` (1,153 lines) — card chips.
- `app/lib/features/inbox/data/sms_repository.dart:438–604` — confirm paths;
  `confirmAllPreview` (:736) must reflect overrides in its forecast.
- `app/lib/features/entry/entry_memory.dart:36` — rule write, already synced
  via `rule_repository`.
- **Invariants:** the booked transaction still goes through the normal repo →
  change-log; rules are already a synced resource. Overrides are ephemeral UI
  state, not financial rows. ✅

### Owner decisions

1. Ephemeral overrides (above) vs persisting them on the `sms_messages` row?
   Recommend ephemeral first — YAGNI until someone loses an override to a
   process death mid-triage.
2. "Always use this" default-on: is silent rule creation acceptable, or should
   it be opt-in? (Recommend on + the rule visible/deletable in the existing
   Rules screen, `app/lib/features/rules/rules_screen.dart`.)
3. Should a category fix also apply to *other pending rows with the same
   payee* in the queue right now? (Cheap, delightful; recommend yes with a
   snackbar "Applied to 3 more Swiggy rows".)

---

## Bet 3 — Proactive insights: trend nudges + recurring-spend detection (all local, no LLM)

**Rank #3 · Scope M · Goal 1 & 3 (glanceable + answers questions)**

### Problem

Insights renders the month; it never *notices* anything. Daily Review
(`dailyReviewProvider`, `app/lib/features/home/home_screen.dart:586–633`)
nudges only about chores (SMS, uncategorised, budget %). Nobody tells the user
"Eating Out is +45% vs your average" or "you pay Netflix ₹649 every month —
track it?". Recurrences exist as a *manual* feature with a solid `postDue`
poster (`app/lib/features/recurrences/data/recurrence_repository.dart:95`) but
nothing detects recurring spend from history. Critically, all of this is plain
SQL over local Drift — it works with **no server**, which makes it the best
"smart" story the FOSS build can tell.

### Flow

Three surfaces, one new local analyzer:

1. **Daily Review gains at most one "notice" row** (keep the card quiet):

   ```
   ┌ Needs attention ─────────────────────┐
   │ ◦ 3 SMS ready to confirm         →   │
   │ ◦ Eating Out ₹4.2K — 45% above       │
   │   your 3-month average           →   │  → Insights, category scoped
   └──────────────────────────────────────┘
   ```

   Extend `DailyReviewSnapshot.items` (`home_screen.dart:526–583`) with a
   `notices` slot fed by the analyzer; cap at 1/day, suppress below a floor
   (e.g. ₹500 delta AND 30%) so it never nags about ₹80 chai variance.

2. **Insights: "This month vs usual" section** under the headline stats
   (`app/lib/features/reports/reports_screen.dart` — new section between
   stats and daily bars): 2–4 text rows, reusing the existing eyebrow + row
   language. Categories with |Δ| ≥30% vs trailing-3-month mean, biggest first,
   each tappable into the existing category drill
   (`scoped_transactions_view.dart`).

3. **Recurring detection → suggestion, not automation.** Analyzer flags
   candidate subscriptions: same normalized payee, amount within ±10%,
   near-monthly cadence, ≥3 occurrences. Surfaces as a ghost row in the
   Recurrences screen and (once per candidate) a Daily Review notice:
   "Netflix looks like a monthly ₹649 — track it?" → one tap creates the
   Recurrence row via the existing repo, then `postDue` owns it. Dismiss =
   never suggest that payee again (a prefs set, like other one-shot flags).

### Grounding

- New: `app/lib/features/reports/data/insights_analyzer.dart` — three SQL
  aggregates (category month-vs-mean; payee cadence scan; new-payee ranks).
  All against Drift; no server, no LLM.
- `app/lib/features/home/home_screen.dart:497–633` — notice row.
- `app/lib/features/recurrences/` — suggestion ghost row + create.
- **Invariants:** read-only analysis; the only write is a user-confirmed
  Recurrence row through the existing repo (change-logged). Money math stays
  integer minor units; month bounds by lexicographic `YYYY-MM-DD`. ✅

### Owner decisions

1. Thresholds (Δ%, minimum ₹, cadence tolerance) — ship as constants, not
   settings. Which floor feels right for your volume?
2. Does the recurring suggestion belong in Daily Review, or only as the ghost
   row in Recurrences? (Recommend both; Review is where it gets seen.)
3. Anomaly direction: spend-up only, or also "unusually quiet" months?
   (Recommend up-only; "you spent less" is noise.)

---

## Bet 4 — Stranger-ready first run: capability gating + honest no-server mode

**Rank #4 · Scope S–M · FOSS launch gate — cheap insurance, real reviews**

### Problem

The app was tuned for one homelab. An F-Droid stranger who skips the sync step
hits dead ends dressed as features: **Describe/Scan buttons render regardless
of server config** (`app/lib/features/entry/quick_entry_form.dart:662–675`)
and only fail at tap-time when the extractor is null
(`quick_entry_describe.dart:82,130`; `PiAiClient.fromSecure` returns null with
no base URL — `app/lib/data/ai/pi_ai_client.dart:14,37`). The SMS primer
promises parsing "on your own sync server" mid-onboarding before the user has
decided on a server (`onboarding_flow.dart:405,440`), and the welcome tagline
says "syncs nowhere" (:267) two screens before offering sync. First
impressions are exactly what F-Droid reviews are made of.

### Flow

1. **One capability provider**, used everywhere:
   `aiCapabilityProvider = piAiClientProvider != null` (it already exists in
   shape — `pi_ai_client.dart:395`). Gate: Describe/Scan buttons, the SMS
   Inbox badge + primer step, and the WhatsApp settings row. Ungated surfaces
   never advertise what the build can't do.
2. **Replace hidden with taught:** where a gated surface *would* be, show one
   quiet affordance once — e.g. Quick Entry overflow gains "✨ AI entry —
   needs your sync server →" linking to Settings → Sync. The existing
   "What's a sync server?" expandable copy (`onboarding_flow.dart:570`) is
   reused as the explainer.
3. **Onboarding re-order for strangers:** currency → first account → sync
   (skippable, "add later in Settings") → SMS primer **only if** Android AND
   (server set OR user opted anyway). Fix the tagline ("Lives on your phone.
   Syncs only to a server you run." — true either way).
4. **First-run Home empty state** teaches the FAB: seeded categories already
   exist (`onboarding_flow.dart:639–677` seeds 16), so the only missing beat
   is Recent's empty state pointing at "Add your first expense" with the FAB
   visually referenced, and the hero showing ₹0 gracefully (verify count-up
   handles zero without looking broken).

### Grounding

- `app/lib/data/ai/pi_ai_client.dart:37,395` — null-when-unconfigured is the
  capability signal; no new plumbing.
- `app/lib/features/entry/quick_entry_form.dart:662–675`,
  `quick_entry_describe.dart:82,130` — gate + explainer.
- `app/lib/features/onboarding/onboarding_flow.dart:267,405,515` — copy +
  step order; `_SmsPrimer` conditional.
- `app/lib/ui/widgets/empty_state.dart` — existing component; audit pass over
  Home/Activity/Insights/Budget/Inbox empties with no-server assumptions.
- **Invariants:** presentation-only; offline-first is *strengthened*. ✅

### Owner decisions

1. When no server is set, should SMS capture (server-parsed pipeline) be
   offered at all on Android? Recommendation: hide SMS surfaces entirely until
   a server passes its health check — a permission prompt for a feature that
   can't run is the worst first-run moment. (Note: with the server-only SMS
   pipeline, SMS is a *server* feature now; onboarding should say so.)
2. Is a "try it with sample data" mode worth it? Recommend **no** (cut list) —
   seeded categories + a good empty Home is enough; sample data pollutes real
   ledgers and doubles every empty-state path.

---

## Bet 5 — Duplicate transparency: show the match, offer the link

**Rank #5 · Scope S–M · Trust ("does this match my bank") + goal 2**

### Problem

The pipeline already does careful duplicate work: an SMS matching a manual
entry by amount ±1 day **plus** a corroborating account/payee gets silently
linked; a bare amount+date coincidence is flagged `ambiguous` and routed to
the Inbox (`app/lib/data/sms/sms_pipeline.dart:596–658`). But the UX discards
that intelligence: an ambiguous row's triage card looks identical to any other
— the user isn't told "this might be your manual ₹450 entry", so they either
re-book (double count) or dig through Activity to check. Double-count anxiety
is the #1 trust leak for an SMS-heavy ledger.

### Flow

```
┌──────────────────────────────────────────┐
│ 🏦 Kotak · KM-KOTAKB          ₹450  2 Jul│
│ ⚠ Looks like a spend you already logged: │
│ ┌──────────────────────────────────────┐ │
│ │ 🛒 Blinkit · Groceries · ₹450 · 2 Jul│ │ ← the suspected row, tappable
│ └──────────────────────────────────────┘ │
│ [ Same — link it ]   [ Different spend ] │
└──────────────────────────────────────────┘
```

- "Same — link it" marks the SMS row matched to that transaction id (the
  same terminal state the auto-link path produces) — no new transaction.
- "Different spend" clears the flag; card reverts to the normal confirm card.
- Detail screen (receipt view) of an SMS-origin transaction already links via
  `originRef`; add the inverse breadcrumb on a *linked manual* transaction:
  a quiet "Verified by bank SMS ✓" chip — a free trust moment from data that
  already exists.

Implementation shape: don't persist a new column; at Inbox load, re-run
`_findDuplicateTransaction` (or a repo twin) for rows in the ambiguous state
and attach the candidate row(s) to `InboxItem` in memory. The pipeline already
computes `ambiguous` at ingest (`sms_pipeline.dart:611`) — reuse the same
query at render time so results can't drift.

### Grounding

- `app/lib/data/sms/sms_pipeline.dart:596–658` — matcher to extract/share.
- `app/lib/features/inbox/data/sms_repository.dart:21–56` (`InboxItem`),
  confirm/dismiss paths :438–604; add a `linkTo(transactionId)` terminal op
  mirroring what auto-link sets.
- `app/lib/features/transactions/transaction_detail_screen.dart` — "verified"
  chip (SMS source card already exists per design.md §4.4).
- **Invariants:** linking mutates only SMS-review state (local, not part of
  financial sync); no transaction rows created/changed, so no change-log
  question. ✅

### Owner decisions

1. Link action semantics: should linking also backfill the manual row's
   `originRef` to the SMS (making the "verified" chip possible)? That *is* a
   transaction mutation → needs change-log + LWW awareness. Recommend yes,
   via the normal repo update.
2. Show at most one candidate or all same-amount candidates? (Recommend one,
   newest-first like the matcher; a chooser for the rare multi-hit.)

---

## Bet 6 — Balance reconciliation from SMS balance hints

**Rank #6 · Scope M · Trust — "does the app match my bank," answered daily**

### Problem

Indian bank SMS routinely end with "Avl Bal: ₹1,18,432.10". The parser throws
that away, yet it's a free, continuous reconciliation signal: if the app's
computed account balance drifts from the bank's stated balance, the user has
missing/duplicate entries — today they'd only discover it comparing statements
by hand. Nothing in the app answers "is this number real?"

### Flow

1. Parser emits an optional `balanceHintMinor` + `balanceAsOf` alongside the
   existing candidate fields (server prompt + schema change; draft-only, so
   compatible with the "AI routes never mutate financial rows" rule —
   `pi-server/src/ai/sms_parser.ts`).
2. App stores the latest hint **per account** in a small local table (or kv):
   `(accountId, balanceMinor, asOfMs, smsId)` — advisory data, not synced
   financial state.
3. Account detail + Home accounts strip surface drift only when it exists:

   ```
   ACCOUNTS
   [HDFC ₹1.18L ⚠] [Cash ₹3.4K] [CC −₹12K]
        │
        └ tap → account detail banner:
   ┌────────────────────────────────────────┐
   │ Bank last reported ₹1,18,432 (2 Jul)   │
   │ Gullak computes   ₹1,20,890            │
   │ Off by ₹2,458 · [Find missing entries] │ ← Activity filtered to account,
   └────────────────────────────────────────┘    since last-matching date
   ```

4. When they agree (within ₹1), show nothing — or a tiny "✓ matches bank"
   on account detail. Silence is the reward.

### Grounding

- `pi-server/src/ai/sms_parser.ts` — prompt/schema addition; regex fallback
  for the common "Avl Bal/Avl Bal:/Bal:" formats is cheap and reduces LLM
  dependence.
- `app/lib/data/sms/sms_pipeline.dart:495` (`_applyParsed`) — persist hint.
- `app/lib/features/accounts/account_detail_screen.dart`,
  `home_screen.dart:130` (`_AccountsStrip`) — drift surfaces.
- **Invariants:** hints are advisory local state — never mutate balances, no
  change-log, integer minor units for the hint. Parser stays draft-only. ✅
  Requires a server, so all surfaces gate behind Bet 4's capability provider.

### Owner decisions

1. Sync the hint table to the partner device or keep it per-device local?
   (Recommend local — the SMS-receiving phone is the only authority.)
2. Auto-offer an "adjustment entry" to zero the drift? Recommend **no** for
   v1 — reconciliation is a reading aid; fabricated balancing entries are how
   ledgers rot.
3. Drift tolerance (pending UPI settles a day late) — compare against balance
   *as of the SMS timestamp* or a ±1-day window?

---

## Bet 7 — Insights payee layer: "who am I actually paying?"

**Rank #7 · Scope S · Goal 3 — the one design.md §4.5 section that never shipped**

### Problem

design.md §4.5 spec'd six Insights sections; five shipped. The missing one —
top payees — is the question categories can't answer: "Eating Out is ₹6K" is
abstract, "Swiggy ₹3.8K across 14 orders, up from 9" is actionable. The
current `reports_screen.dart` has stats, daily bars, category bars, 6-month
pairs, heatmap (`app/lib/features/reports/reports_screen.dart:140–226`) — no
payee section (grep confirms zero payee references in the file).

### Flow

New eyebrow section between "By category" and "Month vs month":

```
TOP PAYEES
Swiggy        14×   ₹3,840   ▲ +₹1,120
Blinkit       11×   ₹2,910   ▬
Uber           6×   ₹1,480   ▼ −₹340
Chaayos        5×     ₹720   NEW
             …tap → payee-scoped transaction list
```

Top-5 by spend for the period, count, Mono amount, delta vs prior period
(reuses Bet 3's month-vs-mean queries if both land; standalone otherwise).
Tap → `scoped_transactions_view.dart` (payee scope exists per design.md §4.5).
Text rows only — no new chart primitive, per the "charts never carry
information alone" rule this section *is* the text.

### Grounding

- `app/lib/features/reports/reports_screen.dart` — one new section + provider.
- `app/lib/features/transactions/scoped_transactions_view.dart` — drill.
- **Invariants:** read-only aggregate; group by `payee_id` with `payee_name`
  fallback for id-less rows. ✅ Works offline.

### Owner decisions

1. Group by payee id or normalized name? (Id, falling back to name — SMS rows
   confirmed before payee-ensure may only carry names.)
2. Exclude transfers/splits from payee ranks (recommend: same exclusions the
   category bars use).

---

## Bet 8 — Category color unification (quick win, do alongside any of the above)

**Rank #8 · Scope S · Goal 1 — one category, one color, everywhere**

### Problem

Named in both design.md and the brief: Activity/detail hash the category
*name* (`categoryAccentColor`,
`app/lib/features/categories/category_visuals.dart`) while Insights/Budget
hash the *id* (`categoryColor`, `app/lib/ui/category_palette.dart`). The same
"Groceries" renders different hues across screens — a small thing that quietly
undermines the "same color everywhere" promise the palette was built for, and
it costs recognition speed on every glance (goal 1 is literally glanceability).

### Flow

No new UI. Plumb `categoryId` through `TransactionListItem` (the known
blocker), point Activity/detail at `categoryColor(scheme, id)`, delete or
deprecate `categoryAccentColor`. Add one golden test asserting Activity row
swatch == Insights bar swatch for the same category id.

### Grounding

- `app/lib/features/categories/category_visuals.dart:4`
  (`categoryAccentColor`, name-hash),
  `app/lib/ui/category_palette.dart:43` (`categoryColor`, id-hash),
  `app/lib/features/transactions/transactions_screen.dart` (row model).
- **Invariants:** pure presentation. ✅ Users' remembered colors will shift
  once — ship it before F-Droid strangers form habits, not after.

### Owner decisions

None of substance; just sequencing (piggyback on whichever bet touches
`transactions_screen.dart` first — Bet 5 or 7).

---

## Ranking rationale (one screen)

| # | Bet | Loop stage | Scope | Why this order |
|---|-----|-----------|-------|----------------|
| 1 | Recent-payee chips | capture | S–M | Highest-frequency action in the app; data already exists; pure win |
| 2 | Inbox chip-fix + rule learning | review | M | Turns every correction into future auto-resolution; compounds |
| 3 | Proactive insights + recurring detection | insight | M | Biggest "app feels smart" jump; fully offline — flagship FOSS story |
| 4 | Stranger-ready first run | all (new users) | S–M | Launch gate for F-Droid; cheap; protects the reviews that decide adoption |
| 5 | Duplicate transparency | review/trust | S–M | Fixes the scariest failure mode (double counting) with logic that already exists |
| 6 | Balance reconciliation | trust | M | Genuinely differentiating for India/SMS users; needs server + parser change, so after 4 |
| 7 | Insights payee layer | insight | S | Finishes the shipped design's own spec; small and safe |
| 8 | Category color unification | polish | S | Known debt; do opportunistically |

Suggested batches: **1+2** (capture/review sprint), **4+8** (pre-F-Droid
polish), **3+7** (insight sprint), **5+6** (trust sprint).

---

## Cut these (shiny, low daily-life value — with reasons)

- **In-app chat assistant ("Ask Gullak").** The server agent + 5 ask tools
  exist (`pi-server/src/agent/agent.ts`, `ask_tools.ts:16–21`) and it's
  tempting to surface them in-app. But the ask tools answer questions Insights
  already renders (month spend, category spend, budgets, balances), WhatsApp
  already owns the conversational surface, and an in-app chat is a whole new
  surface competing with — and excusing weaknesses in — Insights. Bet 3 makes
  Insights answer questions *without* typing. Revisit only if ask-tool usage
  on WhatsApp shows question shapes Insights can't render.
- **Home-screen widget / quick-settings tile.** design.md already ruled it
  "its own project"; the launcher shortcut (`quick_actions`, `main.dart:125`)
  covers the fast-path. A widget is a second rendering stack (Glance/RemoteViews)
  for one saved tap.
- **Notification-listener capture (UPI app notifications).** Real idea, wrong
  track: it's release-engineering for the *Play* SKU (release.md §4), and the
  FOSS/F-Droid pivot keeps `READ_SMS` legal. Building two capture pipelines
  before the SMS one is fully polished violates the brief's depth-over-breadth
  rule.
- **Household/shared-ledger UX & per-device attribution.** Two devices sync
  fine on LWW today; a solo-use app doesn't need member chips, and per-device
  attribution needs schema + sync-protocol changes for a question ("who logged
  this?") one household hasn't asked.
- **Sample-data / demo mode.** Doubles every empty-state path and pollutes
  real ledgers; seeded categories + Bet 4's empty states are the honest
  version.
- **Streaks/gamification, spending "scores".** Fights the product's soul; a
  ledger you trust doesn't nag you into opening it.
- **Donut/pie charts.** design.md already litigated this — `CategoryBars` is
  denser and more legible on phones; don't reopen it.
- **Anything Cloud.** Out of scope per the brief; release.md's multi-tenant
  plan stays parked.
