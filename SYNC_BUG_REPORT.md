# Bug report: server→phone sync never delivers a web-side edit

**Status:** probe RUN (see "Probe result", 2026-07-22) — lead suspect is now a
**wedged pull cursor from a poisoned page** (apply-failure retry loop), with
LWW future-timestamp refusal demoted to #2. One log check decides it.
**Date:** 2026-07-22. **Reporter:** prior debugging session (Claude Code) + Karan.

## ⚡ Probe result (2026-07-22) and the decisive next check

The phone-side probe (edit Dyson note → sync) **pushed and clobbered the server
row**: web now shows payee "Payu Retail" (the phone's copy — revealing that the
original never-delivered web edit was the *rename* to "Dyson V15"), note "probe",
amount −₹64,127.00. Push-LWW worked as coded. Notably the **category
(Shopping & Lifestyle) survived**, consistent with both sides already agreeing on
category — the payee rename was the lost edit.

**New #1 hypothesis — poisoned pull page wedges the cursor.**
`app/lib/sync/sync_service.dart` (~310-315): the cursor only advances when EVERY
change in a pulled page applies; a failed change "holds the cursor for retry". A
row whose apply **permanently** throws (not transient) therefore wedges the cursor
forever: every sync re-pulls the same page, fails on the same row, applies nothing
after it — while pushes keep working. This fits ALL observations, including a
fresh head-of-log change never landing. Likely poison candidates: **rules rows**
(rules sync to the phone, and prod has 84 legacy-schema rule payloads — see the
"Related but separate bug" section; the phone applier may throw on the old shape)
or any other resource payload that drifted.

**Decisive check (run first):** trigger manual sync on the phone twice, ~a minute
apart, then:

```
ssh floyd-pub-1 'docker logs gullak --since 10m 2>&1 | grep "sync/changes" | tail -6'
```

- Same `since=N` on every pull, never advancing → **wedged cursor confirmed.**
  Then find the poison: `docker exec gullak node /tmp/sync-diag.js` after tweaking
  the script to dump `change_log` rows with id ≥ N (resource + payload head) — the
  poison row is in `[N, N+500)`. Expect a rules row with legacy payload.
- Advancing `since=` → cursor fine; fall back to hypothesis #2 (LWW refusal below)
  and read the probe row's `payload.updatedAt` via `pi-server/scripts/sync-diag.js`.

**Fix directions for the wedge (once confirmed):** the phone must distinguish
transient failures (network/db-lock → hold cursor) from **permanent** ones
(malformed payload → quarantine the row, log it, advance the cursor past it — the
same quarantine philosophy the push path already implements for corrupt local
rows). Server-side: migrate the legacy rule payloads (needed anyway for the Rules
bug). Also ship the applier-observability + "Full re-sync" items below.

## Symptom

A transaction edited in the **web app** never updates on the **Android app**, even after
multiple manual syncs, days apart, and across a server fix + redeploy. Everything else
about sync appears healthy — including the *other direction* (phone→web works).

Concrete row: the "Dyson V15" transaction (₹64,127.53, origin SMS `VM-AMEXIN-S`,
Amex Credit Card account). Recategorized on web (most recently via the chat agent:
"Recategorized 1 to Shopping & Lifestyle", which verifiably wrote the row + a
change_log entry). Phone still shows the old category.

## Environment

- **Server:** pi-server (Node + Hono + Drizzle + better-sqlite3, synchronous DB) in
  docker on host `floyd-pub-1` (Tailscale, in `~/.ssh/config`), container `gullak`,
  DB `/data/gullak.db` (mounted volume). Deployed from main @ `2b0aba79` (2026-07-21).
- **Phone:** Pixel 9 Pro XL, `dev.mrkaran.gullak` versionName **0.4.0**, installed
  2026-07-20 17:05. **Release build — `run-as` refused ("package not debuggable"),
  and it emits no app logs to logcat.** adb works (device `49261FDAS001EU`).
- **Sync model (see repo CLAUDE.md "Sync model"):** phone-local Drift DB is source of
  truth; every local mutation writes a local change_log row; `syncOnce()` = **push →
  pull → prune**. Pull pages `GET /v1/sync/changes?since=<cursor>&clientId=<self>`;
  server filters out rows the caller originated; phone applies via `RemoteApplier`
  with last-write-wins on `updatedAt`; cursor persisted in prefs (`_prefs.syncCursor`).

