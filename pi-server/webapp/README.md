# gullak-webapp

The new Gullak web front-end: Vite + React 19 + TypeScript + Tailwind v4 +
shadcn/ui. It replaces the legacy no-build Alpine app in `pi-server/web/`. Design
system: **bahi-khata** — warm paper content on a dark inked nav shell, Gambarino
for the wordmark / titles, tabular figures for every money cell.

This is the foundation + one fully-built reference page (Accounts). Transactions,
Insights, Goals, Holdings and Desires are stubs for follow-up agents to fill in
on the same scaffold.

## Develop

```bash
cd pi-server/webapp
npm install
npm run dev          # http://localhost:5173, proxies /v1 -> http://localhost:8787
```

Run the pi-server (`cd pi-server && npm run dev`) alongside it so `/v1/*` resolves
through the Vite proxy. The app reads the SAME localStorage keys as the legacy
app (`gullak_api_key`, `gullak_server_url`, `gullak_person`), so an existing
session carries over.

## Build

```bash
cd pi-server/webapp
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve dist/ locally
```

Or from `pi-server/`:

```bash
npm run webapp:install   # cd webapp && npm ci
npm run webapp:build     # cd webapp && npm run build
```

## How the server serves it

`pi-server/src/routes/web.ts` checks at startup for `webapp/dist/index.html`:

- **present** — serves the built SPA (static assets + history-mode fallback so a
  hard refresh on `/transactions` returns `index.html`). `/v1/*` is untouched and
  still returns JSON 404 for unknown paths.
- **absent** — falls back to the legacy `pi-server/web/` PWA, unchanged.

So the new UI goes live the moment `dist/` exists, and nothing regresses before
then.

## Docker (note — the Dockerfile is intentionally NOT modified here)

The current `pi-server/Dockerfile` copies `web/` and runs `tsx src/index.ts`. To
ship the new SPA in the image it needs a build stage plus one copy:

```dockerfile
# 1. Build the SPA (Node 22 matches the runtime base).
FROM node:22-bookworm-slim AS webapp
WORKDIR /app/webapp
COPY webapp/package.json webapp/package-lock.json ./
RUN npm ci
COPY webapp/ ./
RUN npm run build          # -> /app/webapp/dist

# 2. In the final stage, alongside `COPY web ./web`, add:
COPY --from=webapp /app/webapp/dist ./webapp/dist
```

`web.ts` resolves `webapp/dist` relative to `WORKDIR=/app`, matching the runtime.
Keep `COPY web ./web` too — it stays the fallback until parity is reached.

## Conventions

- Money is integer minor units; format ONLY via `src/lib/money.ts`.
- IDs are UUID text; dates are `YYYY-MM-DD`; timestamps are epoch-ms integers.
- API contracts live in `src/lib/types.ts`; typed Query hooks in `src/api/*`.
- Never `dangerouslySetInnerHTML` model/user text — chat uses safe React nodes
  (`src/components/chat/MarkdownLite.tsx`).
- Transitions are color/opacity only, `<=150ms`, and respect
  `prefers-reduced-motion`. Never transition `all`.
