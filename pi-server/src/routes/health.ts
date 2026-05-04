import { Hono } from "hono";
import { sql } from "drizzle-orm";

import type { AppEnv } from "../app.ts";

export const healthRouter = new Hono<AppEnv>();

healthRouter.get("/", (c) => {
  const db = c.get("db");
  const config = c.get("config");
  let dbOk = false;
  try {
    db.run(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return c.json({
    status: dbOk ? "ok" : "degraded",
    version: config.version,
    db: dbOk,
  });
});
