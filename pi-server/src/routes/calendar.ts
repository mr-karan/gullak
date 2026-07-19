import { Hono } from "hono";

import type { AppEnv } from "../app.ts";
import { computeCalendar } from "../repos/calendar.ts";

export const calendarRouter = new Hono<AppEnv>();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /v1/calendar?startDate=&endDate=&accountId=
// Read-only per-day spend totals for the month-grid. startDate/endDate are
// required and must be YYYY-MM-DD.
calendarRouter.get("/", (c) => {
  const db = c.get("db");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const accountId = c.req.query("accountId");
  if (
    !startDate ||
    !endDate ||
    !DATE_RE.test(startDate) ||
    !DATE_RE.test(endDate)
  ) {
    return c.json({ error: "startDate/endDate must be YYYY-MM-DD" }, 400);
  }
  const days = computeCalendar(db, startDate, endDate, accountId);
  return c.json({ days });
});
