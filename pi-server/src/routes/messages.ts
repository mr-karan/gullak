import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import {
  dispatchMessage,
  sanitizeReply,
  wouldStreamViaPi,
  type AgentResponse,
} from "../agent/agent.ts";
import { streamPiMessage } from "../agent/pi/engine.ts";
import { runWriteTool, type WriteToolCall } from "../agent/write_tools.ts";
import type { AppEnv } from "../app.ts";
import { agentTurns, whatsappInboxCandidates } from "../db/schema.ts";

export const messagesRouter = new Hono<AppEnv>();

const messageBody = z.object({
  text: z.string().min(1).max(4000),
  threadId: z.string().max(128).optional(),
  source: z.string().max(64).optional(),
  sourceUser: z.string().max(128).optional(),
  // Advisory "where is the user" hint from the web sidebar. Accepted as an
  // opaque object; the agent renders it into prose for the model and silently
  // drops anything invalid/oversized. Never parsed, never drives writes.
  context: z.record(z.string(), z.unknown()).optional(),
  // Trusted structured selection from the web register — the ids of the
  // transactions the user ticked. The agent resolves these to concrete rows so
  // "categorize/delete these" acts on exactly this set. Capped at 200 ids.
  selection: z
    .object({ transactionIds: z.array(z.string().min(1)).max(200) })
    .optional(),
});

messagesRouter.post("/", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const parsed = messageBody.parse(await c.req.json());
  // The agent can now WRITE via write_tools (categorize/edit/delete/log) when the
  // user clearly asks, in addition to answering via ask_tools. The response may
  // carry an `actions` array the web UI renders as a result card + Undo.
  // TODO(rules): when the agent books a fresh txn (log_transaction), thread it
  // through runRules(db, txn) (as routes/sms.ts does) so rules normalize it too.
  const result = await dispatchMessage(db, config, parsed);
  return c.json(result);
});

// Streaming variant of POST /v1/messages. Same request body; emits Server-Sent
// Events as the pi agent works (text deltas + tool start/end), then a final
// `done` event carrying the full AgentResponse. Cheap-path / legacy requests
// (which don't stream) compute the response and emit it as a single `done`.
// Auth + body limits come from the shared /v1 middleware in app.ts.
messagesRouter.post("/stream", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const parsed = messageBody.parse(await c.req.json());
  return streamSSE(c, async (stream) => {
    try {
      if (wouldStreamViaPi(parsed)) {
        const gen = streamPiMessage(db, config, parsed);
        let result: AgentResponse;
        while (true) {
          const next = await gen.next();
          if (next.done) {
            result = next.value;
            break;
          }
          const ev = next.value;
          if (ev.type === "delta") {
            await stream.writeSSE({
              event: "delta",
              data: JSON.stringify({ text: ev.text }),
            });
          } else if (ev.type === "tool_start") {
            await stream.writeSSE({
              event: "tool_start",
              data: JSON.stringify({ tool: ev.tool }),
            });
          } else {
            await stream.writeSSE({
              event: "tool_end",
              data: JSON.stringify({ tool: ev.tool, ok: ev.ok }),
            });
          }
        }
        await stream.writeSSE({ event: "done", data: JSON.stringify(result) });
      } else {
        const result = await dispatchMessage(db, config, parsed);
        await stream.writeSSE({ event: "done", data: JSON.stringify(result) });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `stream error: ${err instanceof Error ? err.message : String(err)}`,
      );
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "The assistant hit an error." }),
      });
    }
  });
});

// Chat history ("chatrooms"). Threads already exist server-side — every turn
// lands in agent_turns keyed by threadId — these endpoints just expose them so
// the web history view can list past conversations and resume one (sending with
// the same threadId continues the server-side memory).
const MAX_THREADS = 100;
const TITLE_CHARS = 80;

const threadsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_THREADS).optional(),
});

/// "web:1a2b" → "web"; "whatsapp:+91…" → "whatsapp"; anything else → "http".
function threadSource(threadId: string): "web" | "whatsapp" | "http" {
  const prefix = threadId.split(":", 1)[0];
  return prefix === "web" || prefix === "whatsapp" ? prefix : "http";
}

