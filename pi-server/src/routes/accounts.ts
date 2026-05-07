import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { accounts } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  kind: z.string().default("checking"),
  openingBalanceCents: z.number().int().default(0),
  reconciledBalanceCents: z.number().int().nullable().optional(),
  reconciledAt: z.number().int().nullable().optional(),
  onBudget: z.boolean().default(true),
  archived: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const accountsRouter = new Hono<AppEnv>();

accountsRouter.get("/", (c) => {
  const db = c.get("db");
  return c.json({ accounts: db.select().from(accounts).all() });
});

accountsRouter.get("/:id", (c) => {
  const db = c.get("db");
  const row = db
    .select()
    .from(accounts)
    .where(eq(accounts.id, c.req.param("id")))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ account: row });
});

accountsRouter.post("/", async (c) => {
  const db = c.get("db");
  const parsed = upsertSchema.parse(await c.req.json());
  const id = parsed.id ?? newId();
  const at = nowMs();
  const row = {
    id,
    name: parsed.name,
    kind: parsed.kind,
    openingBalanceCents: parsed.openingBalanceCents,
    reconciledBalanceCents: parsed.reconciledBalanceCents ?? null,
    reconciledAt: parsed.reconciledAt ?? null,
    onBudget: parsed.onBudget,
    archived: parsed.archived,
    sortOrder: parsed.sortOrder,
    createdAt: at,
    updatedAt: at,
  };
  db.transaction((tx) => {
    tx.insert(accounts).values(row).onConflictDoUpdate({
      target: accounts.id,
      set: row,
    }).run();
    recordChange(tx, {
      resource: "accounts",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return c.json({ account: row }, 201);
});

accountsRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = upsertSchema.partial().parse(await c.req.json());
  const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial, updatedAt: nowMs() };
  db.transaction((tx) => {
    tx.update(accounts).set(next).where(eq(accounts.id, id)).run();
    recordChange(tx, {
      resource: "accounts",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
  });
  return c.json({ account: next });
});

accountsRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  let removed = 0;
  db.transaction((tx) => {
    const rows = tx.delete(accounts).where(eq(accounts.id, id)).returning().all();
    removed = rows.length;
    if (removed > 0) {
      recordChange(tx, { resource: "accounts", resourceId: id, op: "delete" });
    }
  });
  if (removed === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true, id });
});
