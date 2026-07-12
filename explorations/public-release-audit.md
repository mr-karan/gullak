# Gullak Public-Release Audit

Read-only audit of the working tree **and** full git history (`--all`) ahead of a
public FOSS release. Nothing was modified. Scope: `app/`, `pi-server/`,
`whatsapp-bridge/`, `Justfile`, `README.md`, `CHANGELOG.md`, `design.md`,
`release.md`, `plan.md`, `AGENTS.md`, config, seed data, test fixtures.

Date: 2026-07-13. Branches scanned: `main`, `develop`, `native` (all reachable objects).

---

## CRITICAL

None. No live secret (API key, private key, keystore, credential) exists in the
working tree or anywhere in git history.

Two history hits that *look* alarming were run down and cleared:

| Finding | Location | Verdict |
| --- | --- | --- |
| `AIzaSyDR5yfaG7OG8sMTUj8kfQEb8T9pN8BM6Lk` | commit `8f0f5e19`, `rust-whatsapp-worker/vendor/wacore-binary/src/tokens.json` | **NOT a leak.** This is a well-known public constant baked into the WhatsApp/Baileys/whatsmeow binary-token table (ships in the vendored library, identical across every install). It is not the author's Google key. The whole `rust-whatsapp-worker/` tree was removed and is absent from the current tree. No action needed; optionally note it if a naive secret scanner flags it. |
| `sk-...` across 21 commits | env-example files + a Flutter `hintText` (`'sk-or-v1-…'`) | **NOT a leak.** Every match is a placeholder: `sk-ant-your-api-key-here`, `sk-or-v1-xxxxxxxxxxxx`, `sk-your-openai-key`, or the UI hint text. No real key. |

---

## MUST-FIX (before public)

None. No default in the app or server silently points a stranger's install at
the author's infrastructure.

- **App sync URL is user-entered, no default** — `app/lib/core/secure_store.dart`
  stores `gullak.sync.baseUrl`; onboarding (`app/lib/features/onboarding/onboarding_flow.dart`)
  and settings collect it via a blank `TextEditingController`. No baked-in host.
- **pi-server config defaults are all localhost / env-driven** —
  `pi-server/src/config.ts`: host `127.0.0.1`, port `8787`, model base
  `http://localhost:11434/v1` (local Ollama), whatsapp bridge
  `http://localhost:3000`. Every credential/URL comes from env with safe fallbacks.
  `timezone=Asia/Kolkata` and `defaultCurrency=INR` are regional defaults, not
  personal — and the app seeds currency from device locale
  (`onboarding_flow.dart:35`), so a non-Indian user isn't forced onto INR.
- **Signing keystore is not committed** — `app/android/key.properties` exists on
  disk (points to `storeFile=/Users/karan/.android/gullak-dev.jks` with real
  passwords) but is **untracked** (`git ls-files` returns nothing for it), and no
  `*.jks`/`*.keystore` is tracked or in history. `build.gradle.kts` reads it
  conditionally and falls back to the debug key when absent. A cloner never sees
  it. Recommend adding `key.properties` and `*.jks` to `.gitignore` explicitly as
  belt-and-suspenders (currently relies on it just never being `git add`ed).

---

## NOTABLE — KEEP

| file:line | value | why keep |
| --- | --- | --- |
| `app/android/app/build.gradle.kts:17,32` | `applicationId = "dev.mrkaran.gullak"` | **KEEP.** Renaming breaks upgrade-in-place for existing installs and the Play listing; author owns `mrkaran.dev`. Standard reverse-domain id. |
| `Justfile:5` | `package := "dev.mrkaran.gullak"` | KEEP — mirrors the applicationId for `adb`/`run-as` helpers. |
| `app/lib/core/notification_service.dart:34` | `'dev.mrkaran.gullak.sms_candidates'` | KEEP — Android notification channel id derived from the applicationId; changing it orphans existing channels. |
| `Justfile:134-138`, `release.md` release steps | `flutter build ipa`/`apk`, `tea release create --repo mr-karan/gullak` | KEEP — release recipes targeting the author's Gitea/tea workflow. Harmless to a public reader; they just won't run `tea`. Optional: mention in docs that these are the maintainer's release commands. |

