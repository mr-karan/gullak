import { Hono } from "hono";
import { z } from "zod";

import { handleMessage } from "../agent/agent.ts";
import type { AppEnv } from "../app.ts";

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
  const parsed = whatsappBody.parse(await c.req.json());
  if (parsed.event !== "message" || parsed.payload.fromMe) {
    return c.json({ ignored: true });
  }
  const text = (parsed.payload.body ?? "").trim();
  if (!text) return c.json({ ignored: true });

  const result = await handleMessage(db, config, {
    text,
    source: "whatsapp",
    sourceUser: parsed.payload.authorPhone ?? parsed.payload.from,
  });

  // Best-effort send back through the bridge. Failures don't block the
  // webhook response — the agent has already persisted the txn.
  if (config.whatsappBridgeUrl && parsed.payload.from) {
    void postReply(
      config.whatsappBridgeUrl,
      config.whatsappApiKey,
      parsed.payload.from,
      result.reply,
    );
  }

  return c.json(result);
});

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