messagesRouter.get("/threads", (c) => {
  const db = c.get("db");
  const { limit } = threadsQuery.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const summaries = db
    .select({
      threadId: agentTurns.threadId,
      lastAt: max(agentTurns.at),
      turnCount: count(),
    })
    .from(agentTurns)
    .groupBy(agentTurns.threadId)
    .orderBy(desc(max(agentTurns.at)))
    .limit(limit ?? 50)
    .all();

  // Title = the thread's first user turn. One tiny indexed-scan per row is fine
  // at this cap (better-sqlite3 is synchronous and agent_turns stays small).
  const threads = summaries.map((s) => {
    const first = db
      .select({ content: agentTurns.content })
      .from(agentTurns)
      .where(and(eq(agentTurns.threadId, s.threadId), eq(agentTurns.role, "user")))
      .orderBy(asc(agentTurns.id))
      .limit(1)
      .get();
    const raw = (first?.content ?? "(no messages)").replace(/\s+/g, " ").trim();
    const title = raw.length > TITLE_CHARS ? `${raw.slice(0, TITLE_CHARS).trimEnd()}…` : raw;
    return {
      threadId: s.threadId,
      title,
      lastAt: s.lastAt ?? 0,
      turnCount: s.turnCount,
      source: threadSource(s.threadId),
    };
  });
  return c.json({ threads });
});

const MAX_THREAD_TURNS = 200;

messagesRouter.get("/threads/:threadId", (c) => {
  const db = c.get("db");
  const threadId = c.req.param("threadId");
  const turns = db
    .select({
      id: agentTurns.id,
      role: agentTurns.role,
      content: agentTurns.content,
      at: agentTurns.at,
    })
    .from(agentTurns)
    .where(eq(agentTurns.threadId, threadId))
    .orderBy(asc(agentTurns.id))
    .limit(MAX_THREAD_TURNS)
    .all();
  if (turns.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ turns });
});

// Direct-action endpoint for the web UI's Undo button. Undo can't go through the
// LLM: the restore_* tools are deliberately NOT offered to the model (their args
// are full row payloads / prior categories the server authors). This endpoint
// replays a server-authored `{tool, args}` directly. The whitelist is the undo
// set — note that edit_transaction and delete_transactions ARE general write
// tools (undoing an edit is an edit; undoing a log is a delete), so an
// authenticated caller CAN reach them here. The blast radius is bounded by the
// x-api-key gate, the shared messages rate limiter (registered explicitly per
// path in app.ts — Hono use(path) does NOT prefix-match), and the write tools'
// own guards (reconcile locks, the 50-id delete cap in deleteTransactions).
const UNDO_TOOLS = [
  "restore_categories",
  "restore_transactions",
  "edit_transaction",
  "delete_transactions",
] as const;

const actionBody = z.object({
  tool: z.enum(UNDO_TOOLS),
  // Server-authored undo args (previous categories / full row payloads / edit
  // fields). Passed straight to runWriteTool, which guards its own inputs.
  args: z.unknown(),
});

messagesRouter.post("/action", async (c) => {
  const db = c.get("db");
  const parsed = actionBody.parse(await c.req.json());
  const params =
    parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
      ? (parsed.args as WriteToolCall["params"])
      : {};
  const result = runWriteTool(db, { tool: parsed.tool, params });
  return c.json({ result });
});

export const whatsappRouter = new Hono<AppEnv>();

const whatsappBody = z.object({
  event: z.string().max(64),
  payload: z.object({
    id: z.string().max(256).optional(),
    from: z.string().max(256).optional(),
    fromMe: z.boolean().optional(),
    author: z.string().max(256).optional(),
    authorPhone: z.string().max(64).optional(),
    pushName: z.string().max(256).nullable().optional(),
    body: z.string().max(4000).optional(),
    quotedText: z.string().max(4000).nullable().optional(),
    quotedMessageId: z.string().max(256).nullable().optional(),
    timestamp: z.union([z.number(), z.string().max(32)]).optional(),
  }),
});

