# Gullak

**A local-first expense tracker. Your money stays on your phone.**

Gullak logs expenses in seconds, reads your bank/UPI SMS into reviewable
drafts, and answers "where did my money go?" — all offline-first. There is no
account to create and nothing leaves your device unless *you* point it at a
sync server you run.

- **Private by default.** No trackers, no third-party cloud. The phone is the
  source of truth.
- **Optional self-hosted sync.** Run the server on a Pi, a VPS, or your homelab
  to sync across devices and enable AI parsing — with your own model keys.
- **Free and open source.** App under MIT; the sync server and WhatsApp bridge
  under AGPL-3.0.

## Start here

- **[Install](install.md)** — F-Droid, APK sideload, or build from source.
- **[SMS capture](sms-capture.md)** — turn bank/UPI messages into expenses
  automatically (Android natively; iOS via a Shortcut).
- **[Self-hosting](self-hosting.md)** — run the sync server with Docker, the
  full environment reference, and backups.

!!! note "Works with no server at all"
    Every core feature — manual entry, budgets, insights, CSV/JSON export —
    runs entirely on-device. Sync, AI SMS parsing, and receipt scanning are the
    only things that need a server, and that server is yours.
