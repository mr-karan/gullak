import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const at = 1_700_000_000_000;

function makeApp() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const dataDir = mkdtempSync(join(tmpdir(), "gullak-messages-"));
  tmpDirs.push(dataDir);
  const config = {
    dataDir,
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

function rowById(db: Db, id: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get();
}

async function postAction(app: ReturnType<typeof makeApp>["app"], body: unknown) {
  return app.request("/v1/messages/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /v1/messages/action restore_categories re-applies prior categories", async () => {
  const { app, db } = makeApp();
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 0, createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-food", name: "Food", groupId: "g1", updatedAt: at })
    .run();
  // A transaction whose category was cleared (as if a categorize→null just ran).
  db.insert(schema.transactions)
    .values({ id: "t1", accountId: "a1", categoryId: null, amountCents: -500_00, date: "2026-07-01", createdAt: at, updatedAt: at })
    .run();

  const res = await postAction(app, {
    tool: "restore_categories",
    args: { previous: [{ id: "t1", categoryId: "c-food" }] },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    result: { data: { kind: string; restored: string[] } };
  };
  expect(body.result.data.kind).toBe("restore_categories");
  expect(body.result.data.restored).toEqual(["t1"]);

  // The category is back on the row, and a change_log row was emitted.
  expect(rowById(db, "t1")?.categoryId).toBe("c-food");
  const upserts = db
    .select()
    .from(schema.changeLog)
    .all()
    .filter((r) => r.resourceId === "t1" && r.op === "upsert");
  expect(upserts).toHaveLength(1);
});

test("POST /v1/messages/action rejects a non-whitelisted tool with 400", async () => {
  const { app, db } = makeApp();
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 0, createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t1", accountId: "a1", categoryId: null, amountCents: -500_00, date: "2026-07-01", createdAt: at, updatedAt: at })
    .run();

  // categorize_transactions is a model-facing write tool, NOT an undo tool — the
  // endpoint must refuse it so it can't be a general write bypass.
  const res = await postAction(app, {
    tool: "categorize_transactions",
    args: { transactionIds: ["t1"], categoryId: "c-food" },
  });
  expect(res.status).toBe(400);
  // Nothing was written.
  expect(rowById(db, "t1")?.categoryId).toBeNull();
});