whatsappRouter.post("/webhook", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  // The webhook is exempt from the global x-api-key gate so the bridge can
  // reach it. The agent log-path can WRITE financial rows, so lock it down with
  // a DEDICATED key: when GULLAK_WHATSAPP_API_KEY is set, require it. We do NOT
  // accept the general httpApiKey here — the bridge only knows the WhatsApp key,
  // and requiring the http key would silently 401 every existing bridge that
  // was set up before this key existed. Operators who want the webhook secured
  // set GULLAK_WHATSAPP_API_KEY on both sides; index.ts warns at boot when it's
  // reachable without one.
  if (
    config.whatsappApiKey &&
    c.req.header("x-api-key") !== config.whatsappApiKey
  ) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const parsed = whatsappBody.parse(await c.req.json());
  if (parsed.event !== "message" || parsed.payload.fromMe) {
    return c.json({ ignored: true });
  }
  const text = (parsed.payload.body ?? "").trim();
  if (!text) return c.json({ ignored: true });

  const receivedAtMs = toMs(parsed.payload.timestamp);
  const result = await dispatchMessage(db, config, {
    text,
    source: "whatsapp",
    sourceUser: parsed.payload.authorPhone ?? parsed.payload.from,
    pushName: parsed.payload.pushName ?? undefined,
    chatId: parsed.payload.from,
    messageId: parsed.payload.id,
    receivedAtMs,
  });

  // Final sanitization before anything leaves the building. The agent
  // already sanitizes, but the WhatsApp surface is user-visible and
  // worth double-defending against future regressions.
  const reply = sanitizeReply(result.reply);

  if (config.whatsappBridgeUrl && parsed.payload.from) {
    void postReply(
      config.whatsappBridgeUrl,
      config.whatsappApiKey,
      parsed.payload.from,
      reply,
    );
  }

  return c.json({ ...result, reply });
});

function toMs(t: number | string | undefined): number {
  if (typeof t === "number") {
    // WhatsApp/Baileys timestamps are seconds.
    return t > 1e12 ? t : t * 1000;
  }
  if (typeof t === "string") {
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }
  return Date.now();
}

async function postReply(
  bridgeUrl: string,
  apiKey: string | undefined,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    await fetch(`${bridgeUrl.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({ chatId, text }),
    });
  } catch {
    // ignore — we already returned the result to whoever pushed the
    // webhook. The Flutter UI doesn't depend on this round-trip.
  }
}

// Inbox-candidate delivery queue. The phone polls `inbox-candidates`
// during sync, imports each row into its local `sms_messages`, and acks
// via `inbox-candidates/ack` so the server can mark them delivered.
const inboxCandidatesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const whatsappInboxRouter = new Hono<AppEnv>();

whatsappInboxRouter.get("/", async (c) => {
  const db = c.get("db");
  const { limit } = inboxCandidatesQuery.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const cap = limit ?? 50;
  const rows = db
    .select()
    .from(whatsappInboxCandidates)
    .where(eq(whatsappInboxCandidates.status, "pending"))
    .orderBy(whatsappInboxCandidates.createdAt)
    .limit(cap)
    .all();
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      source: r.source,
      sourceUser: r.sourceUser,
      pushName: r.pushName,
      chatId: r.chatId,
      messageId: r.messageId,
      itemIndex: r.itemIndex,
      body: r.body,
      receivedAt: r.receivedAt,
      candidateJson: r.candidateJson,
      createdAt: r.createdAt,
    })),
  });
});

const ackBody = z.object({
  ids: z.array(z.string()).max(200),
});

whatsappInboxRouter.post("/ack", async (c) => {
  const db = c.get("db");
  const parsed = ackBody.parse(await c.req.json());
  if (parsed.ids.length === 0) return c.json({ acked: 0 });
  const at = Date.now();
  db.update(whatsappInboxCandidates)
    .set({ status: "delivered", deliveredAt: at })
    .where(
      and(
        inArray(whatsappInboxCandidates.id, parsed.ids),
        eq(whatsappInboxCandidates.status, "pending"),
      ),
    )
    .run();
  return c.json({ acked: parsed.ids.length });
});