---

## COSMETIC (docs only — reword for a public README, dev docs can stay)

| file:line | value | suggestion |
| --- | --- | --- |
| `release.md:155` | "Tasks are tracked as issues on `git.mrkaran.dev/mr-karan/gullak`" | Repoint to the public repo's issue tracker (e.g. GitHub) in any user-facing release doc, or drop the line. |
| `release.md:127` | "static site (Astro/Hugo) hosted on the homelab" | Maintainer note; fine to leave, or generalize. |
| `plan.md:139` | "Fine on a Tailscale-only homelab; not a…" (security caveat context) | Dev planning doc — leave as-is. |
| `AGENTS.md`, `CLAUDE.md`, `design.md` | reference `dev.mrkaran.gullak`, homelab, Gitea | Dev/agent docs, not user docs — fine to ship or omit from the public repo. `README.md`, `CHANGELOG.md`, `app/README.md`, `pi-server/README.md` are already clean (README only shows `http://127.0.0.1:8787`). |
| `explore-brief.md` (untracked) | this audit's own brief | Not committed; ignore. Don't ship. |

---

## Test fixtures / PII

Clean — all synthetic.

- **`test_data/chat.db`** (history only: added in `c15bb209`, removed/ignored in
  `aa8a229b`; **not in the current tree**). Extracted and inspected the historical
  blob: it's a 28 KB SQLite agent-thread seed DB. All rows use the WhatsApp jid
  `919876543210` — the canonical dummy number (same one used as the *example* in
  `whatsapp-bridge/index.js:50`). Content is fabricated ("Toni & Guy", "Netflix",
  "Landlord", "BigBasket", HDFC card). Thread title "WhatsApp: Karan" is a label on
  the dummy number, not a real chat export. Since it's already out of the tree,
  no action required; only relevant if a full history scrub is otherwise done.
- **`pi-server/src/ai/sms_parser.test.ts`** — merchant/bank SMS fixtures (TACO
  BELL, generic "Call 1800…" toll-free numbers). Fake, standard test data. Fine.
- **`app/ACCEPTANCE.md:49`** — `uber 250 split with karan` uses "karan" as a
  sample split-partner name in an acceptance example. Harmless; optionally
  genericize to "Sam" for a public repo.
- No real personal email (`@zerodha`, `@gmail`), phone number, or bank account
  number anywhere in tree or history.

---

## Defaults that assume the author's infra

None found. `pi-server/src/config.ts` is fully env-driven with localhost
fallbacks; the app never bakes in a sync host, API key, or provider key
(confirmed: Flutter side stores model keys never — pi-server holds them). WhatsApp
allowlists default to empty (allow-all in dev; `GULLAK_REQUIRE_AUTH` and the
allowlist docs cover production hardening). Google Sheets and Actual Budget export
destinations are opt-in and disabled unless their env vars are set.

---

## Safe to publish?

**Yes.** No CRITICAL or MUST-FIX blockers. No secret ever entered git history; the
two scanner-bait hits (`AIzaSy…`, `sk-…`) are respectively a public library
constant and placeholders. The signing keystore and its passwords are untracked
and out of history. All defaults are localhost/env-driven, so a stranger's install
never phones home to the author's servers.

Before flipping to public, do three low-effort things:
1. Add `key.properties` and `*.jks` to `.gitignore` explicitly (defense in depth).
2. Reword `release.md:155` (Gitea issue tracker) to point at the public tracker.
3. Decide whether to ship the dev/agent docs (`AGENTS.md`, `CLAUDE.md`,
   `design.md`, `plan.md`, `release.md`) publicly or keep them out — they're not
   sensitive, just maintainer-internal. Delete the untracked `explore-brief.md`.

Optional (not required for safety): if you want a spotless history, a
`git filter-repo` pass to drop the historical `test_data/chat.db` and the entire
removed `rust-whatsapp-worker/` vendor tree would shrink the repo, but neither
contains anything sensitive.
