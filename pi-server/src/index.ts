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

// Optional periodic push of categorised expenses to the Apps Script web app.
// Disabled unless GULLAK_SHEETS_SYNC_INTERVAL_MIN > 0 and the web-app URL +
// secret are set. The push also fires after each /v1/sync/push.
if (config.sheets.syncIntervalMinutes > 0 && sheetsEnabled(config)) {
  const everyMs = config.sheets.syncIntervalMinutes * 60_000;
  setInterval(() => {
    syncExpensesToSheet(db, config)
      .then((r) =>
        console.log(
          `sheets sync: ${r.sent} sent, ${r.skipped} skipped of ${r.total}`,
        ),
      )
      .catch((e) => console.warn(`sheets sync failed: ${e}`));
  }, everyMs);
  console.log(
    `sheets auto-push every ${config.sheets.syncIntervalMinutes}m → Apps Script`,
  );
}
