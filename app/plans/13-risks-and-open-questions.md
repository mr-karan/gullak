# 13 — Risks and open questions

## Risks

### R1 — `actual-http-api` is community-maintained

Mitigation: pin to a known-good tag in our docs. We do not depend on
unstable endpoints. Our client wraps it behind one interface so we could
swap to a self-built shim later (using `@actual-app/api` directly inside a
small Node companion) without touching the UI.

### R2 — Currency minor units vary by budget

`actual-http-api` doesn't surface `dateFormat` or `numberFormat` clearly
on the budget endpoint. We default to 2 minor digits (right for INR, USD,
EUR) and expose an override. Worst case: user sees ₹4500 logged as ₹45 —
they'll spot it inside one transaction.

### R3 — SMS parser drift

Bank SMS templates change. Mitigation: every parser carries a
`parser_version`. When a parser fails to match for an SMS that tier-1
flagged transactional, we log it (locally), and the user sees nothing in
the inbox. We can ship parser updates without touching the schema.

### R4 — LLM outputs garbage occasionally

Mitigation: confidence threshold + JSON-mode + lenient extraction +
manual fallback. AI never blocks save.

### R5 — Time zones

Actual stores dates as `YYYY-MM-DD`, no time. We compute "today" using
the device's local time zone. SMS arrive in device-local time. Edge: a
late-night Blinkit on April 30 lands as April 30 even if the user's
phone briefly thinks it's May 1 because of network time. Acceptable.

### R6 — Drift codegen flakiness on first build

Mitigation: `dart run build_runner build --delete-conflicting-outputs`
documented in the README and run as part of `make setup`.

### R7 — Riverpod / freezed / drift major version churn

Mitigation: pin minor versions. Lock-file committed.

### R8 — Android background scheduling is unreliable

Mitigation: every screen also runs a foreground sync on resume. The
workmanager pass is a nice-to-have, not load-bearing.

### R9 — iOS without SMS feels like a stripped app

Mitigation: explicit copy in onboarding ("On iOS, SMS reading isn't
available — we know"). The Inbox tab is hidden on iOS, freeing up tab-bar
real estate. The Quick Entry "Type" mode plus AI gives iOS users a fast
input path that compensates.

## Open questions

### O1 — How do we handle transfers?

Actual transfers use a paired transaction with `transfer_id`. v1 does NOT
let users create transfers from the app — the user does that in the
Actual web UI. We display them read-only, marked with a transfer icon.

### O2 — Splits

Same answer. Read-only display, no in-app authoring in v1.

### O3 — Categories without a group

Actual allows a category to be ungrouped. We surface them under a
synthetic "Uncategorised" group in the picker.

### O4 — When AI says `account_hint = "HDFC"` but user has two HDFC accounts

We pick the most recently used one and show a small chip "→ HDFC Savings"
with a tap-to-change. Default account from settings is the tiebreaker.

### O5 — What if the user's Actual server is reachable only via VPN?

Out of scope. We tell the user "we use whatever URL you give us, including
behind a VPN; we don't manage the VPN connection itself."

### O6 — Multiple devices

v1 is single-device. If the user adds the app on a second phone, both
phones will pull from Actual fine, but locally-pending changes don't
cross. Push from each device with its own `gullak:<uuid>` namespace —
they won't collide (different uuids). Conflict on simultaneous edit of
the same row is the usual "last write wins via PATCH".

### O7 — Backups

Local DB is on the device; if the phone dies, we restore from Actual on
re-onboarding. The local DB is a cache, not the source. We do NOT export
local data anywhere.

### O8 — Notifications when a push fails repeatedly

Phase 9 nice-to-have. Default for v1: a red badge on Settings → Sync, no
push notification.

## Things to confirm before merging

- [ ] `actual-http-api` Docker image runs alongside `actual-server` on the
      user's existing setup without port conflicts.
- [ ] The exact field name for currency on the budget object.
- [ ] Whether `imported_id` collisions across accounts cause problems
      (probably scoped to account; our uuids are globally unique anyway).
- [ ] SMS permission rationale text passes Play Store policy review (we
      do not plan to publish, but the text should be honest enough that
      it would).
