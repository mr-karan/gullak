
# Gullak UI overhaul — design specification

## Implementation status (2026-07-03)

Shipped and pushed (app `flutter analyze` clean, 75 tests green), each phase its
own commit:

- **Phase 1 — Foundations:** `ui/category_palette.dart`, `ui/motion.dart`,
  shimmer `Skeleton`, `CountUpMoney`, `MoneyText` semantics, WCAG-AA contrast fix.
- **Phase 2 — Chart kit:** `ui/charts/` — Sparkline, BarChart (tap + tooltip),
  CategoryBars, ProgressArc, HeatmapCalendar, with structural/semantic tests.
- **Phase 3 — Nav:** bottom nav 6→4 (Home/Activity/Insights/Budget); Inbox is an
  app-bar count badge; Tags/Accounts moved to the Settings hub.
- **Phase 4 — Home:** count-up "spent this month" hero + 30-day sparkline, one
  support line, Daily Review card, account-balance strip, Recent.
- **Phase 5 — Insights:** rebuilt Reports on the chart kit (daily bars, category
  bars, 6-month paired bars, heatmap); `ErrorState` for error slots.
- **Phase 7 (detail) — receipt-style transaction detail** (glyph, hero amount, FX chip).
- **Phase 8 (budget) — category-coloured progress rings.**
- **Phase 6 (core) — Quick Entry redesign, device-verified:** cryptic +/- swapped
  for an **Expense/Income segmented control** (tints to match the amount); the four
  stacked picker rows became a compact **context-chip row** (account/payee/category/
  tags — set chips fill with the category's own accent); the Save button now
  **names the action** ("Save ₹450 to Kotak UPI") as a wrong-account guard. Save
  path untouched; `quick_entry_sheet_test.dart` green.
- **Phase 7 (Activity) — device-verified:** the 5-way mode control collapsed to
  three view modes (**List / Calendar / Summary**) with an orthogonal **month
  navigator** (‹ July 2026 ›); **active-filter chips** row makes applied filters
  visible and one-tap removable (+ "Clear all"). Swipe edit/delete already existed.
  Also fixed the filter/transfer/split sheets rendering *under* the floating Add
  button (now shown on the root navigator).
- **Phase 8 (Inbox) — device-verified:** buckets became **filter chips** that hide
  at zero (except the active one); each triage card gained a **leading bank glyph**
  (income-tinted), a sender subtitle, and a **tap-to-expand SMS body**. Confirm-all
  preview dialog and per-row confirm/dismiss already existed.
- **Phase 9 (Polish):** the bundled **OFL font licenses** (Fraunces/Inter/JetBrains
  Mono) are registered via `LicenseRegistry` and surfaced in Settings → About →
  **Open source licenses** (device-verified). Onboarding's sync step now uses a
  **"What's a sync server?" expandable** instead of a wall of text. Motion already
  respects reduce-motion (`CountUpMoney`/`Motion.duration`); `MoneyText` and chart
  `Semantics` landed in Phases 1–2.

Remaining — these are the interaction-heavy rewrites that design.md itself says
need an on-device pass for touch/motion feel; best done with a device in the loop:

- **Phase 6 (deferred sub-items):** Transfer mode (own flow — YAGNI until asked),
  Type/Scan collapse into the chip row, suggested "?" category chip, and the
  `entry/widgets/` file split (deferred as churn — best done alongside any further
  redesign, not as a standalone pass).
- **Phase 8 (deferred) — Inbox:** per-chip inline fixing (edit suggested account/
  category from the card) and `AnimatedList` slide-out on confirm — polish on top
  of the working reactive removal.
- **Phase 9 (deferred) — onboarding:** the optional Android SMS-permission primer
  step (a 4th onboarding page). Left for a pass with a data-clear device run —
  verifying it means re-triggering onboarding, which wipes local state.

One known cross-screen inconsistency to reconcile in a later pass: Activity/detail
colour categories by name-hash (`categoryAccentColor`) while Insights/Budget use
the id-hash `categoryColor` — unify once `TransactionListItem` carries the id.

---


Goal: a minimalist, beautiful, *fast-feeling* expense tracker that wins on
three things — (1) glanceable spending visuals, (2) frictionless capture and
editing, (3) reports that answer "where did my money go?" in one screen. This
spec is grounded in the current code; every section names the files it changes.

Guiding rule: **the overhaul is structure, hierarchy, data-viz, and motion —
not a rebrand.** The editorial identity (Fraunces display serif, Inter UI sans,
JetBrains Mono money, teal + green + clay on cool neutrals) is already
distinctive and just got bundled offline-safe. We keep it and execute it harder.

---

## 1. Product-shape decisions (the big calls)

### 1.1 Navigation: 6 tabs → 4

Today `home_shell.dart` renders **six** bottom-nav tabs (Home, Activity,
Budget, Tags, Inbox, Accounts) and Reports isn't in the nav at all. Six
destinations exceeds Material guidance (3–5), makes every label truncate on
small phones, and promotes two admin surfaces (Tags, Accounts) to daily
real estate they don't earn.

New structure:

```
┌──────────────────────────────────────────────┐
│  Home    Activity    Insights    Budget      │   + FAB "Add"
└──────────────────────────────────────────────┘
```

- **Home** — the money story of *now* (§4.1).
- **Activity** — the ledger: search, filters, day groups (§4.3).
- **Insights** — the renamed/merged Reports: trends, categories, heatmap (§4.5).
- **Budget** — monthly envelopes (§4.6).
- **Inbox** is *demoted from tab to badge*: it is a review queue, not a
  destination you browse. Entry points: (a) an app-bar icon with a count badge
  on Home and Activity, (b) the Daily Review card's "N SMS to review" row.
  A queue you enter when there's work beats a tab that's usually empty.
  When SMS capture is off, the icon hides entirely (today the tab hides).
- **Tags** and **Accounts** move under a `More`/Settings hub (§4.8); account
  *balances* surface on Home where they're actually read. Tag drill-downs stay
  reachable from filters and detail chips (routes don't change).

Files: `home_shell.dart` (tab list, badge icon), `router/router.dart`
(unchanged paths — only which surface links to them), `settings_screen.dart`
(gains Tags/Accounts entries).

### 1.2 Capture is the hero

The FAB stays extended ("Add") and present on all four tabs. Quick Entry gets
the deepest polish investment (§4.2) because it is the product thesis
("logging is fast"). Target: **amount → save in ≤ 3 taps** for a repeat payee.

### 1.3 Charts: an in-house painter kit, no chart dependency

`reports_screen.dart:14` already states the policy ("we intentionally don't
pull in a chart package") and hand-rolls `_Sparkline`. We formalize that into a
small shared kit (§3.6) instead of adding `fl_chart` (~large API surface,
another supply-chain dependency). The five primitives below cover everything
this app plots. If a future need outgrows them, revisit — not before.

---

## 2. Design principles

1. **One number per screen.** Every screen leads with a single hero figure
   (Fraunces or Mono, large) and everything else supports it. No competing
   headlines.
2. **Money is mono, always.** Every amount renders in JetBrains Mono with
   tabular figures via `MoneyText`/`moneyStyle` — lists, heroes, chips, charts.
   Sign discipline: spend is plain/negative, income is green `tertiary` with
   `+`. Never color spend red in lists (red = errors only).
3. **Ink over ornament.** No gradients, no shadows beyond M3 level-0/1, no
   decorative illustration. Hierarchy comes from type scale, spacing, and the
   hairline-border card language already in `theme.dart` (0.5 px outline,
   14 px radius).
4. **Empty, loading, error are designed states**, not afterthoughts — every
   list screen ships all three (`EmptyState`, shimmer skeleton §3.5,
   `ErrorState` with Retry).
5. **Motion explains, never decorates.** 150–250 ms, standard-easing,
   number count-ups on heroes, container transforms on drill-down. Anything
   that can't justify itself as "explaining where a thing went" is cut.
6. **Respect the thumb.** Primary actions in the bottom half; destructive
   actions never on first tap (swipe → confirm or undo-snackbar).

---

## 3. Foundations

### 3.1 Color

Keep the existing `_Palette` in `theme.dart` (cool near-white light / slate
dark, teal primary `#0A6E58`, income green, clay danger) with three additions:

- **Category color ramp.** A fixed 12-hue ramp (muted, equal-luminance, both
  modes) assigned deterministically by category id hash unless the user set
  `categories.color`. Used by chart segments, category swatches, and budget
  bars so a category is the *same color everywhere*. New:
  `ui/category_palette.dart` — `Color categoryColor(ColorScheme, String id, {int? explicit})`.
- **Chart neutrals.** `chartGrid` (outlineVariant @ 40%), `chartMuted`
  (onSurfaceVariant) as extension getters, so painters never hardcode.
- **Contrast fix.** `lightOnSurfaceVariant #6B7280` on `#FCFCFD` is ~4.6:1 —
  passes AA for normal text but only barely; darken to `#5B6472` (≥5.5:1) so
  muted text survives cheap OLED panels. One-line palette change.

### 3.2 Typography

Unchanged families; tighten the roles:

| Role | Face | Use |
| --- | --- | --- |
| Display / headline | Fraunces | Screen titles, hero labels, onboarding |
| Hero numbers | JetBrains Mono 32–40 w700 | Month spend, balances |
| UI text | Inter | Everything interactive |
| Amounts | JetBrains Mono, tabular | All money, all sizes |
| Eyebrows | Inter 11 w600 +1.6 tracking | Section headers ("RECENT", "BY CATEGORY") |

New: `MoneySize.hero` gets an **animated count-up** variant (§3.7). Amount
color tokens: spend `onSurface`, income `tertiary`, muted `onSurfaceVariant`.

### 3.3 Spacing, shape, grid

- 4-pt base grid; screen gutter 20; card padding 16; list row min-height 56.
- Radius scale: chips 10, cards/inputs 14, sheets 28-top, FAB 20 (all current
  values — codify, don't change).
- Cards keep the hairline-outline language; **never** elevation > 1.

### 3.4 Iconography

Phosphor (already a dependency for categories) becomes the single icon set for
*category* glyphs; Material Symbols outlined/filled pairs remain for chrome
(nav, app bar). Rule: chrome = Material, content = Phosphor. Audit pass over
current mixed usage.

### 3.5 Loading: shimmer skeletons

Current skeletons are static gray bars (`_RecentSkeleton`,
`_QuickEntrySkeleton`). Add one 900 ms looping opacity shimmer wrapper —
`ui/widgets/skeleton.dart` (`Skeleton.line/box/circle` + `SkeletonShimmer`
inherited animation, pure `AnimatedBuilder`, no package) — and reuse it in
Home, Activity, Quick Entry, Insights. Skeletons must mirror the real layout
(same paddings) so content doesn't jump on load.

### 3.6 Chart kit — `ui/charts/`

Five CustomPainter widgets, one file each, sharing `ChartStyle` (reads theme):

| Widget | Replaces / powers | Spec |
| --- | --- | --- |
| `Sparkline` | `_Sparkline` in reports | 1.5 px path, gradient-to-transparent fill @8%, optional dot on last point. No axes. |
| `BarChart` | `_IncomeSpendingChart`, monthly trend | Rounded-top 6-px bars, paired series (spend `primary`, income `tertiary` @ 70%), baseline hairline, tap → tooltip bubble with Mono amount, selected bar full-opacity others 40%. |
| `CategoryBars` | "By category" rows | Horizontal 100%-stacked or per-row proportional bar behind each category row: swatch + name + Mono amount + % — *the* category visual (denser and more legible than a donut on phones). |
| `ProgressArc` | Budget rings | 270° arc, 6 px, track outlineVariant, fill category color; >100% overflows into `error` colored overshoot segment. |
| `HeatmapCalendar` | new, Insights | Month grid, 5-step opacity ramp of `primary` by day spend; tap a day → that day's transactions (pushes Activity filtered). |

Accessibility: every chart wraps in `Semantics(label:)` with a text summary
("Spending by category: Groceries ₹12,400, 34%…") and is *paired* with the
data as text below/beside it — charts augment, never replace, numbers.

### 3.7 Motion & haptics

Tokens in `ui/motion.dart`:

- `MotionDurations`: `fast 150ms` (state changes), `base 220ms` (navigation,
  sheets), `slow 400ms` (count-ups, charts entering).
- Hero numbers: `TweenAnimationBuilder<int>` count-up on first build and on
  value change (`CountUpMoney` widget wrapping `MoneyText`).
- Charts animate in once per data-identity (bars grow from baseline, arcs
  sweep) — `slow`, standard-decelerate; **no** re-animation on rebuilds.
- List insertions (new transaction landing in Activity/Home) use
  `AnimatedSwitcher`/implicit size+fade so a saved expense visibly *arrives*.
- Haptics: `selectionClick` on pickers/keypad (already there), `lightImpact`
  on save (already there), `mediumImpact` on delete-confirm. Nothing else.
- Respect `MediaQuery.disableAnimations` → durations to zero.

---

## 4. Screen specs

### 4.1 Home — "the money story of now"

Current: `_MonthHeroCard` + `_StatTile`s + Daily Review card + Recent list.
Good bones; the redesign sharpens hierarchy and adds the missing spending
visual.

Layout (single scroll, pull-to-refresh triggers sync):

```
┌────────────────────────────────────────┐
│ July                        [🔔3] [⚙]  │  ← Fraunces month, Inbox badge, More
│                                        │
│ SPENT THIS MONTH                       │  ← eyebrow
│ ₹42,180              ▁▂▄▃▆▄▇          │  ← CountUpMoney hero + 30-day Sparkline
│ +₹1,05,000 in · ₹18,400 left of budget│  ← one support line, Mono inline
│                                        │
│ ┌ Needs attention ──────────────────┐  │  ← Daily Review, only if non-empty
│ │ ◦ 3 SMS to review            →    │  │
│ │ ◦ 2 uncategorised today      →    │  │
│ │ ◦ Eating Out 92% of budget   →    │  │
│ └───────────────────────────────────┘  │
│                                        │
│ ACCOUNTS                               │  ← horizontal chip-cards: name +
│ [HDFC ₹1.2L] [Cash ₹3.4K] [CC −₹12K]  │    Mono balance; tap → detail
│                                        │
│ RECENT                        See all →│
│ 🛒 Blinkit          Groceries  −₹450  │  ← rows per §4.3 anatomy
│ …7 more                                │
└────────────────────────────────────────┘
```

Rules:
- Daily Review renders **only** rows that exist; a fully-clear day shows a
  single quiet "All caught up ✓" line, not an empty card.
- The hero support line picks at most two facts (income if any, budget-left if
  budgets exist) — never three.
- Accounts strip replaces the Accounts tab as the daily balance surface.

Files: `home_screen.dart` (restructure), new `ui/charts/sparkline.dart`,
`ui/widgets/count_up_money.dart`; `dailyReviewProvider` already feeds this.

### 4.2 Quick Entry — the crown jewel

Current sheet works but buries state: 1,900 lines, three tabs (Type/Form/
Scan), pickers as modal-in-modal, keypad hidden when short. Redesign as a
**full-height modal sheet** with one dominant element — the amount — and
*chip-based* context instead of stacked picker rows:

```
┌────────────────────────────────────────┐
│ ── drag handle ──            [✕]       │
│                                        │
│            ₹ 4 5 0                     │  ← Mono 40, cursor-blink underline
│         [Expense | Income | Transfer]  │  ← segmented, Transfer swaps layout
│                                        │
│ (🏦 HDFC) (🛒 Groceries?) (@ Blinkit)  │  ← context chips: account/category/
│ (📅 Today) (+ note) (+ tag) (+ 🌐 fx)  │    payee/date; "?" = suggested, tap
│                                        │    to confirm, long-press to change
│ ┌───────────────────────────────────┐  │
│ │  1   2   3                        │  │
│ │  4   5   6                        │  │  ← keypad always visible; decimal
│ │  7   8   9                        │  │    key appears per currency digits
│ │  .   0   ⌫                        │  │
│ └───────────────────────────────────┘  │
│ [        Save ₹450 to HDFC        ]    │  ← button states the action
└────────────────────────────────────────┘
```

Key behaviors:
- **Suggested chips**: after payee entry (or from SMS draft / AI parse), the
  category chip fills from `entry_memory`/rules with a subtle "?" affordance —
  tap once to accept, so the repeat-payee flow is amount → payee → save.
- **Type/Scan collapse into the chip row**: a small `[✎ describe]` and `[📷]`
  pair above the keypad replaces the tab bar; AI parse fills the same chips
  (visible diff of what the model set — chips pulse once).
- **Transfer mode** reuses this sheet (from/to account chips) and finally
  absorbs `transfer_sheet.dart`; splits stay a separate flow reachable from
  the sheet's overflow (rare action, don't tax the common path).
- Save button always names the action ("Save ₹450 to HDFC") — a last-glance
  confirmation that prevents wrong-account saves without a dialog.
- Editing an existing transaction opens the same sheet pre-filled (unchanged).

This is also the moment to do plan-item 8: split `quick_entry_sheet.dart` into
`entry/widgets/{amount_display,keypad,context_chips,ai_strip}.dart` +
`quick_entry_sheet.dart` as composition. The existing
`quick_entry_sheet_test.dart` is the harness.

### 4.3 Activity — the ledger

Current screen is close; polish pass:

- **Row anatomy** (56 px): category glyph in a 36 px tinted circle
  (`categoryColor` @ 12% bg) · payee (Inter 15 w500) over category+account
  (12.5 muted) · Mono amount right-aligned, income green `+`.
- **Sticky day headers** with the day's net on the right (exists — keep), add
  `SliverPersistentHeader` stickiness.
- **Swipe actions**: right-swipe = edit, left-swipe = delete with 4 s undo
  snackbar (delete/undo plumbing exists via `DeletedTransactionSnapshot`).
- **Filter chips row** under the search field showing *active* filters as
  dismissible chips ("HDFC ✕" "Groceries ✕") — today active filters are
  invisible outside the modal, which is why the tune icon confuses.
- Segmented modes (Week/Calendar/Month/Summary/All) shrink to **three**:
  `[List | Calendar | Summary]`, with the period picker (month arrows) as a
  separate control. Five segments × two controls currently fight for one row.
- App bar actions consolidate: transfer + split move into the FAB's Quick
  Entry (per §4.2); the app bar keeps only search-in-page and filters.

Files: `transactions_screen.dart` (largest UI diff), `flutter_slidable`
already a dependency.

### 4.4 Transaction detail

Current detail is a flat label:value list. Redesign as receipt-style:

- Header: category glyph large (48), payee as tappable Fraunces headline
  (exists), Mono amount hero, FX "Original $20.00" as a muted chip under it.
- Chips row: account, category, date, tags — each tappable to *edit that one
  field* (opens the respective picker directly, not the whole sheet).
- Map card (exists) and SMS source card (show the originating SMS body for
  `origin == 'sms'` — trust feature, data already linked via `originRef`).
- Bottom action bar: Edit (full sheet) · Duplicate · Delete (confirm).

### 4.5 Insights (Reports, rebuilt around the chart kit)

One scrolling screen per period (month default, ‹ › to move, tap title for
picker):

1. **Headline**: Spent / Income / Net stat row (exists) with Net colored by
   sign; count-up on period change.
2. **Daily rhythm**: `BarChart` of spend per day (30 bars), today highlighted;
   replaces the bare sparkline as the primary visual. Tap a bar → that day.
3. **By category**: `CategoryBars` — swatch, name, Mono amount, %, thin
   proportional bar; tap → category detail (route exists). Top 8 + "Other".
4. **Month vs month**: 6-month paired `BarChart` (spend vs income) —
   upgrade of `_IncomeSpendingChart`.
5. **Heatmap**: `HeatmapCalendar` for the "which days bleed money" glance.
6. **Payees**: top-5 payee list with amounts (query exists via payee scope).

Every section: eyebrow header, chart, *and* the same data as text rows —
charts never carry information alone. Replace the three remaining raw
`Error: $e` Paddings in `reports_screen.dart:71,126,147` with `ErrorState`.

### 4.6 Budget

- Month header with copy-previous action (exists).
- Each category row: glyph + name · `ProgressArc` (or 4 px linear bar under
  the row on narrow widths) · `spent / target` in Mono · "left" or "over by"
  colored (`tertiary`/`error`) — replaces plain text-only rows.
- Overspent categories float to a "Needs attention" group at top (sorting
  logic exists in `dailyReviewProvider` warnings).
- Unbudgeted-but-spending categories appear at bottom with a one-tap
  "Set target" ghost row.

### 4.7 Inbox (review queue)

Becomes a focused triage surface (opened from badges):

- Keep the four buckets but as **filter chips**, not tabs (Ready 3 · Review 1
  · Matched · Ignored) — chips show counts, hide when zero.
- **Card anatomy**: bank glyph + sender · parsed Mono amount (big) · suggested
  payee/category/account chips (same chip language as Quick Entry §4.2) ·
  two-button row `[Dismiss] [Confirm →]`. Tapping the card body expands to
  show the raw SMS text.
- Confirm-all keeps the new preview dialog; add per-chip inline fixing on the
  card so most rows never open the full sheet.
- After confirm, the card animates out (`AnimatedList` removal) and the next
  card slides up — triage rhythm like an email client.

### 4.8 Settings / More hub

Group into sections with the eyebrow style: *Data* (Accounts, Tags,
Categories, Rules, Recurring, Backup) · *Capture* (SMS, Location, Currency) ·
*Sync* (server, health, key) · *About* (version, licenses — the OFL font
licenses now shipped must be listed here via `LicenseRegistry`).

### 4.9 Onboarding

Three steps stay; polish: full-bleed Fraunces welcome, currency chips grid
with locale-detected default pre-selected (done), the sync step gets a
"What's a sync server?" expandable instead of a paragraph. Add a 4th
optional step on Android: SMS permission primer with a real example card
showing what the Inbox will do (permission priming doubles grant rates).

---

## 5. Dark mode & accessibility

- Every new component reads only `ColorScheme` — zero literal colors outside
  `theme.dart`/`category_palette.dart`. Verify both modes per screen (golden
  tests below).
- Contrast: AA minimum for all text (§3.1 fix); chart fills ≥3:1 against
  surface for adjacent segments (the ramp is built to satisfy this).
- Semantics pass (plan item 9's remainder): every icon-only button gets
  `tooltip` *and* the charts get `Semantics` summaries (§3.6); `MoneyText`
  gains `semanticsLabel` ("450 rupees spent") built from symbol + sign.
- Touch targets ≥48 dp including chips (visual 32, hit-area padded).
- Text scaling: layouts tested at 1.3× and 2.0×; heroes may shrink via
  `FittedBox`, rows grow — nothing truncates an amount, ever.

---

## 6. Implementation plan

Phased so `main` stays shippable; each phase is gated on
`just gate` + goldens.

| Phase | Scope | Files (primary) | Size |
| --- | --- | --- | --- |
| 1. Foundations | `category_palette`, `motion.dart`, `Skeleton`, `CountUpMoney`, contrast fix, `MoneyText` semantics | `ui/*` new, `theme.dart` | S |
| 2. Chart kit | 5 painters + goldens | `ui/charts/*` new | M |
| 3. Nav restructure | 4 tabs, Inbox badge, More hub | `home_shell.dart`, `settings_screen.dart` | S–M |
| 4. Home | hero + sparkline + accounts strip + review card | `home_screen.dart` | M |
| 5. Insights | rebuild on chart kit | `reports_screen.dart` | M |
| 6. Quick Entry | sheet redesign + file split + transfer absorb | `features/entry/*` | L |
| 7. Activity + Detail | rows, swipes, filter chips, receipt detail | `transactions_screen.dart`, `transaction_detail_screen.dart` | M |
| 8. Budget + Inbox | arcs, triage cards | `budget_screen.dart`, `inbox_screen.dart` | M |
| 9. Polish | onboarding, empty states, motion audit, a11y sweep | broad, shallow | M |

Testing strategy:
- **Golden tests** (new `test/goldens/`) for: each chart painter at 2 data
  shapes × 2 brightnesses; Home and Insights full-screen goldens; Quick Entry
  sheet. `flutter_test` built-in goldens, no package.
- Existing widget tests (`quick_entry_sheet_test`, `onboarding_flow_test`)
  are the behavior harness for phases 6 and 9 — they must pass unmodified
  except for finder changes.
- Each phase ends with an on-device pass (`just install`) for touch/motion
  feel — goldens can't judge that.

Risks:
- Phase 6 is the only one touching save-path logic — keep the repo calls
  byte-identical and only re-skin; the sheet split (plan item 8) lands first
  inside the phase as a pure-move commit.
- Nav restructure changes muscle memory — ship phases 3+4 together so Home
  absorbs Accounts/Inbox affordances in the same release that removes the tabs.
- No new dependencies anywhere in this plan (charts, shimmer, count-up all
  hand-rolled) — nothing to vet.

## 7. Non-goals

- No rebrand, no new fonts, no logo work.
- No fl_chart/graphic/syncfusion dependency (revisit only if a genuinely new
  chart type appears).
- No iOS-specific Cupertino variants (Material 3 everywhere; iOS stays
  best-effort per AGENTS.md).
- No home-screen widget in this pass (shortcut shipped; widget is its own
  project).
- No behavior changes to sync/SMS/AI pipelines — this spec is strictly the
  presentation layer plus the Quick Entry file split.
