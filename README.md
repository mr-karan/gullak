# Gullak

Gullak is a local-first mobile expense tracker. The phone owns the ledger
(Drift + SQLite); an optional self-hosted server is the merge point for sync, the
home for AI credentials, and an optional WhatsApp bridge. The app works fully
offline — the server is a coordination peer, not a runtime dependency.

- **[Goals](docs/goals.md)** — what Gullak is and why.
- **[Architecture](docs/architecture.md)** — components, data model, sync, AI.
- **[Self-hosting](docs/self-hosting.md)** — run the server, connect the app.
- **[Destinations](docs/destinations.md)** — mirror activity to Sheets / Actual.

## What it does

- **Quick Entry** — manual, AI-from-text, and AI-from-receipt-image logging, plus
  a share-sheet target. Splits, transfers, tags, and optional location capture.
- **Activity & reports** — daily / weekly / calendar / monthly / summary views
  with filters across account, category, tag, amount, date, origin, and status;
  drill into a payee or category to see its transactions.
- **SMS inbox (Android)** — bank SMS are parsed by the server LLM into draft
  transactions you review and confirm in one tap.
- **Sync** — bidirectional, offline-first, last-write-wins by `updatedAt`, and
  idempotent under retry.
- **Rules** — synced payee/category mappings with priority and match history.
- **Conversational agent** — log, edit, and query expenses via chat, in-app or
  over WhatsApp.
- **Exports** — opt-in mirroring to Google Sheets and Actual Budget.
- **Backup** — local JSON export, CSV export, and restore preview.

## Layout

```
gullak/
├── app/                 # Flutter (Android/iOS) — Riverpod, Drift, go_router
│   └── lib/{core,data,features,sync}
├── pi-server/           # Node + Hono + Drizzle + better-sqlite3 (run via tsx)
│   └── src/{ai,agent,routes,repos,destinations,db}
├── whatsapp-bridge/     # Baileys → POST /v1/whatsapp/webhook
├── docs/                # goals, architecture, self-hosting, destinations
├── CHANGELOG.md
└── Justfile             # repo-wide recipes (apk, install, gate, …)
```

## Quick start

**App** (Flutter SDK required):

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run           # or: just install   (build release + adb install)
```

**Server** (Node ≥ 20 — optional; only needed for sync/AI/exports):

```bash
cd pi-server
cp .env.example .env
npm install
npm run dev           # http://127.0.0.1:8787
```

Then point the app at the server in **Settings → Sync server**. See
[self-hosting.md](docs/self-hosting.md) for production, Docker, and config.

## HTTP API

`/v1/health` and `/v1/whatsapp/webhook` are public; everything else requires
`x-api-key` when `GULLAK_HTTP_API_KEY` is set.

```
GET    /v1/health
GET/POST/PATCH/DELETE  /v1/accounts /v1/category-groups /v1/categories
                       /v1/payees /v1/transactions /v1/budgets /v1/recurrences
GET    /v1/summary?startDate=&endDate=&accountId=
GET    /v1/sync/changes?since=&limit=&clientId=      POST /v1/sync/push
POST   /v1/messages                                  (agent; may write rows)
POST   /v1/whatsapp/webhook                          (public; bridge → server)
POST   /v1/ai/quick-entry/parse   /v1/ai/sms/parse   (draft-only; 503 w/o model key)
POST   /v1/sheets/sync[?replace=true]                GET /v1/sheets/status
POST   /v1/export[?target=&replace=]                 (fan out to destinations)
POST   /v1/feedback                                  GET /v1/feedback?limit=
```

## Development

```bash
just gate                        # app: dart format --check + analyze + test
cd pi-server && npm run typecheck && npm test
```

See [`app/ACCEPTANCE.md`](app/ACCEPTANCE.md) for the pre-release checklist.

## License

[AGPL v3](./LICENSE)