## Timeline of the investigation (all evidence, in order)

1. **Web edit made** (category change on the Dyson row). Phone showed old data.
2. **Manual sync on phone → still old.** (Rules out "sync trigger missing".)
3. **Code audit (all verified sound):**
   - Web PATCH path records changes: `pi-server/src/transactions/mutations.ts`
     imports `recordChange`, 3 call sites (94/107/197).
   - Agent write tools record changes: `pi-server/src/agent/write_tools.ts`.
   - Pull filter only excludes rows with the **caller's own** clientId
     (`pi-server/src/routes/sync.ts` ~line 53); server-side writes have
     `client_id = NULL` → always visible to the phone.
   - Pull parses payload server-side (JSON.parse before responding), so the phone's
     `payload is! Map` guard is not the problem.
   - Server **push** apply is LWW-guarded: `onConflictDoUpdate ... setWhere:
     excluded.updated_at >= table.updatedAt` and deletes guarded by
     `lte(table.updatedAt, ts)` (`sync.ts` ~110-133). A stale phone push cannot
     clobber a newer server row.
4. **Server DB inspected** (by a separate session): the web edit's change row existed
   at id **2919** with `client_id = NULL`. A cursor-boundary bug was diagnosed and
   **fixed + deployed** in `2b0aba79`: pull filter `gt(id, cursor)` → `gte(id,
   cursor)` with `cursor = lastScannedId + 1`. NOTE: whatever its merits for *new*
   strandings, this **cannot resurrect a row already behind the phone's stored
   cursor**, and it did not fix the symptom.
5. **Fresh head-of-log change created** (2026-07-22): via the web chat agent —
   "set the category of the selected transaction to Shopping & Lifestyle" →
   confirmed reply, i.e. a brand-new change_log row with `updated_at = now` at the
   head of the log. **Phone manual sync → STILL old.** This is the killer datum: a
   stranded cursor cannot explain missing a *head-of-log* row.
6. **Phone→web probe:** edited a note on a different txn (Swiggy) **on the phone**;
   it **arrived on web**. Therefore: phone credentials, network, push leg all work —
   and since `syncOnce` pulls immediately after a successful push, **the pull phase
   executed**. (The Settings→Sync result message — `pushed/pulled/error` — was never
   captured; still worth collecting.)

## Hypotheses eliminated

| Hypothesis | Killed by |
|---|---|
| No sync trigger / stale APK without scheduler | manual syncs performed; APK is 2026-07-20 |
| Web edit not change-logged | change row 2919 observed in server DB; agent edits recordChange |
| clientId filter hides server rows | server rows have client_id NULL; code verified |
| payload shape (string vs Map) dropped by applier | server parses payload before responding |
| Phone push clobbers server (LWW missing on push) | push apply has `setWhere excluded.updated_at >= updatedAt` |
| Stranded cursor (original diagnosis, fix `2b0aba79`) | a **fresh head-of-log row** (step 5) was also not applied |
| Phone connectivity/auth broken | phone→web note edit arrived (step 6) |

## Surviving hypothesis (all evidence consistent, not yet proven)

**The phone's applier receives the row and refuses it via LWW.**
`app/lib/sync/remote_applier.dart`:

```dart
bool _isNewer(int? localUpdatedAt, dynamic remoteUpdatedAt) {
  if (localUpdatedAt == null) return true;
  if (remoteUpdatedAt is! num) return false;
  return remoteUpdatedAt.toInt() >= localUpdatedAt;   // skip iff remote < local
}
...
if (!_isNewer(local?.updatedAt, payload['updatedAt'])) return;  // silent skip
```

