# 00 — Vision

## One sentence

A polished, local-first expense tracker. Lives on your phone, syncs nowhere,
makes recording an expense feel instant.

## Why

The earlier plan was to push to a self-hosted Actual Budget server. That
turned out to be needlessly complicated — Actual's wire format is a custom
CRDT sync, not HTTP, and the only working clients are the Node.js
`@actual-app/api` package and the Python `actualpy` re-implementation.
Running a Docker shim alongside the Actual server "just so the data lives
elsewhere" added a service to babysit and didn't pay back for a
single-user, single-device app.

Local SQLite is the right move:
- Zero servers, zero accounts, zero auth flows.
- Works offline, always.
- Fast: the database is a few hundred KB and queries are sub-millisecond.
- Backup is a JSON export the user owns. If they want to move to Actual or
  YNAB later, the schema is documented.

## Hard goals

1. **Friction-free capture.** One tap from the home screen → typing the
   amount → save. Three seconds for the common case. The Quick Entry
   sheet remembers the last-used account, the per-payee category and
   account, and surfaces frequent payees as one-tap chips.
2. **No decimals in the keypad.** Typing `4 5 0` means ₹450. We multiply
   by `10^minor_digits` at save time. Removes a class of mistakes.
3. **Polish bar = Money Manager (realbyteapps) / YNAB.** Day-grouped
   activity list with date headers and daily net. Coloured category
   swatches. Real budget envelope view. Reports with sparklines. No
   half-finished screens.
4. **AI is a helper, not a gatekeeper.** Free-text input
   ("450 blinkit hdfc") gets parsed into a structured draft and
   confirmed in one tap. AI failures degrade to the manual form.
5. **SMS reconciliation (Android).** Optional. Reads only transactional
   bank SMS, drops the rest. Confirm/dismiss inbox.
6. **Backup is the user's job, not ours.** JSON export via share sheet,
   import via file picker. Round-trippable, schema-versioned.

## Non-goals (v1)

- Multi-device sync. Out of scope until v2.
- Multi-currency. One currency, one symbol, fixed minor digits.
- iOS SMS reading. Apple does not allow it; we degrade gracefully.
- Cloud anything. No accounts, no auth, no servers.
- Receipt photo OCR. Maybe later.
- Charts beyond a sparkline. Numbers and small visual cues are enough.

## Success criteria

- Logging a typical expense takes ≤ 4 taps.
- The keypad never shows decimals.
- Picking a payee auto-fills the category and account from the previous
  use 90% of the time.
- The app runs on iPhone and modern Android (8+).
- Cold-start to recording the first expense takes under 90 seconds.

## Anti-goals (things we will refuse to do)

- Add a sync layer behind a feature flag.
- Add a sync layer "for v2" that bleeds into v1's schema.
- Add charting libraries.
- Add web/desktop targets.
- Become an accounting app. Income, expense, transfer, split. That's it.
