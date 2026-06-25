import { Hono } from "hono";

import type { AppEnv } from "../app.ts";
import { sheetsEnabled, syncExpensesToSheet } from "../sheets/sync.ts";

export const sheetsRouter = new Hono<AppEnv>();

// POST /v1/sheets/sync — push categorised expenses into the Finance Tracker.
// Manual trigger; a periodic interval can also be enabled via
// GULLAK_SHEETS_SYNC_INTERVAL_MIN.
sheetsRouter.post("/sync", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  if (!sheetsEnabled(config)) {
    return c.json(
      { error: "sheets sync not configured (GULLAK_SHEETS_ID + SA key)" },
      400,
    );
  }
  try {
    const result = await syncExpensesToSheet(db, config);
    return c.json(result);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