For the row to be skipped, the phone's local `updatedAt` for the Dyson row must be
**greater than server-now** (step 5's payload was stamped server-`Date.now()`).
I.e. the phone's copy carries a **future timestamp**. Candidate origins:

- phone clock was ahead at the time the row was created/last touched locally
  (SMS import path — check Settings → Date & time on the phone);
- an app-side path that stamps `updatedAt` from something other than wall-clock-now
  (audit the SMS confirm/import path: `app/lib/features/inbox/data/sms_repository.dart`,
  and any enrichment pass that touches transactions);
- unit confusion writing a far-future ms value.

**Aggravating design facts (fix candidates regardless of root cause):**
- The skip is **silent** — no log, no counter, no UI surfacing.
- A skipped row still **advances the cursor**, so it is never retried (this is why
  every earlier delivery attempt vanished without a trace).
- There is no user-facing "full re-sync" (cursor reset). Applies are idempotent
  (`insertOnConflictUpdate` + LWW), so a cursor-reset button is safe and would be
  the universal remediation for stranded rows — but note it will NOT fix an
  LWW-refused row (the same skip would repeat).

## The prepared probe (extracts the phone's local timestamp WITHOUT device DB access)

The push payload includes the local row's `updatedAt`. So:

1. **On the phone:** edit the **Dyson V15** row's note (append "probe"), then sync.
   The phone pushes its full copy — local `updatedAt` included — into the server
   change_log. Side effect that is itself evidence: if the phone's timestamp is in
   the future, its (old) category will **overwrite "Shopping & Lifestyle" on the
   web** (push-LWW `>=` lets it win). Check the web after.
2. **Read it out** (read-only script, prints server clock, the Dyson server row, and
   each recent change row's `payload.updatedAt` with a seconds-vs-now delta and the
   writing client):

   ```
   scp pi-server/scripts/sync-diag.js floyd-pub-1:/tmp/ \
     && ssh floyd-pub-1 'docker cp /tmp/sync-diag.js gullak:/tmp/ \
     && docker exec gullak node /tmp/sync-diag.js'
   ```

3. **Interpretation:**
   - phone payload `updatedAt` **≫ now** (minutes/hours/days ahead) → confirmed:
     future-stamped local row. Find where that timestamp was written (phone clock
     history, SMS import stamping). Fix = applier hardening (below) + optionally a
     one-time server touch with `updated_at = phoneTs + 1`… better: fix the applier.
   - phone payload `updatedAt` ≈ now → hypothesis wrong; the pull leg needs
     re-examination (capture the actual `GET /v1/sync/changes` request/response:
     `ssh floyd-pub-1 'docker logs gullak --since 5m 2>&1 | grep -E "sync/(push|changes)"'`
     while triggering a manual sync; compare `since=` with the change_log head).

## Recommended fixes once confirmed (in order)

1. **Applier observability:** count + log LWW skips; surface "N changes skipped
   (local copy newer)" in the sync result so this class of bug is visible.
2. **Clock-sanity guard:** when writing local rows, clamp `updatedAt` to
   `max(now, ...)` and flag/normalize far-future local timestamps found during
   apply (e.g. if `local.updatedAt > now + 5min`, prefer the server row and log).
3. **Settings → "Full re-sync"** (reset `syncCursor` to 0): safe (idempotent
   applies), the universal stranded-row remediation.
4. **Register edit dialog on web** (unrelated but discovered: the web register has
   no direct edit UI — `usePatchTransactionCategory` in
   `pi-server/webapp/src/api/transactions.ts` has **zero callers**; edits currently
   only happen through the chat agent).

## Related but separate bug found during this hunt (do not conflate)

Prod `/rules` shows **84 rules all rendering "0 conditions · 0 actions"**: the stored
trigger/action JSON predates the current zod schemas; `serialize()` in
`pi-server/src/routes/rules.ts` **silently defaults to empty on parse failure**, and
the engine (`pi-server/src/rules/engine.ts:47-48`) JSON.parses/casts similarly — so
all prod rules (learned payee-memory + manual account-mapping) are likely **not
executing at all**. Needs: a payload-shape migration + surfacing parse failures in
the UI instead of rendering 0/0. Raw stored payload samples come out of the same
`sync-diag.js` pattern (query the `rules` table).

## Key files

| What | Where |
|---|---|
| Pull endpoint + cursor + clientId filter + payload parse | `pi-server/src/routes/sync.ts` |
| Push LWW apply | `pi-server/src/routes/sync.ts` (~95-135) |
| recordChange | `pi-server/src/repos/changelog.ts` |
| Web PATCH path | `pi-server/src/transactions/mutations.ts` |
| Phone sync loop (push→pull, cursor persist) | `app/lib/sync/sync_service.dart` (~280-320) |
| Phone applier + `_isNewer` LWW | `app/lib/sync/remote_applier.dart` (~75-110) |
| Diagnostic script (read-only) | `pi-server/scripts/sync-diag.js` |
| Cursor fix already deployed | commit `2b0aba79` |
