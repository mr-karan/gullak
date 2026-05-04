import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "./schema.ts";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const path = resolve(process.env.GULLAK_DB_PATH ?? "../data/gullak.db");
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  // WAL gives concurrent readers + a single writer, which is what we
  // want for a personal API server with a few clients.
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");
  _db = drizzle(sqlite, { schema });
  return _db;
}

export { schema };
