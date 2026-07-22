import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { deleteTarget, listTargets, upsertTarget } from "./targets.ts";

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

function makeApp() {
  const db = makeDb();
  const config = {
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

test("upsertTarget inserts then updates the same row (PK = categoryId)", () => {
  const db = makeDb();
  const first = upsertTarget(db, { categoryId: "food", type: "monthly", amountCents: 100_00 });
  expect(first.amountCents).toBe(100_00);

  const second = upsertTarget(db, {
    categoryId: "food",
    type: "by_date",
    amountCents: 300_00,
    byDate: "2026-06-30",
  });
  expect(second.type).toBe("by_date");
  expect(second.byDate).toBe("2026-06-30");
  // createdAt preserved across upsert.
  expect(second.createdAt).toBe(first.createdAt);

  const all = listTargets(db);
  expect(all).toHaveLength(1);
  expect(all[0]!.amountCents).toBe(300_00);
});

test("deleteTarget removes the row", () => {
  const db = makeDb();
  upsertTarget(db, { categoryId: "food", type: "monthly", amountCents: 100_00 });
  expect(deleteTarget(db, "food")).toBe(true);
  expect(listTargets(db)).toHaveLength(0);
  expect(deleteTarget(db, "food")).toBe(false);
});

test("targets CRUD via routes; no sync event written", async () => {
  const { app, db } = makeApp();

  // PUT monthly.
  const put = await app.request("/v1/budget/targets/food", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "monthly", amountCents: 100_00 }),
  });
  expect(put.status).toBe(200);
  expect(((await put.json()) as { target: { amountCents: number } }).target.amountCents).toBe(100_00);

  // GET lists it.
  const list = (await (await app.request("/v1/budget/targets")).json()) as {
    targets: { categoryId: string; type: string }[];
  };
  expect(list.targets).toHaveLength(1);
  expect(list.targets[0]!.categoryId).toBe("food");

  // by_date without byDate → 400.
  const bad = await app.request("/v1/budget/targets/trip", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "by_date", amountCents: 200_00 }),
  });
  expect(bad.status).toBe(400);

  // amountCents must be positive → 400.
  const zero = await app.request("/v1/budget/targets/trip", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "monthly", amountCents: 0 }),
  });
  expect(zero.status).toBe(400);

  // DELETE → 204, list empty.
  const del = await app.request("/v1/budget/targets/food", { method: "DELETE" });
  expect(del.status).toBe(204);
  const empty = (await (await app.request("/v1/budget/targets")).json()) as {
    targets: unknown[];
  };
  expect(empty.targets).toHaveLength(0);

  // Server-only config: never touches the sync changelog.
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});
