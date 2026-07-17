import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createApp } from "./app.ts";
import { loadConfig, summarizeConfig } from "./config.ts";
import { getDb } from "./db/index.ts";
import { runExport } from "./destinations/run.ts";
import { sheetsEnabled } from "./sheets/sync.ts";

const config = loadConfig();
const db = getDb();

migrate(db, { migrationsFolder: "./drizzle" });

const app = createApp({ db, config });

serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.log(`gullak v${config.version} listening on http://${config.host}:${config.port}`);
console.log("config:", JSON.stringify(summarizeConfig(config)));

// The WhatsApp webhook can write financial rows via the agent log-path, and it
// is exempt from the global x-api-key gate so the bridge can reach it. It is
// secured only by GULLAK_WHATSAPP_API_KEY; without that key it is open to
// anyone who can reach it, regardless of GULLAK_HTTP_API_KEY. Warn whenever the
// bridge could plausibly be in use (bridge URL configured) but no dedicated key
// guards the webhook. Fine on a trusted-only network (Tailscale); risky if
// exposed.
if (!config.whatsappApiKey) {
  console.warn(
    "WARNING: GULLAK_WHATSAPP_API_KEY is unset — the WhatsApp webhook is " +
      "unauthenticated and can create transactions. Set it (on the server and " +
      "the bridge) to secure it, or keep the server on a trusted network. " +
      "See docs/self-hosting.md.",
  );
}

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
