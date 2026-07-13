*The app described here has since been renamed **Chavanni** (formerly Gullak).*

# Gullak — public release & monetization plan

Goal: ship Gullak to Play Store + App Store with a proper website, keep the
project **OSS and self-host-first**, and sell a **paid hosted sync server**
("Gullak Cloud") for people who don't want to run their own.

Guiding principle: the self-hosted path stays first-class and zero-regression.
Every cloud feature is the *same* code path a self-hoster runs — the paid
product is convenience (we run it, back it up, and pay the AI bill), not
gated features.

---

## 1. Product shape

| Tier | What you get | Price |
| --- | --- | --- |
| **App (free, OSS)** | Full local-first tracker. All features that run on-device. Works forever with no server. | ₹0 |
| **Self-hosted sync** | Point the app at your own pi-server. Sync, AI parsing, WhatsApp bridge. Bring your own model keys. | ₹0 (your infra) |
| **Gullak Cloud (paid)** | We host the sync server: multi-device sync, SMS/receipt/NL AI parsing with a monthly quota, backups. No keys, no infra. | subscription (TBD ₹/mo + annual) |

Non-goals for v1 of Cloud: hosted WhatsApp bridge (per-tenant Baileys pairing
is operationally heavy — revisit later), shared/household ledgers, web app.

## 2. Licensing (decision needed, recommendation below)

- **`app/` → MIT (or Apache-2.0).** Store-friendly (GPL-family licenses have a
  history of App Store takedowns, e.g. VLC), maximizes contributions.
- **`pi-server/` + `whatsapp-bridge/` → AGPL-3.0.** Anyone can self-host;
  anyone reselling a hosted version must publish their changes. This is the
  standard OSS-company moat (Grafana/Plausible model) and costs self-hosters
  nothing.
- Add `LICENSE` files per component + a "commercial hosting" note in README.

## 3. Multi-tenant server design (self-host-first)

Today: one shared `x-api-key`, one SQLite DB (`GULLAK_DB_PATH`). That stays
**exactly as-is** as the default mode.

```
GULLAK_MODE=single   (default)  — current behavior, zero new config
GULLAK_MODE=multi               — Gullak Cloud mode
```

### Tenancy model: one SQLite DB per tenant

- Control DB (`control.db`): `users`, `sessions/device_tokens`, `tenants`,
  `entitlements`, `usage_counters`.
- Data DBs: `data/tenants/<tenant_id>.db` — **the existing schema and Drizzle
  migrations, verbatim**. No `tenant_id` column sprinkled through every query;
  the auth middleware resolves token → tenant → DB handle and hands Hono the
  same `db` the single-tenant code already uses.
- Why per-tenant DBs: perfect isolation (a query bug can't leak across
  tenants), trivial per-tenant backup/restore/export/delete (GDPR/DPDP),
  migrations stay identical to self-host, and better-sqlite3 is happy with an
  LRU pool of open handles.

### Auth

- Replace the shared key with **email + magic-link (or password w/ argon2id)**
  → issues long-lived **device tokens** (`Authorization: Bearer …`), one per
  device, revocable from a devices page. App stores the token in
  flutter_secure_storage (plumbing already exists for the API key).
- Single mode keeps `x-api-key` untouched.

### Cost & abuse controls (this is the COGS)

- Per-tenant daily/monthly **AI request quotas** and token budgets; image size
  caps; model allowlist; global concurrency limit.
- Per-tenant rate limits on `/v1/sync/*` and `/v1/ai/*` (rate-limit middleware
  exists; key it by tenant instead of IP in multi mode).
- Usage metering table → drives both billing display and cutoffs.

### Billing

- **Razorpay** (India-first; Stripe later for international).
- Webhook → `entitlements` row (plan, status, period end). Server checks
  entitlement, app just renders state. Grace period on failed renewals;
  read-only sync (no AI) when lapsed — never hold user data hostage.

### App changes

