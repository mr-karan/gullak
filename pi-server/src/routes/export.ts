import { Hono } from "hono";

import type { AppEnv } from "../app.ts";
import { DESTINATIONS, runExport } from "../destinations/run.ts";

export const exportRouter = new Hono<AppEnv>();

// POST /v1/export?target=sheets|actual&replace=true
// Runs every enabled export destination (or just `target`). `replace=true` is a
// full re-export. The legacy POST /v1/sheets/sync remains as a sheets-only alias.
exportRouter.post("/", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const target = c.req.query("target") ?? undefined;
  if (
    target &&
    !DESTINATIONS.includes(target as (typeof DESTINATIONS)[number])
  ) {
    return c.json(
      { error: `unknown target; expected one of ${DESTINATIONS.join(", ")}` },
      400,
    );
  }
  const replace = c.req.query("replace") === "true";
  const results = await runExport(db, config, { target, replace });
  return c.json({ results });
});
