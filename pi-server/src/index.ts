import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { getDb } from "./db/index.ts";

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
