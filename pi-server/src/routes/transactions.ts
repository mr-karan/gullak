import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { transactions } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  accountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  payeeName: z.string().nullable().optional(),
  amountCents: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().nullable().optional(),
  cleared: z.boolean().default(false),
  origin: z.string().default("manual"),
  originRef: z.string().nullable().optional(),
  transferAccountId: z.string().nullable().optional(),
  transferGroupId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  splitTotalCents: z.number().int().nullable().optional(),
});

export const transactionsRouter = new Hono<AppEnv>();

transactionsRouter.get("/", (c) => {
  const db = c.get("db");
  const limit = Number(c.req.query("limit") ?? "200");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const accountId = c.req.query("accountId");
  const where = [
    startDate ? gte(transactions.date, startDate) : undefined,
    endDate ? lte(transactions.date, endDate) : undefined,
    accountId ? eq(transactions.accountId, accountId) : undefined,
  ].filter((x): x is NonNullable<typeof x> => x !== undefined);
  let q = db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
  if (where.length > 0) q = q.where(and(...where)) as typeof q;
  return c.json({ transactions: q.all() });
});

transactionsRouter.get("/:id", (c) => {
  const db = c.get("db");
  const row = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, c.req.param("id")))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ transaction: row });
});

transactionsRouter.post("/", async (c) => {
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
    date: parsed.date,
    notes: parsed.notes ?? null,
    cleared: parsed.cleared,
    origin: parsed.origin,
    originRef: parsed.originRef ?? null,
    transferAccountId: parsed.transferAccountId ?? null,
    transferGroupId: parsed.transferGroupId ?? null,
    parentId: parsed.parentId ?? null,
    splitTotalCents: parsed.splitTotalCents ?? null,
    createdAt: at,
    updatedAt: at,
  };
  db.transaction((tx) => {
    tx.insert(transactions).values(row).onConflictDoUpdate({
      target: transactions.id,
      set: row,
    }).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return c.json({ transaction: row }, 201);
});

transactionsRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = upsertSchema.partial().parse(await c.req.json());
  const existing = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial, updatedAt: nowMs() };
  db.transaction((tx) => {
    tx.update(transactions).set(next).where(eq(transactions.id, id)).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
  });
  return c.json({ transaction: next });
});

transactionsRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  let removed = 0;
  db.transaction((tx) => {
    const rows = tx
      .delete(transactions)
      .where(eq(transactions.id, id))
      .returning()
      .all();
    removed = rows.length;
    if (removed > 0) {
      recordChange(tx, {
        resource: "transactions",
        resourceId: id,
        op: "delete",
      });
    }
  });
  if (removed === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true, id });
});
