# pi-server — Agent Guide

Bun + Hono + Drizzle HTTP API. The Flutter app on the user's phone is the source of truth for ledger data; this server is the cross-device merge point AND the trusted box that holds the LLM credentials. The phone never speaks to OpenRouter / OpenAI directly — it asks this server.

## Layout

```
pi-server/
├── src/
│   ├── agent/         # multi-turn natural-language assistant
│   │                  # /v1/messages, /v1/whatsapp/webhook
│   ├── ai/            # one-shot extraction prompts (sms_parser,
│   │                  # quick_entry_parser) for the Flutter pipelines
│   ├── llm/client.ts  # the only place a chat/completions fetch lives
│   ├── db/            # Drizzle schema + bun:sqlite instance + migrate
│   ├── repos/         # repos for sync changelog
│   ├── routes/        # one Hono router per resource
│   ├── app.ts         # Hono factory, auth middleware, route mounts
│   ├── config.ts      # env → AppConfig (model creds live here)
│   └── index.ts       # Bun.serve entrypoint
└── drizzle/           # generated SQL migrations
```

## Endpoints

```
GET  /v1/health
… CRUD /v1/{accounts,categories,category-groups,payees,transactions,
          budgets,recurrences}
GET  /v1/summary?startDate=&endDate=&accountId=
GET  /v1/sync/changes?since=<id>&limit=<n>
POST /v1/sync/push
POST /v1/messages              # multi-turn agent
POST /v1/whatsapp/webhook      # Baileys bridge inbound
POST /v1/ai/sms/parse          # bank/transaction SMS → SmsCandidate
POST /v1/ai/quick-entry/parse  # one-line note (or imageBase64) → ParsedExpense
```

`x-api-key` header required on every route except `/v1/health` and `/v1/whatsapp/webhook`. Configure via `GULLAK_HTTP_API_KEY`.

## Where to look

| Task | File |
|------|------|
| HTTP surface + auth gate | `src/app.ts` |
| New endpoint | `src/routes/<resource>.ts`, register in `app.ts` |
| Drizzle schema | `src/db/schema.ts` |
| Sync changelog helper | `src/repos/changelog.ts` |
| LLM call (the one fetch) | `src/llm/client.ts` |
| SMS parse prompt + zod | `src/ai/sms_parser.ts` |
| QuickEntry parse prompt + zod | `src/ai/quick_entry_parser.ts` |
| Multi-turn agent | `src/agent/agent.ts` |
| Env / model config | `src/config.ts` |

## Conventions

- **Money**: integer minor units. Never decimal-string math.
- **IDs**: UUIDs (text). Clients generate; server stores.
- **Dates**: `YYYY-MM-DD` text columns. Timestamps are ms since epoch.
- **Mutations** must call `recordChange(db, resource, id, op, payload)` so the change log captures every server-side write — sync clients pull from there.
- **bun:sqlite** is sync. No `await` on `db.select().get()`.
- **Conflict policy** (sync): last-write-wins by `updatedAt`. Single-user scope.
- **AI routes do NOT mutate financial rows.** They are draft-only; the phone takes the response and decides whether to write a transaction. The multi-turn agent at `/v1/messages` is the only path that may write.

## Model config

`config.ts` reads in priority order:
- `GULLAK_MODEL_BASE_URL` / `GULLAK_MODEL_ID` / `GULLAK_MODEL_API_KEY`
- `OPENROUTER_API_KEY` → defaults to OpenRouter + Gemini 3 Flash
- `OPENAI_API_KEY` → defaults to OpenAI + GPT-4.1 Mini
- otherwise local Ollama (`http://localhost:11434/v1` + `gpt-oss:20b`)

Every LLM caller routes through `src/llm/client.ts:chatJson`. Don't add a second fetch path; extend the helper.

## Commands

```bash
cd pi-server
bun install
bun run db:generate     # regenerate migrations from schema
bun run dev             # hot-reload server on :8787
bun run start
bun run typecheck
bun test
GULLAK_DB_PATH=/path/gullak.db bun run start
```

## Editing guidance

- Keep prompt edits tightly scoped — they affect every device parsing SMS today.
- Wrap the LLM response in a Zod schema at the boundary of `src/ai/*` so a malformed model output fails loudly instead of corrupting downstream JSON.
- If you add a new AI extraction endpoint, register it under `/v1/ai/*` and reuse `chatJson`. Do NOT roll a new fetch.
