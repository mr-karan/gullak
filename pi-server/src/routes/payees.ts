import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { payees, recurrences, transactions } from "../db/schema.ts";
import {
  newId,
  nowMs,
  recordChange,
  recordCommand,
} from "../repos/changelog.ts";
import { nameField } from "./_fields.ts";
import { recomputeDerivedProjection } from "../sync/resources.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  name: nameField,
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
    useCount: 0,
    updatedAt: nowMs(),
  };
  recordCommand(db, (tx) => {
    tx.insert(payees)
      .values(row)
      .onConflictDoUpdate({
        target: payees.id,
        set: row,
      })
      .run();
    recordChange(tx, {
      resource: "payees",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
    recomputeDerivedProjection(tx);
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
  recordCommand(db, (tx) => {
    tx.update(payees).set(next).where(eq(payees.id, id)).run();
    recordChange(tx, {
      resource: "payees",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
    recomputeDerivedProjection(tx);
  });
  return c.json({ payee: next });
});

payeesRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = db.select().from(payees).where(eq(payees.id, id)).get();
  if (existing === undefined) return c.json({ error: "Not found" }, 404);
  let removed = 0;
  recordCommand(db, (tx) => {
    const at = nowMs();
    for (const row of tx
      .select()
      .from(transactions)
      .where(eq(transactions.payeeId, id))
      .all()) {
      const next = {
        ...row,
        payeeId: null,
        payeeName: existing.name,
        updatedAt: at,
      };
      tx.update(transactions)
        .set(next)
        .where(eq(transactions.id, row.id))
        .run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: row.id,
        op: "upsert",
        payload: next,
      });
    }
    for (const row of tx
      .select()
      .from(recurrences)
      .where(eq(recurrences.payeeId, id))
      .all()) {
      const next = {
        ...row,
        payeeId: null,
        payeeName: existing.name,
        updatedAt: at,
      };
      tx.update(recurrences).set(next).where(eq(recurrences.id, row.id)).run();
      recordChange(tx, {
        resource: "recurrences",
        resourceId: row.id,
        op: "upsert",
        payload: next,
      });
    }
    const rows = tx.delete(payees).where(eq(payees.id, id)).returning().all();
    removed = rows.length;
    if (removed > 0) {
      recordChange(tx, { resource: "payees", resourceId: id, op: "delete" });
    }
    recomputeDerivedProjection(tx);
  });
  return c.json({ deleted: true, id });
});
