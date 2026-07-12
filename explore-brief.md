# Gullak — exploration brief (UI/UX & feature ideation)

> **Your job:** explore how to make Gullak *meaningfully better* — sharper UX,
> smarter capture, richer insight — and come back with a **prioritized set of
> bets** (flows, mockups, scoped proposals), each grounded in the actual
> codebase and respecting the constraints below. Do **not** start implementing;
> spec and explore. Challenge assumptions, but don't propose things that fight
> the product's soul (local-first, private, fast).

---

## 1. What Gullak is

A **local-first personal expense tracker** (Flutter Android/iOS) with an
optional self-hosted server. The **phone is the source of truth**; the server
is a merge point for sync and the trusted place that holds AI-model credentials.
Design goal, in priority order:

1. **Glanceable spending visuals** — "where did my money go?" answered fast.
2. **Frictionless capture & editing** — logging an expense should be near-zero effort.
3. **Reports that actually answer questions** in one screen.

Editorial identity (keep it, execute it harder): Fraunces display serif, Inter
UI, JetBrains Mono for money; teal + green + clay on cool neutrals; an in-house
CustomPainter chart kit (no chart dependency); Phosphor icons for categories.

**Who uses it:** primarily one power user (India, UPI/bank-SMS heavy, logs a lot
by hand *and* from SMS). A second device (a partner's iPhone) also syncs.
Optimize for this workflow first — but note: **Gullak is going FOSS, released
publicly via F-Droid** with a landing page, docs, and a self-hosting guide for
the sync server. So the *first-run experience for a stranger* now matters:
onboarding, empty states, works-great-with-no-server, sensible defaults, and
nothing that assumes the author's homelab. The **paid multi-tenant "Cloud"
track stays out of scope** — self-host is the only server story.

## 2. Stack & hard constraints (respect these)

- **App:** Flutter, Riverpod (Notifier/StreamProvider), Drift/SQLite. `go_router`
  ShellRoute (4 tabs). No `google_fonts` (bundled OFL fonts).
- **Server (`pi-server/`):** Node + Hono + Drizzle + better-sqlite3, run with
  `tsx`. Holds OpenRouter/OpenAI/Ollama creds; does SMS/receipt/NL **AI parsing**
  and multi-turn agent. **All LLM work is server-side — never on device.**
- **Bridge (`whatsapp-bridge/`):** Baileys → posts inbound WhatsApp to the server.
- **Invariants (do not break):** money is **integer minor units** everywhere
  (never decimal-string math); IDs are client-generated UUID text; dates are
  `YYYY-MM-DD` text (compared lexicographically); timestamps epoch-ms; sync is
  **last-write-wins by `updatedAt`**; every synced financial mutation records a
  change-log row. Offline-first: the app must be fully usable with no server.
- **Privacy is the brand:** no third-party analytics/trackers; nothing leaves
  the phone except to the user's own server. Any "AI" or "cloud" idea must fit
  self-host-first.
- **YAGNI.** Prefer deepening the core loop over breadth. This is a solo-use app;
  don't propose enterprise/team features unless the multi-device angle is compelling.

## 3. Current state (recently overhauled — start from here, don't re-propose it)

A full UI overhaul + hardening pass just shipped. What exists **today**:

- **Nav:** 4 tabs — Home · Activity · Insights · Budget. FAB = Quick Entry.
  Inbox is an app-bar count badge; Settings via overflow.
- **Home:** count-up "spent this month" hero + 30-day sparkline, a Daily Review
  card (SMS ready/needs-review, uncategorised nudges), account-balance strip, Recent.
- **Quick Entry (the crown jewel):** big amount keypad; **Expense/Income/Transfer**
  segmented control; **context chips** (account/payee/category/tags) that trigger
  pickers; category auto-fills from payee memory with a "?" suggestion cue;
  **Describe/Scan** launches an AI sheet (natural-language line or receipt photo)
  that fills the form for review; **action-naming Save** ("Save ₹450 to HDFC");
  optional **foreign-amount** capture; **location** attaches in the background
  after save (geocoded place name), never blocking the save.
- **Activity:** List / Calendar / Summary views; a **month navigator shared
  across Activity↔Insights↔Budget**; **search widens to all-time**; **active-filter
  chips** (dismissible); swipe-to-edit/delete with undo; sticky day headers with net.
- **Insights:** headline Spent/Income/Net; daily-spend bar chart; by-category bars;
  6-month income-vs-spend; spend heatmap; every chart paired with text.
- **Budget:** per-category progress rings (glyph + spent/target + over/left).
- **Inbox (SMS triage):** bucket **filter chips** (Ready/Review/Matched/Ignored,
  hide at zero); triage cards (bank glyph, parsed amount, suggested chips,
  tap-to-expand raw SMS); Confirm-all with a preview dialog; slide-out animation.
- **Detail:** receipt-style (category glyph, payee headline, hero amount, FX chip,
  location card that opens the maps app), editable-field chips.
- **Onboarding:** currency → first account → (Android) SMS-permission primer → sync server.
- **Data:** JSON + CSV export, backups; feedback pipe to the server.

**Where to look:** the repo `CLAUDE.md` has a "Where to look" file map and the
endpoint list; `design.md` documents the overhaul's rationale per screen;
`release.md` has the (deprioritized) store/cloud plan. Read those first.

## 4. Known rough edges & open threads (real starting points, not a spec)

- **Cross-screen category color inconsistency:** Activity/detail color categories
  by *name-hash* (`categoryAccentColor`) while Insights/Budget use *id-hash*
  (`categoryColor`). Same category can look different across screens. (Noted in
  design.md; unify once `TransactionListItem` carries the id.)
- **Inbox inline-edit:** suggested account/category chips on triage cards are
  display-only. Fixing a wrong guess means opening the full sheet. Making chips
  tappable-to-fix was scoped out (needs a per-row override — schema or a parallel
  confirm path). Worth revisiting *if* triage friction is real.
- **Repeat-capture speed:** category auto-fills from payee memory, but there's no
  "recent payees" quick-pick, no templates/favourites for common manual entries,
  no amount presets. The fastest real-world path (amount → known payee → save)
  could be even faster.
- **SMS is the core inflow** and entirely server-parsed with a durable retry
  queue. Opportunities around dedup quality, matching SMS to already-logged
  transactions, and reducing the "needs review" pile.
- **Insights are descriptive, not proactive:** no trend/anomaly nudges ("dining
  up 40% this month"), no recurring-spend detection surfaced to the user, no
  budget-vs-actual storytelling, no payee-level drill patterns.
- **Multi-device is real but thin:** a second phone syncs (LWW), but there's no
  household/shared-ledger UX, no per-device attribution, no conflict surfacing.
- **Trust/portability:** export exists; there's room for "your data, provable"
  moments (readable exports, a data-map, restore drills) that reinforce the
  privacy brand.

## 5. Directions worth exploring (pick, sharpen, or reject — with reasons)

Frame every proposal against the three product goals (§1) and this user's
SMS-heavy, high-volume, solo workflow.

- **Make capture disappear.** Sub-second logging: recent/favourite payees,
  templates, smart defaults, home-screen widgets / quick-tiles / notification
  capture, a genuinely great keypad+chip feel. What's the *fewest taps* for the
  90% case?
- **Make the SMS/Inbox loop smarter,** so most rows auto-resolve and triage feels
  like clearing a short queue, not a chore.
- **Make Insights answer questions and nudge,** not just render charts — trends,
  recurring detection, "unusual spend," month narratives, category deep-dives.
- **Make the money *trustworthy at a glance*** — reconciliation, account health,
  "does this match my bank," duplicate detection surfaced well.
- **Motion, empty states, and first-run** polish that makes the app feel alive
  without violating reduce-motion / performance.
- **Accessibility & dark mode** depth (the overhaul laid foundations; audit for real).

## 6. What to hand back

For each bet you recommend:
1. **The user problem** it solves (tie to §1 goals + this workflow).
2. **The flow / interaction** (ASCII wireframes or step lists are fine; visual
   mockups better) and how it fits the existing screens/design system.
3. **Grounding:** which files/providers it touches (cite them), and whether it
   fits the invariants in §2.
4. **Rough scope** (S/M/L) and any decisions the owner must make.
5. **Rank them** — highest daily-life impact first. Call out anything that's
   shiny-but-low-value so it can be cut.

Bias toward **depth on the core capture→review→insight loop** over new surfaces.
When unsure, ask: "does this make *logging or understanding money* faster or
clearer for a high-volume solo user?" If not, it probably doesn't belong.
