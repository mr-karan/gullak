import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { getDb } from "./index.ts";

const db = getDb();
migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");
