import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { computeAgeOfMoney } from "../repos/age_of_money.ts";
import { assignBudget, computeBudgetPlan } from "../repos/budget.ts";
import { deleteTarget, listTargets, upsertTarget } from "../repos/targets.ts";

// YNAB-style envelope plan surface. Distinct from the /v1/budgets CRUD router
// (which exposes raw budget rows); this one computes assigned/activity/available
// per category and Ready-to-Assign for a month.

const monthRe = /^\d{4}-\d{2}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const assignSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(monthRe),
  assignedCents: z.number().int(),
});

// Per-category target. byDate is required when type='by_date'.
const targetSchema = z
  .object({
    type: z.enum(["monthly", "by_date"]),
    amountCents: z.number().int().positive(),
    byDate: z.string().regex(dateRe).optional(),
  })
  .refine((v) => v.type !== "by_date" || !!v.byDate, {
    message: "byDate is required when type is 'by_date'",
    path: ["byDate"],
  });

export const budgetRouter = new Hono<AppEnv>();

budgetRouter.get("/plan", (c) => {
  const db = c.get("db");
  const raw = c.req.query("month");
  const month = raw ?? currentMonth();
  if (!monthRe.test(month)) {
    return c.json({ error: "month must be YYYY-MM" }, 400);
  }
  return c.json(computeBudgetPlan(db, month));
});

budgetRouter.post("/assign", async (c) => {
  const db = c.get("db");
  const { categoryId, month, assignedCents } = assignSchema.parse(
    await c.req.json(),
  );
  assignBudget(db, { categoryId, month, assignedCents });
  // Return the refreshed plan so the client updates atomically.
  return c.json(computeBudgetPlan(db, month));
});

// ── Per-category TARGETS (server-only config; not replicated) ──────────────

budgetRouter.get("/targets", (c) => {
  const db = c.get("db");
  return c.json({ targets: listTargets(db) });
});

budgetRouter.put("/targets/:categoryId", async (c) => {
  const db = c.get("db");
  const categoryId = c.req.param("categoryId");
  const { type, amountCents, byDate } = targetSchema.parse(await c.req.json());
  const target = upsertTarget(db, {
    categoryId,
    type,
    amountCents,
    byDate: byDate ?? null,
  });
  return c.json({ target });
});

budgetRouter.delete("/targets/:categoryId", (c) => {
  const db = c.get("db");
  const categoryId = c.req.param("categoryId");
  deleteTarget(db, categoryId);
  return c.body(null, 204);
});

// ── Age of Money ────────────────────────────────────────────────────────────

budgetRouter.get("/age-of-money", (c) => {
  const db = c.get("db");
  return c.json(computeAgeOfMoney(db));
});
