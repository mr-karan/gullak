import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { goals, holdings } from "../db/schema.ts";
import { newId, nowMs } from "../repos/changelog.ts";

// Goals are server-only: NO recordChange (see M5 epic). All money math is
// integer cents; progress sums the derived currentCents/investedCents columns
// of mapped, non-stale holdings.

const createSchema = z.object({
  name: z.string().min(1).max(200),
  emoji: z.string().max(16).nullish(),
  targetCents: z.number().int(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

const patchSchema = createSchema.partial();

export const goalsRouter = new Hono<AppEnv>();

/** Per-goal current/invested totals over mapped, non-stale holdings. */
function progressByGoal(db: AppEnv["Variables"]["db"]) {
  const rows = db
    .select({
      goalId: holdings.goalId,
      currentCents: sql<number>`COALESCE(SUM(${holdings.currentCents}), 0)`,
      investedCents: sql<number>`COALESCE(SUM(${holdings.investedCents}), 0)`,
      holdingCount: sql<number>`COUNT(*)`,
    })
    .from(holdings)
    .where(and(sql`${holdings.goalId} IS NOT NULL`, eq(holdings.stale, false)))
    .groupBy(holdings.goalId)
    .all();
  const map = new Map<string, { currentCents: number; investedCents: number; holdingCount: number }>();
  for (const r of rows) {
    if (r.goalId) {
      map.set(r.goalId, {
        currentCents: r.currentCents,
        investedCents: r.investedCents,
        holdingCount: r.holdingCount,
      });
    }
  }
  return map;
}

goalsRouter.get("/", (c) => {
  const db = c.get("db");
  const goalRows = db
    .select()
    .from(goals)
    .orderBy(goals.sortOrder, goals.createdAt)
    .all();
  const progress = progressByGoal(db);

  const out = goalRows.map((g) => {
    const p = progress.get(g.id) ?? { currentCents: 0, investedCents: 0, holdingCount: 0 };
    const pct =
      g.targetCents > 0
        ? Math.round((p.currentCents / g.targetCents) * 100)
        : 0;
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      targetCents: g.targetCents,
      targetDate: g.targetDate,
      notes: g.notes,
      sortOrder: g.sortOrder,
      archived: g.archived,
      currentCents: p.currentCents,
      investedCents: p.investedCents,
      holdingCount: p.holdingCount,
      pct,
    };
  });

  // "Not yet allocated" bucket: current value of non-stale, unmapped holdings.
  const unmapped = db
    .select({
      currentCents: sql<number>`COALESCE(SUM(${holdings.currentCents}), 0)`,
    })
    .from(holdings)
    .where(and(isNull(holdings.goalId), eq(holdings.stale, false)))
    .get();

  return c.json({ goals: out, unmappedCents: unmapped?.currentCents ?? 0 });
});

goalsRouter.post("/", async (c) => {
  const db = c.get("db");
  const body = createSchema.parse(await c.req.json());
  const id = newId();
  const at = nowMs();
  const row = {
    id,
    name: body.name,
    emoji: body.emoji ?? null,
    targetCents: body.targetCents,
    targetDate: body.targetDate ?? null,
    notes: body.notes ?? null,
    sortOrder: body.sortOrder ?? 0,
    archived: body.archived ?? false,
    createdAt: at,
    updatedAt: at,
  };
  db.insert(goals).values(row).run();
  return c.json({ goal: row }, 201);
});

goalsRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = patchSchema.parse(await c.req.json());
  const existing = db.select().from(goals).where(eq(goals.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = {
    ...existing,
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.emoji !== undefined ? { emoji: body.emoji ?? null } : {}),
    ...(body.targetCents !== undefined ? { targetCents: body.targetCents } : {}),
    ...(body.targetDate !== undefined ? { targetDate: body.targetDate ?? null } : {}),
    ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
    ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    ...(body.archived !== undefined ? { archived: body.archived } : {}),
    updatedAt: nowMs(),
  };
  db.update(goals).set(next).where(eq(goals.id, id)).run();
  return c.json({ goal: next });
});

goalsRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = db.select().from(goals).where(eq(goals.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  // Refuse to delete a goal that still has holdings mapped to it — deleting
  // would silently orphan the mapping. The UI must unmap or reassign first.
  const mapped = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(holdings)
    .where(eq(holdings.goalId, id))
    .get();
  if ((mapped?.count ?? 0) > 0) {
    return c.json(
      {
        error: `Cannot delete: ${mapped!.count} holding(s) are mapped to this goal. Unmap them first.`,
      },
      409,
    );
  }
  db.delete(goals).where(eq(goals.id, id)).run();
  return c.body(null, 204);
});
