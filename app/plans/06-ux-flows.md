# 06 — UX flows and screen inventory

## Screen inventory (v1)

| Screen | Route | Purpose |
|---|---|---|
| Onboarding wizard | `/onboarding/*` | Connect, pick budget, currency, default account |
| Home | `/` | Today + month-to-date totals, quick action |
| Transactions | `/transactions` | Searchable list across accounts |
| Transaction detail | `/transactions/:id` | View, edit, delete |
| Inbox | `/inbox` | SMS suggestions awaiting review |
| Accounts | `/accounts` | Account list with balances |
| Account detail | `/accounts/:id` | Account-scoped tx list and balance |
| Settings | `/settings` | Connection, AI, SMS, theme, debug |
| Settings sub-pages | `/settings/*` | Per-section detail |

Bottom nav: **Home · Transactions · Inbox · Accounts · Settings** (5 tabs).

The Inbox tab is **conditional**: hidden on iOS and on Android until SMS
permission is granted. When hidden, it is replaced by a 4-tab bar.

A persistent **floating action button** on Home and Transactions opens the
Quick Entry sheet (see [07-quick-entry.md](07-quick-entry.md)). FAB has a
long-press shortcut menu: "Type", "Speak" (future), "Scan SMS now".

## Home screen anatomy

```
┌─────────────────────────────────────────┐
│  April 2026             ⚙               │
│                                         │
│  Spent this month                       │
│  ₹ 38,420                               │
│  ▆▃▆▆▂▆▇▅▃▆▇▅▆▇▆ ← 30-bar daily spark   │
│                                         │
│  Today                                  │
│  ₹ 1,240                                │
│                                         │
│  ───────  Recent  ─────────────         │
│  Blinkit       Groceries     -₹450      │
│  Zomato        Eating Out    -₹820      │
│  ...                                    │
│                                         │
│                                  ⊕      │
└─────────────────────────────────────────┘
```

- Pull-to-refresh runs a foreground sync.
- The sparkline is daily totals for the current month. Computed locally.
- Recent list shows the last 8 transactions across all accounts.
- FAB ⊕ opens Quick Entry.

## Transactions list

- Top: month chip selector + search field.
- Rows: payee · category · date · amount. Right-aligned amount, red for
  spend, green for income.
- Tap row → detail. Long-press → multi-select for bulk delete.
- Pull-to-refresh → foreground sync.

Search matches: payee name, notes, amount substring, category. Local-only,
SQL `LIKE` over the local DB.

## Transaction detail

Editable fields: payee, category, amount, date, account, notes, cleared.
Save bounces back to the list with a snackbar "Saved". Edits queue to push.
Delete: confirm sheet, then tombstone + push.

## Inbox

Each row:
- SMS sender + a short "We think this is …" line.
- Parsed amount + suggested payee + suggested account.
- Confidence badge (high/medium/low).
- Two actions: **Confirm** (one tap → adds it; queues to push) and
  **Dismiss** (marks `non_transactional`).
- Long-press → "Edit before adding" opens Quick Entry pre-filled.

Empty state: "No new SMS to review. Make sure SMS permission is granted in
settings." with a button.

## Account list / detail

- List shows name, last balance, last sync time. Closed accounts are
  collapsed under a footer.
- Detail = transactions list filtered to that account, plus a balance
  header.

## Settings sections

1. **Connection** — server URL, API key, current budget, "Test now",
   "Switch budget".
2. **AI assist** — endpoint URL (OpenAI-compatible), API key, model name
   (free text), enable/disable, "Test prompt".
3. **SMS (Android)** — permission status, list of bank senders the parsers
   know, "Re-scan inbox now", "Forget all SMS suggestions".
4. **Currency** — minor digits override.
5. **Appearance** — system / light / dark.
6. **Sync** — last successful pull, retry queue size, "Force re-pull (90d)".
7. **Debug** — view audit log, share log file, wipe local data.
8. **About** — version, license, source.

## Empty states

Every list has an explicit empty state with a one-line explanation and a
relevant CTA. Never show a blank screen.

## Error states

- Sync failure banner at the top of Home: "Can't reach Actual. Last synced
  3m ago." Tap to retry. Auto-hides on next success.
- Push failure on a single tx: red dot on the row in the list, badge on
  Settings → Sync. Tap row → "Retry" or "Dismiss change".

## Motion budget

- 200 ms for crossfades and sheet transitions.
- 80 ms tactile haptic on tx save.
- No parallax. No looping animations.
