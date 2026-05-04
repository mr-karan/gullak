import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { budgets } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  targetCents: z.number().int(),
  rolloverCents: z.number().int().default(0),
});

export const budgetsRouter = new Hono<AppEnv>();

budgetsRouter.get("/", (c) => {
  const db = c.get("db");
  return c.json({ budgets: db.select().from(budgets).all() });
});

budgetsRouter.post("/", async (c) => {
  const db = c.get("db");
  const parsed = upsertSchema.parse(await c.req.json());
  const id = parsed.id ?? newId();
  const row = {
    id,
    categoryId: parsed.categoryId,
    month: parsed.month,
    targetCents: parsed.targetCents,
    rolloverCents: parsed.rolloverCents,
    updatedAt: nowMs(),
  };
  db.insert(budgets).values(row).onConflictDoUpdate({
    target: budgets.id,
    set: row,
  }).run();
  recordChange(db, "budgets", id, "upsert", row);
  return c.json({ budget: row }, 201);
});

budgetsRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = upsertSchema.partial().parse(await c.req.json());
  const existing = db.select().from(budgets).where(eq(budgets.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial, updatedAt: nowMs() };
  db.update(budgets).set(next).where(eq(budgets.id, id)).run();
  recordChange(db, "budgets", id, "upsert", next);
  return c.json({ budget: next });
});

budgetsRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const removed = db.delete(budgets).where(eq(budgets.id, id)).returning().all();
  if (removed.length === 0) return c.json({ error: "Not found" }, 404);
  recordChange(db, "budgets", id, "delete", null);
  return c.json({ deleted: true, id });
});
