import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { createApp } from "./app.ts";
import { loadConfig, summarizeConfig } from "./config.ts";
import { getDb } from "./db/index.ts";
import { runExport } from "./destinations/run.ts";
import { sheetsEnabled } from "./sheets/sync.ts";

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
console.log("config:", JSON.stringify(summarizeConfig(config)));

// Optional periodic push of categorised expenses to the Apps Script web app.
// Disabled unless GULLAK_SHEETS_SYNC_INTERVAL_MIN > 0 and the web-app URL +
// secret are set. The push also fires after each /v1/sync/push.
if (config.sheets.syncIntervalMinutes > 0 && sheetsEnabled(config)) {
  const everyMs = config.sheets.syncIntervalMinutes * 60_000;
  setInterval(() => {
    runExport(db, config)
      .then((rs) =>
        console.log(
          `export: ${rs
            .map((r) => `${r.destination}=${r.error ? "err" : `${r.sent ?? 0} sent`}`)
            .join(", ")}`,
        ),
      )
      .catch((e) => console.warn(`export failed: ${e}`));
  }, everyMs);
  console.log(
    `sheets auto-push every ${config.sheets.syncIntervalMinutes}m → Apps Script`,
  );
}
