import { gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { changeLog } from "../db/schema.ts";
import { recordChange } from "../repos/changelog.ts";

export const syncRouter = new Hono<AppEnv>();

// GET /v1/sync/changes?since=<id>&limit=500
// Pulls server changes that happened after the cursor `since`.
// Clients persist the last seen id locally and pass it back next time.
syncRouter.get("/changes", (c) => {
  const db = c.get("db");
  const since = Number(c.req.query("since") ?? "0");
  const limit = Math.min(Number(c.req.query("limit") ?? "500"), 5000);
  const rows = db
    .select()
    .from(changeLog)
    .where(gt(changeLog.id, Number.isFinite(since) ? since : 0))
    .orderBy(changeLog.id)
    .limit(limit)
    .all();
  const cursor = rows.length > 0 ? rows[rows.length - 1]!.id : since;
  return c.json({ changes: rows, cursor });
});

const pushBodySchema = z.object({
  clientId: z.string().min(1),
  changes: z.array(
    z.object({
      resource: z.string().min(1),
      resourceId: z.string().min(1),
      op: z.enum(["upsert", "delete"]),
      payload: z.unknown().nullable().optional(),
    }),
  ),
});

// POST /v1/sync/push
// Clients send a batch of their local changes; we just append them to
// the change log. Per-resource routes handle real upsert/delete; this
// is a thin "log only" path for clients that already wrote locally
// and want their mutations reflected on the server.
syncRouter.post("/push", async (c) => {
  const db = c.get("db");
  const parsed = pushBodySchema.parse(await c.req.json());
  for (const change of parsed.changes) {
    recordChange(
      db,
      change.resource,
      change.resourceId,
      change.op,
      change.payload ?? null,
      parsed.clientId,
    );
  }
  return c.json({ accepted: parsed.changes.length });
});
