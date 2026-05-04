import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { recurrences } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  accountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  payeeName: z.string().nullable().optional(),
  amountCents: z.number().int(),
  notes: z.string().nullable().optional(),
  cadence: z.enum(["daily", "weekly", "monthly", "yearly"]),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const recurrencesRouter = new Hono<AppEnv>();

recurrencesRouter.get("/", (c) => {
  const db = c.get("db");
  return c.json({ recurrences: db.select().from(recurrences).all() });
});

recurrencesRouter.post("/", async (c) => {
  const db = c.get("db");
  const parsed = upsertSchema.parse(await c.req.json());
  const id = parsed.id ?? newId();
  const at = nowMs();
  const row = {
    id,
    accountId: parsed.accountId,
    categoryId: parsed.categoryId ?? null,
    payeeId: parsed.payeeId ?? null,
    payeeName: parsed.payeeName ?? null,
    amountCents: parsed.amountCents,
    notes: parsed.notes ?? null,
    cadence: parsed.cadence,
    nextDate: parsed.nextDate,
    createdAt: at,
    updatedAt: at,
  };
  db.transaction((tx) => {
    tx.insert(recurrences).values(row).onConflictDoUpdate({
      target: recurrences.id,
      set: row,
    }).run();
    recordChange(tx, {
      resource: "recurrences",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return c.json({ recurrence: row }, 201);
});

recurrencesRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = upsertSchema.partial().parse(await c.req.json());
  const existing = db
    .select()
    .from(recurrences)
    .where(eq(recurrences.id, id))
    .get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial, updatedAt: nowMs() };
  db.transaction((tx) => {
    tx.update(recurrences).set(next).where(eq(recurrences.id, id)).run();
    recordChange(tx, {
      resource: "recurrences",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
  });
  return c.json({ recurrence: next });
});

recurrencesRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  let removed = 0;
  db.transaction((tx) => {
    const rows = tx
      .delete(recurrences)
      .where(eq(recurrences.id, id))
      .returning()
      .all();
    removed = rows.length;
    if (removed > 0) {
      recordChange(tx, {
        resource: "recurrences",
        resourceId: id,
        op: "delete",
      });
    }
  });
  if (removed === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true, id });
});
