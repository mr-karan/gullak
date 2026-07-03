import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { payees } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";
import { nameField } from "./_fields.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  name: nameField,
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
  db.transaction((tx) => {
    tx.insert(payees).values(row).onConflictDoUpdate({
      target: payees.id,
      set: row,
    }).run();
    recordChange(tx, {
      resource: "payees",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return c.json({ payee: row }, 201);
});

payeesRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = upsertSchema.partial().parse(await c.req.json());
  const existing = db.select().from(payees).where(eq(payees.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial, updatedAt: nowMs() };
  db.transaction((tx) => {
    tx.update(payees).set(next).where(eq(payees.id, id)).run();
    recordChange(tx, {
      resource: "payees",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
  });
  return c.json({ payee: next });
});

payeesRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  let removed = 0;
  db.transaction((tx) => {
    const rows = tx.delete(payees).where(eq(payees.id, id)).returning().all();
    removed = rows.length;
    if (removed > 0) {
      recordChange(tx, { resource: "payees", resourceId: id, op: "delete" });
    }
  });
  if (removed === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true, id });
});
