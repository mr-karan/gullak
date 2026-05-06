import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { schema } from "../db/index.ts";

const feedbackBody = z.object({
  kind: z.string().min(1).max(80),
  message: z.string().max(1000).nullish(),
  clientId: z.string().max(120).nullish(),
  payload: z.record(z.unknown()).default({}),
});

export const feedbackRouter = new Hono<AppEnv>()
  .post("/", async (c) => {
    const body = feedbackBody.parse(await c.req.json());
    const db = c.get("db");
    const inserted = db
      .insert(schema.feedbackEvents)
      .values({
        kind: body.kind,
        message: body.message?.trim() || null,
        clientId: body.clientId?.trim() || null,
        payload: JSON.stringify(body.payload),
      })
      .returning({ id: schema.feedbackEvents.id, createdAt: schema.feedbackEvents.createdAt })
      .get();
    console.warn("feedback_event", JSON.stringify({ id: inserted.id, kind: body.kind, message: body.message ?? null }));
    return c.json({ ok: true, id: inserted.id, createdAt: inserted.createdAt });
  })
  .get("/", (c) => {
    const db = c.get("db");
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 200);
    const rows = db
      .select()
      .from(schema.feedbackEvents)
      .orderBy(desc(schema.feedbackEvents.id))
      .limit(limit)
      .all();
    return c.json({
      events: rows.map((r) => ({
        ...r,
        payload: safeJson(r.payload),
      })),
    });
  });

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
