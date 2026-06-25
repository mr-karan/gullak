import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { getDb } from "./db/index.ts";
import { sheetsEnabled, syncExpensesToSheet } from "./sheets/sync.ts";

const config = loadConfig();
const db = getDb();

migrate(db, { migrationsFolder: "./drizzle" });

const app = createApp({ db, config });

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
});

console.log(`gullak v${config.version} listening on http://${server.hostname}:${server.port}`);

// Optional periodic push of categorised expenses into the Finance Tracker.
// Disabled unless GULLAK_SHEETS_SYNC_INTERVAL_MIN > 0 and the sheet + service
// account are configured. The manual POST /v1/sheets/sync always works.
if (config.sheets.syncIntervalMinutes > 0 && sheetsEnabled(config)) {
  const everyMs = config.sheets.syncIntervalMinutes * 60_000;
  setInterval(() => {
    syncExpensesToSheet(db, config)
      .then((r) =>
        console.log(
          `sheets sync: +${r.pushed} new, ${r.updated} updated, ${r.skipped} skipped`,
        ),
      )
      .catch((e) => console.warn(`sheets sync failed: ${e}`));
  }, everyMs);
  console.log(
    `sheets auto-push every ${config.sheets.syncIntervalMinutes}m → ${config.sheets.spreadsheetId}`,
  );
}
