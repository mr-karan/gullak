import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../app.ts";
import { transactions } from "../db/schema.ts";

export const summaryRouter = new Hono<AppEnv>();

summaryRouter.get("/", (c) => {
  const db = c.get("db");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const accountId = c.req.query("accountId");

  const where = [
    startDate ? gte(transactions.date, startDate) : undefined,
    endDate ? lte(transactions.date, endDate) : undefined,
    accountId ? eq(transactions.accountId, accountId) : undefined,
  ].filter((x): x is NonNullable<typeof x> => x !== undefined);

  const incomeExpr = sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`;
  const expenseExpr = sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} < 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`;
  const totalExpr = sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`;

  let q = db
    .select({
      incomeCents: incomeExpr,
      expenseCents: expenseExpr,
      netCents: totalExpr,
    })
    .from(transactions);
  if (where.length > 0) q = q.where(and(...where)) as typeof q;
  const result = q.get() ?? {
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
  };
  return c.json(result);
});
