# 07 — Quick Entry

This screen is the whole reason the app exists. Other screens can be merely
correct; this one has to be *good*.

## Two modes, one sheet

The FAB opens a bottom sheet with **two tabs at the top**:

1. **Type** — natural-language input, parsed by AI. Default tab.
2. **Form** — the explicit form. Used when AI is off, fails, or the user
   prefers it.

The user can swipe between them. The choice is sticky.

## Type mode

```
┌──────────────────────────────────────────┐
│   Cancel    New expense       ?          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ blinkit 450 hdfc                   │  │
│  └────────────────────────────────────┘  │
│                                          │
│  AI sees:                                │
│  • ₹ 450.00                              │
│  • Blinkit (new payee)                   │
│  • HDFC Account                          │
│  • Groceries                             │
│  • Today                                 │
│                                          │
│  [ Save ]            [ Tweak in form ]   │
└──────────────────────────────────────────┘
```

Behaviour:
- Single text input, autofocused.
- After 350 ms of debounce, send to LLM (see [08](08-ai-extraction.md)).
- Parsed result fades in below.
- "Save" commits as `origin = ai`. Insert local, queue push, dismiss sheet,
  show snackbar with "Undo".
- "Tweak in form" carries the parsed fields into Form mode.

If LLM is off or fails:
- Show a banner: "AI off — switch to Form."
- The sheet does NOT block. The user can still hit Save with no parse;
  we'll treat the raw text as a `notes` field with no amount, and surface
  a validation error.

Confidence handling:
- Below 0.4 confidence, we colour the chip orange and show "Not sure —
  please review". Save is disabled until the user taps to confirm or
  switches to Form.

## Form mode

```
┌──────────────────────────────────────────┐
│   Cancel    New expense       ?          │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │  ₹  4 5 0 . 0 0           ⌫     │   │
│   └──────────────────────────────────┘   │
│                                          │
│   Account   ▾  HDFC                      │
│   Payee     ▾  Blinkit                   │
│   Category  ▾  Groceries                 │
│   Date         Today                     │
│   Notes        (optional)                │
│                                          │
│  [────────  Save ────────]               │
└──────────────────────────────────────────┘
```

Anatomy:
- **Amount** is the primary control. Big, monospaced. A custom numeric
  keypad slides up from below. We do NOT use the system keyboard for
  amount; system keyboards on Android often punt to a generic alpha view
  by mistake.
- **Account** opens a bottom sheet with the account list, default
  pre-selected. One tap closes.
- **Payee** is a typeahead. Matches existing payees first; if you type a
  new name, the row "Add 'Foo' as a new payee" appears at the bottom.
- **Category** opens a sectioned bottom sheet (groups → categories), one
  tap closes. Last-used categories surface at the top under a "Frequent"
  header.
- **Date** chip: defaults to today, tap to change. The picker shows the
  last 5 days as quick chips before the calendar.
- **Notes** is a single-line text input. Multi-line by long-press.

Save behaviour:
- Insert local row, queue push, dismiss sheet.
- Snackbar with **Undo** (5 seconds). Undo = soft delete the row before it
  reaches the queue. We do not push an Undo if the row was already
  successfully pushed; in that case we just queue a delete.

Validation:
- Amount must be > 0. Account must be set.
- Payee, category, notes are optional.

Sign convention:
- Default sign is **negative (spend)**. There is a small toggle near the
  amount that flips to **+** for income. Internally we store negative
  cents for spend; we never ask the user to type a minus.

## Keypad

- 0–9, decimal, backspace.
- Long-press 0 to type 00 (lakh / hundredth speedup).
- Two top-row chips: "+" (income toggle), and "·" (open calculator
  overlay, future).
- Haptic (light) on each key.

## Persistence on dismiss

If the user swipes the sheet down with a non-empty form, we offer to
"Save draft". Accepted draft saves to a `drafts` table (single-row, one
draft at a time). Reopening Quick Entry restores it. Save commits and
clears draft.

## Why a sheet not a route

A sheet keeps the user's context (the list they were in). It's also faster
to dismiss with a swipe than to backstack-pop. YNAB's "+" tap opens a
similar sheet, not a full screen.