- Onboarding sync step becomes three-way: **Gullak Cloud (sign in)** ·
  **Self-hosted (URL + key)** · **Skip (local only)**.
- Settings → Sync shows plan/usage for Cloud accounts.

## 4. Store readiness

### ⚠️ The SMS problem (biggest release risk — resolve first)

Google Play **restricts `READ_SMS`/`RECEIVE_SMS`** to default-SMS-handler apps
and a short exception list; "parse bank SMS for expense tracking" is not an
approved use case and is a common rejection. Options, in order of preference:

1. **Notification-listener capture**: read bank *notifications* (incl. SMS
   notifications) via `NotificationListenerService` — permitted with
   disclosure, and catches UPI-app notifications too.
2. **Play flavor without SMS** + full-featured APK on GitHub/F-Droid
   (sideload keeps `READ_SMS`).
3. Apply for the Play SMS exception (low odds, slow).

iOS has **no SMS access at all** — the iOS build ships manual + receipt-photo
+ NL entry + sync, with SMS surfaces compiled out/hidden.

### Android / Play Store

- AAB signing (upload key + Play App Signing), versionCode automation.
- Data-safety form (location optional, SMS→see above, no ads/trackers).
- Listing: title/short/long description ASO pass, 8 phone screenshots,
  feature graphic, promo video optional. Keywords: expense tracker, UPI,
  budget, money manager, private, offline.
- Closed testing track → production. (New Play accounts need 12+ testers for
  14 days before production — start this clock early.)

### iOS / App Store

- Apple Developer account, bundle id, signing via Xcode Cloud or fastlane match.
- Permission strings (location when-in-use, camera/photos for receipts).
- Privacy nutrition labels; App Review notes explaining self-host server field.
- TestFlight → review. Watch for: account-required rules (local mode avoids
  them), external-purchase rules if Cloud is sold outside IAP — **safest v1:
  don't sell Cloud inside the iOS app at all** (web-only purchase, app just
  signs in — the "reader app" pattern).

## 5. Website & docs

- Domain (e.g. `gullak.app`), static site (Astro/Hugo) hosted on the homelab
  or Pages: landing (hero screenshots, "your money stays on your phone"),
  feature tour, pricing, self-host docs (docker-compose + env reference),
  privacy policy, terms, changelog, blog (SEO: "open source expense tracker
  india", "UPI expense tracker private").
- OG images, sitemap, structured data.
- Screenshot pipeline: scripted device-frame screenshots (light+dark) reused
  for stores and site.

## 6. Release engineering

- CI (Woodpecker/Actions): `just gate` on PR; tag → build AAB/APK/IPA,
  attach to Gitea release; fastlane lanes for store uploads.
- Crash reporting: **opt-in** Sentry (self-hosted) or keep the existing
  /v1/feedback pipe; never on by default (privacy is the brand).
- Versioning: semver, `CHANGELOG.md` discipline (exists).
- Backups for Cloud: litestream/rclone per-tenant DB snapshots + restore drill.

## 7. Sequencing

| Milestone | Contents | Gate |
| --- | --- | --- |
| **M0 — Hardening** | review findings, location-capture fix, SMS capture strategy decision (notification listener spike), server rate/AI caps | `just gate` + device pass |
| **M1 — Android public** | Play listing, signing, data-safety, website v1 + privacy policy, closed testing | Play production live |
| **M2 — iOS** | iOS build w/o SMS surfaces, TestFlight, App Store listing | App Store live |
| **M3 — Multi-tenant** | control DB, auth + device tokens, per-tenant DBs, quotas, admin | self-host mode regression-free; Cloud beta w/ friends |
| **M4 — Gullak Cloud GA** | Razorpay billing, plan page in app, web signup, backups/restore drill | first paying user |

Tasks are tracked as issues on git.mrkaran.dev/mr-karan/gullak (labels:
`m0-hardening` … `m4-cloud`, `app`, `server`, `website`, `store`, `bug`).
