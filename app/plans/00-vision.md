# 00 — Vision

## One sentence

A polished, mobile-first expense logger that pushes to a self-hosted Actual
Budget instance, captures spend the moment it happens, and never asks the
user to think about the ledger.

## Why a new app

The existing pipeline (WhatsApp → bridge → ledger) is forgetful: messages get
lost in chat noise, the agent sometimes mis-parses, edits are awkward, and
there is no reconciliation against bank SMS. WhatsApp is a transport, not a
UI. People who care about their money want a real surface.

YNAB is the polish bar. Not the model — Actual Budget is the model — but the
polish bar.

## Hard goals

1. **Friction-free capture.** Recording an expense should be one tap from the
   home screen and finishable in under three seconds for the common case.
2. **Self-hosted Actual is the source of truth.** The app is a thin
   local-first cache that syncs up. If the phone burns, nothing is lost.
3. **AI is a helper, not a gatekeeper.** Free-text input ("450 blinkit hdfc")
   gets parsed into a structured transaction and shown for one-tap confirm.
   AI failures degrade to a normal manual form, never block the entry.
4. **SMS reconciliation (Android only).** With permission, the app reads
   transactional SMS, ignores the rest, and offers them as a one-tap inbox.
   Duplicates against manual entries are detected and merged.
5. **Offline first.** Every action works without network. Sync is a separate
   queue that catches up when reachable.
6. **Polished.** Animations, haptics, typography, empty states, error states
   — all considered. No half-finished screens.

## Non-goals (v1)

- iOS SMS reading. Apple does not allow it; we degrade gracefully.
- Budget editing. Setting category targets is done in the Actual web UI; this
  app records spend, surfaces totals, and handles reconciliation.
- Multi-budget. One Actual budget per install. Multi can come later.
- Bank scraping / open banking. SMS is the only ingestion channel.
- End-to-end encryption support. The Actual server's E2EE password is
  out of scope for v1; users who use E2EE wait for v2 or disable it.
- Custom reports / charts beyond the home screen totals. Reports live in the
  Actual web UI.
- Web / desktop builds. Mobile only.

## Success criteria

- User installs, points it at their Actual server, picks a budget, lands on
  the home screen — all in under 90 seconds.
- Logging a typical expense ("groceries from Blinkit on HDFC, ₹450") is
  measurably faster than typing the same thing into WhatsApp and waiting for
  the agent reply.
- Bank SMS arrive → user opens the inbox → they tap "confirm" → it is in
  Actual. No typing.
- The app survives a week of daily use without crashes, sync stalls, or
  duplicate transactions.

## Anti-goals (things we will refuse to do)

- Add a "review queue" that you must triage. The inbox is for SMS only.
  Manual entries go straight in.
- Add auth flows beyond "URL + server password + budget password".
- Add charting libraries. Numbers and lists, that is it.
- Add server-side state. The phone is the client; Actual is the source. We
  do not run our own backend.
