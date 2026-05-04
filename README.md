# Gullak

Local-first mobile expense tracker with an optional self-hosted sync server. SQLite is the source of truth — both on-device (Drift, in the Flutter app) and on the homelab (Bun + Hono + Drizzle, in `pi-server`). The phone works fully offline; if you point it at a `pi-server`, multiple devices and a WhatsApp bridge converge on the same data.

## Components

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────────┐
│ Flutter app     │  HTTPS  │ pi-server        │ ←────── │ whatsapp-bridge     │
│ (Drift+SQLite)  │ ◀─────▶ │ (Bun+Hono+SQLite)│ webhook │ (Baileys, Bun)      │
└─────────────────┘         └──────────────────┘         └─────────────────────┘
```

- **`app/`** — Flutter, Riverpod, Drift, go_router. Sub-3s expense logging is the point.
- **`pi-server/`** — Bun + Hono, Drizzle ORM over `bun:sqlite`. Mirrors the Flutter Drift schema. Cross-device merge point.
- **`whatsapp-bridge/`** — Bun + Baileys WhatsApp socket. Posts inbound messages to `pi-server`.

## Stack

| | App | pi-server | bridge |
|--|--|--|--|
| Lang | Dart | TypeScript | JS/TS |
| Runtime | Flutter | Bun ≥1.1 | Bun ≥1.1 |
| HTTP | Dio | Hono | Express (light) |
| DB | Drift / sqlite3_flutter_libs | Drizzle / bun:sqlite | bun:sqlite (Baileys auth + caches) |
| Validation | (Drift typed rows) | Zod + drizzle-zod | — |
| AI | OpenAI-compatible client (default OpenRouter + Gemini 3 Flash) | pi-sdk (rewired pending) | — |

## Quick start

```bash
# pi-server
cd pi-server
bun install
bun run db:generate                       # regenerate migrations if schema changed
bun run dev                               # localhost:8787

# Flutter app
cd ../app
flutter pub get
flutter run                               # or `just install` from repo root

# whatsapp-bridge (optional)
cd ../whatsapp-bridge
bun install
bun run index.js
```

## Endpoints (pi-server)

```
GET    /v1/health
GET    /v1/accounts            POST/PATCH/DELETE /v1/accounts(/:id)
GET    /v1/category-groups     POST/PATCH/DELETE /v1/category-groups(/:id)
GET    /v1/categories          POST/PATCH/DELETE /v1/categories(/:id)
GET    /v1/payees              POST/PATCH/DELETE /v1/payees(/:id)
GET    /v1/transactions        POST/PATCH/DELETE /v1/transactions(/:id)
GET    /v1/budgets             POST/PATCH/DELETE /v1/budgets(/:id)
GET    /v1/recurrences         POST/PATCH/DELETE /v1/recurrences(/:id)
GET    /v1/summary?startDate=&endDate=&accountId=
GET    /v1/sync/changes?since=<id>
POST   /v1/sync/push
POST   /v1/messages           (stub)
POST   /v1/whatsapp/webhook   (stub)
```

Auth: `x-api-key` header. Set `GULLAK_HTTP_API_KEY` to enable.

## Configuration

Server env (all optional):

- `GULLAK_DB_PATH` — defaults to `../data/gullak.db`
- `GULLAK_HOST`, `GULLAK_PORT` — defaults `127.0.0.1:8787`
- `GULLAK_HTTP_API_KEY` — turns on the API-key gate
- `GULLAK_MODEL_*`, `OPENROUTER_API_KEY` — for the agent (when re-wired)
- `GULLAK_WHATSAPP_*` — bridge interaction

App AI defaults match the homelab: OpenRouter + `google/gemini-3-flash-preview`. Configure in onboarding or `Settings → AI assist`.

## License

[AGPL v3](./LICENSE)
