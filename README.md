# Chavanni

**Your money stays on your phone.**

Chavanni is a local-first expense tracker. The phone owns your ledger — a Drift +
SQLite database on your device — and everything works fully offline, with no
account and no server. When you want sync across devices or AI-assisted entry,
you run a small server yourself. There is no Chavanni-operated cloud, no
telemetry, and no third-party trackers.

<!-- Screenshot strip. PNGs are dropped in by the screenshot pipeline. -->
<p align="center">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/1.png" width="19%" alt="Home">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/2.png" width="19%" alt="Quick Entry">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/3.png" width="19%" alt="SMS Inbox">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/4.png" width="19%" alt="Insights">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/5.png" width="19%" alt="Budget">
</p>

## Features

- **Frictionless capture** — manual entry tuned for repeat payees (amount to
  saved in three taps), AI "describe it" text entry, receipt-photo parsing, and
  a system share-sheet target. Splits, transfers, and tags included.
- **SMS inbox (Android, optional)** — bank SMS become draft transactions you
  review and confirm in one tap. Parsing runs on *your* server, not ours.
- **Insights & budgets** — trends, spending by category, and a spend heatmap
  via an in-app chart kit; monthly budget envelopes with per-category rings.
- **Sync** — bidirectional, offline-first, last-write-wins by `updatedAt`, and
  idempotent under retry.
- **Conversational agent** — log, edit, and query expenses by chat, in-app or
  over WhatsApp.
- **Exports** — opt-in mirroring to Google Sheets and Actual Budget.
- **Backup** — local JSON export, CSV export, and restore preview.

## Architecture

```
┌─────────────┐        sync + AI         ┌──────────────┐
│    App      │  ───────────────────────▶│  pi-server   │
│  (phone)    │◀─────────────────────────│  (optional)  │
│             │   source of truth here    │  Node+SQLite │
└─────────────┘                          └──────┬───────┘
   Flutter                                       │ webhook
   Drift/SQLite                          ┌───────▼────────┐
   works fully offline                   │ whatsapp-bridge│
                                         │  (optional)    │
                                         └────────────────┘
```

- **`app/`** — Flutter (Android/iOS). Riverpod, Drift/SQLite, go_router. The
  source of truth; works fully offline.
- **`pi-server/`** — Node + Hono + Drizzle + better-sqlite3. Optional. A sync
  merge point that also holds your AI provider keys and runs extraction/agent
  calls. Bring your own OpenAI-compatible model.
- **`whatsapp-bridge/`** — optional Baileys bridge that relays WhatsApp
  messages to the server's agent.

The app never stores model provider credentials — all AI round-trips through a
server you control.

## Quick start

### Install the app

Download the latest APK from
**[GitHub Releases](https://github.com/mr-karan/chavanni/releases)** and sideload
it (F-Droid coming soon). See **[website/docs/install.md](website/docs/install.md)** for
sideloading, building from source, and an honest explanation of the SMS
permission.

### Self-host the server (optional)

```bash
cd pi-server
cp .env.example .env
npm install
npm run dev            # http://127.0.0.1:8787
```

Then point the app at it in **Settings → Sync server**. For Docker,
`docker-compose.yml`, the full environment reference, reverse-proxy, and backup
guidance, see **[website/docs/self-hosting.md](website/docs/self-hosting.md)**.

## Documentation

- **[Install](website/docs/install.md)** — F-Droid, APK sideload, build from source, SMS permission.
- **[Self-hosting](website/docs/self-hosting.md)** — run the sync server, Docker, env reference, backups.
- **[Contributing](CONTRIBUTING.md)** — dev setup and conventions.

## Built for one, shared with everyone

Chavanni started as a tool for one person's actual finances, then got cleaned up
enough to share. That shapes it: opinionated defaults (₹, `Asia/Kolkata`, UPI
SMS formats), a homelab-first server, and features that exist because they were
needed, not because a roadmap demanded them. It's shared in the hope it's useful
to you too — issues and pull requests are welcome.

## License


- **`app/`** — MIT.
- **`pi-server/`** and **`whatsapp-bridge/`** — AGPL-3.0.

Self-hosting costs you nothing under either license. The AGPL on the server
means anyone who offers a *hosted* version of it to others must publish their
changes. See the per-component `LICENSE` files.
