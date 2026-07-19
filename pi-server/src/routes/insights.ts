import { Hono } from "hono";

import type { AppEnv } from "../app.ts";
import { newPayees, topSpends } from "../repos/insights.ts";
import { computeCashFlow, computeNetWorthHistory } from "../repos/networth.ts";

// Read-only analytics for the web Insights page. Nothing here mutates financial
// rows, so no recordChange(). Kept separate from /v1/summary so the phone's
// summary calls stay lean. better-sqlite3 is synchronous — no await.
export const insightsRouter = new Hono<AppEnv>();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an int query param, clamp to [min, max], fall back to `def`. */
function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

insightsRouter.get("/net-worth-history", (c) => {
  const months = clampInt(c.req.query("months"), 12, 1, 36);
  return c.json({ history: computeNetWorthHistory(c.get("db"), months) });
});

insightsRouter.get("/cash-flow", (c) => {
  const months = clampInt(c.req.query("months"), 12, 1, 36);
  return c.json({ series: computeCashFlow(c.get("db"), months) });
});

insightsRouter.get("/top-spends", (c) => {
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  if (!startDate || !DATE_RE.test(startDate) || !endDate || !DATE_RE.test(endDate)) {
    return c.json({ error: "startDate and endDate must be YYYY-MM-DD" }, 400);
  }
  const accountId = c.req.query("accountId");
  const limit = clampInt(c.req.query("limit"), 10, 1, 50);
  return c.json({
    transactions: topSpends(c.get("db"), startDate, endDate, accountId, limit),
  });
});

insightsRouter.get("/new-payees", (c) => {
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  if (!startDate || !DATE_RE.test(startDate) || !endDate || !DATE_RE.test(endDate)) {
    return c.json({ error: "startDate and endDate must be YYYY-MM-DD" }, 400);
  }
  return c.json({ payees: newPayees(c.get("db"), startDate, endDate) });
});
