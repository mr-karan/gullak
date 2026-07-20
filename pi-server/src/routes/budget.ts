import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { assignBudget, computeBudgetPlan } from "../repos/budget.ts";

// YNAB-style envelope plan surface. Distinct from the /v1/budgets CRUD router
// (which exposes raw budget rows); this one computes assigned/activity/available
// per category and Ready-to-Assign for a month.

const monthRe = /^\d{4}-\d{2}$/;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const assignSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(monthRe),
  assignedCents: z.number().int(),
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
