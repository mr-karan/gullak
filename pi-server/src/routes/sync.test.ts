import Database from "better-sqlite3";
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";

type PushResult = {
  accepted: number;
  applied: number;
  deduped: number;
  stale: number;
};

function makeApp(apiKey?: string) {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const config = {
    httpApiKey: apiKey,
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

function push(app: ReturnType<typeof makeApp>["app"], clientId: string, changes: unknown[]) {
  return app.request("/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, changes }),
  });
}

const txn = (o: { ccid?: string; updatedAt?: number; amountCents?: number } = {}) => ({
  clientChangeId: o.ccid ?? "c1",
  resource: "transactions",
  resourceId: "t1",
  op: "upsert",
  payload: {
    id: "t1",
    accountId: "a1",
    amountCents: o.amountCents ?? -5000,
    date: "2026-06-30",
    updatedAt: o.updatedAt ?? 1000,
  },
});

test("push applies an upsert and persists it", async () => {
  const { app, db } = makeApp();
  const res = await push(app, "phone", [txn()]);
  expect(res.status).toBe(200);
  expect(((await res.json()) as PushResult).applied).toBe(1);
  const row = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t1"))
    .get();
  expect(row?.amountCents).toBe(-5000);
});

test("a retried clientChangeId is deduped (idempotent), not re-applied", async () => {
  const { app } = makeApp();
  await push(app, "phone", [txn()]);
  const res = await push(app, "phone", [txn()]);
  const body = (await res.json()) as PushResult;
  expect(body.deduped).toBe(1);
  expect(body.applied).toBe(0);
});

test("a stale update (older updatedAt) loses to the newer row (LWW)", async () => {
  const { app, db } = makeApp();
  await push(app, "phone", [txn({ ccid: "new", updatedAt: 2000, amountCents: -5000 })]);
  const res = await push(app, "phone", [
    txn({ ccid: "stale", updatedAt: 1000, amountCents: -9999 }),
  ]);
  const body = (await res.json()) as PushResult;
  expect(body.stale).toBe(1);
  expect(body.applied).toBe(0);
  const row = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t1"))
    .get();
  expect(row?.amountCents).toBe(-5000); // unchanged
});

test("changes excludes the caller's own rows but returns others'", async () => {
  const { app } = makeApp();
  await push(app, "phoneA", [txn()]);
  type Changes = { changes: { resourceId: string }[] };
  const own = (await (
    await app.request("/v1/sync/changes?since=0&clientId=phoneA")
  ).json()) as Changes;
  expect(own.changes.some((c) => c.resourceId === "t1")).toBe(false);
  const other = (await (
    await app.request("/v1/sync/changes?since=0&clientId=phoneB")
  ).json()) as Changes;
  expect(other.changes.some((c) => c.resourceId === "t1")).toBe(true);
});

test("auth gate: required key rejects missing/wrong, exempts health", async () => {
  const { app } = makeApp("secret");
  expect((await app.request("/v1/transactions")).status).toBe(401);
  expect(
    (await app.request("/v1/transactions", { headers: { "x-api-key": "nope" } })).status,
  ).toBe(401);
  expect(
    (await app.request("/v1/transactions", { headers: { "x-api-key": "secret" } })).status,
  ).toBe(200);
  expect((await app.request("/v1/health")).status).toBe(200); // exempt
});

test("no key configured = open (dev mode)", async () => {
  const { app } = makeApp();
  expect((await app.request("/v1/transactions")).status).toBe(200);
});

test("a corrupt change_log payload is skipped, not a 500 for the whole pull", async () => {
  const { app, db } = makeApp();
  // A well-formed row plus a hand-corrupted one, simulating a truncated write.
  await push(app, "phone", [txn({ ccid: "ok" })]);
  db.insert(schema.changeLog)
    .values({
      resource: "transactions",
      resourceId: "bad",
      op: "upsert",
      payload: "{not valid json",
      clientId: "other",
      clientChangeId: "corrupt",
      at: 2000,
    })
    .run();
  const res = await app.request("/v1/sync/changes?since=0&clientId=reader");
  expect(res.status).toBe(200); // did not 500
  type Row = { resourceId: string; payload: unknown; payloadError?: boolean };
  const body = (await res.json()) as { changes: Row[]; cursor: number };
  const bad = body.changes.find((r) => r.resourceId === "bad");
  expect(bad?.payload).toBeNull();
  expect(bad?.payloadError).toBe(true);
  // The good row still comes through and the cursor advances past both.
  expect(body.changes.some((r) => r.resourceId === "t1")).toBe(true);
  expect(body.cursor).toBeGreaterThan(0);
});
