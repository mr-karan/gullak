# Goals

Gullak is a local-first expense tracker. The phone owns your money data; a
self-hosted server is an optional coordination peer — never a runtime
dependency. If the server is down, the app keeps working.

## Why it exists

Most expense apps put your financial history in someone else's cloud, behind a
subscription, and make manual logging slow. Gullak inverts that:

- **Your data lives on your device**, in a plain SQLite database you can read,
  export, and back up.
- **The server is yours**, self-hosted, and holds only what the phone chooses to
  sync. It is also the one place model/API credentials live, so the app never
  ships them.
- **Logging is fast.** A single sheet handles manual entry, AI-from-text, and
  AI-from-receipt-image. On Android, bank SMS become draft transactions you
  review in one tap.

## Principles

1. **The app is fully functional offline.** Each replica records immutable,
   field-level operations. Sync unions those operations and folds them into the
   same deterministic projection without trusting wall-clock timestamps.
2. **The server is optional and self-hosted.** No hosted SaaS, no telemetry.
   Point the app at your own server URL or run with none at all.
3. **Own your credentials.** AI provider keys live only on the server. The app
   round-trips AI calls through it and never stores provider secrets.
4. **Plain, portable data.** Integer minor units for money, UUID text ids,
   `YYYY-MM-DD` dates, epoch-ms timestamps. Export to JSON/CSV any time.
5. **Interoperable, not a silo.** Categorised activity can be mirrored *out* to
   tools you already use (Google Sheets, Actual Budget) without leaving Gullak.
   See [destinations.md](destinations.md).
6. **Small, legible surface.** One server process, one schema mirrored on both
   sides, one sync protocol. Easy to read, audit, and self-host.

## Non-goals

- No multi-tenant hosted service. Gullak is single-user / self-hosted by design.
- No proprietary lock-in: nothing here should be impossible to walk away from.
- Not a full double-entry accounting system. It optimises for quick personal
  expense capture and review, and exports to dedicated tools when you want more.
