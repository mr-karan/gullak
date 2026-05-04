import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { payees } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  useCount: z.number().int().default(0),
});

export const payeesRouter = new Hono<AppEnv>();

payeesRouter.get("/", (c) => {
  const db = c.get("db");
  return c.json({ payees: db.select().from(payees).all() });
});

payeesRouter.post("/", async (c) => {
  const db = c.get("db");
  const parsed = upsertSchema.parse(await c.req.json());
  const id = parsed.id ?? newId();
  const row = {
    id,
    name: parsed.name,
    useCount: parsed.useCount,
    updatedAt: nowMs(),
  };
  db.insert(payees).values(row).onConflictDoUpdate({
    target: payees.id,
    set: row,
  }).run();
  recordChange(db, "payees", id, "upsert", row);
  return c.json({ payee: row }, 201);
});

payeesRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = upsertSchema.partial().parse(await c.req.json());
  const existing = db.select().from(payees).where(eq(payees.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial, updatedAt: nowMs() };
  db.update(payees).set(next).where(eq(payees.id, id)).run();
  recordChange(db, "payees", id, "upsert", next);
  return c.json({ payee: next });
});

payeesRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const removed = db.delete(payees).where(eq(payees.id, id)).returning().all();
  if (removed.length === 0) return c.json({ error: "Not found" }, 404);
  recordChange(db, "payees", id, "delete", null);
  return c.json({ deleted: true, id });
});
