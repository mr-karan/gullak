import { Hono } from "hono";

import type { AppEnv } from "../app.ts";
import {
  sheetsEnabled,
  sheetsSyncStatus,
  syncExpensesToSheet,
} from "../sheets/sync.ts";

export const sheetsRouter = new Hono<AppEnv>();

// GET /v1/sheets/status — durable push state: high-water cursor, last
// attempt/success times, last error, and the consecutive-failure count. Lets
// you see at a glance whether the sheet is current or wedged on an error.
sheetsRouter.get("/status", (c) => {
  const db = c.get("db");
  const config = c.get("config");
  return c.json(sheetsSyncStatus(db, config));
});

// POST /v1/sheets/sync — push categorised expenses to the Apps Script web app.
// Manual trigger / one-time migration. `?replace=true` clears the sheet's data
// rows first for a clean, dup-free ingest. It also runs on the optional interval.
sheetsRouter.post("/sync", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  if (!sheetsEnabled(config)) {
    return c.json(
      { error: "sheets sync not configured (GULLAK_SHEETS_WEBAPP_URL + GULLAK_SHEETS_SECRET)" },
      400,
    );
  }
  try {
    const replace = c.req.query("replace") === "true";
    const result = await syncExpensesToSheet(db, config, { replace });
    return c.json(result);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
