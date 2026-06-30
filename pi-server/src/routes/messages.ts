import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { handleMessage, sanitizeReply } from "../agent/agent.ts";
import type { AppEnv } from "../app.ts";
import { whatsappInboxCandidates } from "../db/schema.ts";

export const messagesRouter = new Hono<AppEnv>();

const messageBody = z.object({
  text: z.string().min(1),
  threadId: z.string().optional(),
  source: z.string().optional(),
  sourceUser: z.string().optional(),
});

messagesRouter.post("/", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const parsed = messageBody.parse(await c.req.json());
  const result = await handleMessage(db, config, parsed);
  return c.json(result);
});

export const whatsappRouter = new Hono<AppEnv>();

const whatsappBody = z.object({
  event: z.string(),
  payload: z.object({
    id: z.string().optional(),
    from: z.string().optional(),
    fromMe: z.boolean().optional(),
    author: z.string().optional(),
    authorPhone: z.string().optional(),
    pushName: z.string().nullable().optional(),
    body: z.string().optional(),
    quotedText: z.string().nullable().optional(),
    quotedMessageId: z.string().nullable().optional(),
    timestamp: z.union([z.number(), z.string()]).optional(),
  }),
});

whatsappRouter.post("/webhook", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  // The webhook is exempt from the global x-api-key gate so the bridge can
  // reach it — but if a WhatsApp key is configured, require the bridge to
  // present it, so the endpoint isn't an open injection point.
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
  const result = await handleMessage(db, config, {
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
