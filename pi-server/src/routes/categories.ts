import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { categories, categoryGroups } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

const groupUpsertSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  isIncome: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const categoryUpsertSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  groupId: z.string().min(1),
  color: z.number().int().nullable().optional(),
  icon: z.string().nullable().optional(),
  hidden: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const groups = new Hono<AppEnv>();

groups.get("/", (c) => {
  const db = c.get("db");
  return c.json({ groups: db.select().from(categoryGroups).all() });
});

groups.post("/", async (c) => {
  const db = c.get("db");
  const parsed = groupUpsertSchema.parse(await c.req.json());
  const id = parsed.id ?? newId();
  const row = {
    id,
    name: parsed.name,
    isIncome: parsed.isIncome,
    sortOrder: parsed.sortOrder,
  };
  db.transaction((tx) => {
    tx.insert(categoryGroups).values(row).onConflictDoUpdate({
      target: categoryGroups.id,
      set: row,
    }).run();
    recordChange(tx, {
      resource: "category_groups",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return c.json({ group: row }, 201);
});

groups.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = groupUpsertSchema.partial().parse(await c.req.json());
  const existing = db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.id, id))
    .get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial };
  db.transaction((tx) => {
    tx.update(categoryGroups).set(next).where(eq(categoryGroups.id, id)).run();
    recordChange(tx, {
      resource: "category_groups",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
  });
  return c.json({ group: next });
});

groups.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  let removed = 0;
  db.transaction((tx) => {
    const rows = tx
      .delete(categoryGroups)
      .where(eq(categoryGroups.id, id))
      .returning()
      .all();
    removed = rows.length;
    if (removed > 0) {
      recordChange(tx, {
        resource: "category_groups",
        resourceId: id,
        op: "delete",
      });
    }
  });
  if (removed === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true, id });
});

const cats = new Hono<AppEnv>();

cats.get("/", (c) => {
  const db = c.get("db");
  return c.json({ categories: db.select().from(categories).all() });
});

cats.post("/", async (c) => {
  const db = c.get("db");
  const parsed = categoryUpsertSchema.parse(await c.req.json());
  const id = parsed.id ?? newId();
  const row = {
    id,
    name: parsed.name,
    groupId: parsed.groupId,
    color: parsed.color ?? null,
    icon: parsed.icon ?? null,
    hidden: parsed.hidden,
    sortOrder: parsed.sortOrder,
    updatedAt: nowMs(),
  };
  db.transaction((tx) => {
    tx.insert(categories).values(row).onConflictDoUpdate({
      target: categories.id,
      set: row,
    }).run();
    recordChange(tx, {
      resource: "categories",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return c.json({ category: row }, 201);
});

cats.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const partial = categoryUpsertSchema.partial().parse(await c.req.json());
  const existing = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = { ...existing, ...partial, updatedAt: nowMs() };
  db.transaction((tx) => {
    tx.update(categories).set(next).where(eq(categories.id, id)).run();
    recordChange(tx, {
      resource: "categories",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
  });
  return c.json({ category: next });
});

cats.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  let removed = 0;
  db.transaction((tx) => {
    const rows = tx.delete(categories).where(eq(categories.id, id)).returning().all();
    removed = rows.length;
    if (removed > 0) {
      recordChange(tx, {
        resource: "categories",
        resourceId: id,
        op: "delete",
      });
    }
  });
  if (removed === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true, id });
});

export const categoriesRouter = { groups, categories: cats };
