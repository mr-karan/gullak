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
    syncV2Mode: "disabled",
    httpApiKey: apiKey,
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

function push(
  app: ReturnType<typeof makeApp>["app"],
  clientId: string,
  changes: unknown[],
) {
  return app.request("/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, changes }),
  });
}

const txn = (
  o: { ccid?: string; updatedAt?: number; amountCents?: number } = {},
) => ({
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

test("capabilities default to v1 while advertising dormant v2 support", async () => {
  const { app } = makeApp();
  const res = await app.request("/v1/sync/capabilities");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    preferredProtocol: 1,
    supportedProtocols: [1, 2],
    v1: { writes: "accepted" },
    v2: { mode: "disabled", epoch: null, bootstrapRequired: false },
  });
});

test("active mode explicitly rejects ambiguous v1 snapshot pushes", async () => {
  // Tests construct a narrow AppConfig fixture; mutate the captured object by
  // creating an active-mode app through the helper's config default override.
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const config = {
    syncV2Mode: "active",
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  const activeApp = createApp({ db, config });
  const res = await push(activeApp, "phone", [txn()]);
  expect(res.status).toBe(426);
  expect(await res.json()).toMatchObject({
    error: "upgrade_required",
    requiredProtocol: 2,
  });
  const pull = await activeApp.request("/v1/sync/changes?since=0");
  expect(pull.status).toBe(426);
  expect(await pull.json()).toMatchObject({
    error: "upgrade_required",
    requiredProtocol: 2,
  });
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
  await push(app, "phone", [
    txn({ ccid: "new", updatedAt: 2000, amountCents: -5000 }),
  ]);
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

test("pull pagination reports the unfiltered scan window", async () => {
  const { app, db } = makeApp();
  db.insert(schema.changeLog)
    .values([
      {
        clientId: "phoneA",
        clientChangeId: "self-1",
        resource: "accounts",
        resourceId: "a1",
        op: "upsert",
        payload: "{}",
      },
      {
        clientId: "phoneA",
        clientChangeId: "self-2",
        resource: "accounts",
        resourceId: "a2",
        op: "upsert",
        payload: "{}",
      },
    ])
    .run();

  const response = await app.request(
    "/v1/sync/changes?since=0&limit=2&clientId=phoneA",
  );
  expect(await response.json()).toMatchObject({
    changes: [],
    cursor: 2,
    hasMore: true,
  });
});

test("auth gate: required key rejects missing/wrong, exempts health", async () => {
  const { app } = makeApp("secret");
  expect((await app.request("/v1/transactions")).status).toBe(401);
  expect(
    (
      await app.request("/v1/transactions", {
        headers: { "x-api-key": "nope" },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await app.request("/v1/transactions", {
        headers: { "x-api-key": "secret" },
      })
    ).status,
  ).toBe(200);
  expect((await app.request("/v1/health")).status).toBe(200); // exempt
});

test("no key configured = open (dev mode)", async () => {
  const { app } = makeApp();
  expect((await app.request("/v1/transactions")).status).toBe(200);
});

test("gte cursor: a row at the boundary is returned, and new rows after cursor arrive too", async () => {
  const { app } = makeApp();
  // Push two changes — one from phoneA (self-originated), one from phoneB.
  await push(app, "phoneA", [txn({ ccid: "first" })]);
  await push(app, "phoneB", [
    {
      clientChangeId: "second",
      resource: "transactions",
      resourceId: "t2",
      op: "upsert",
      payload: {
        id: "t2",
        accountId: "a1",
        amountCents: -3000,
        date: "2026-06-30",
        updatedAt: 2000,
      },
    },
  ]);
  // First pull: phoneA sees t2 (from phoneB, not self), cursor points at last scanned row.
  type ChangesBody = { changes: { resourceId: string }[]; cursor: number };
  const firstPull = (await (
    await app.request("/v1/sync/changes?since=0&clientId=phoneA")
  ).json()) as ChangesBody;
  expect(firstPull.changes.some((c) => c.resourceId === "t2")).toBe(true);
  const cursor = firstPull.cursor;
  expect(cursor).toBeGreaterThan(0);
  // Second pull with that exact cursor: with gte, the last row is re-fetched
  // (idempotent on the phone side). No new data expected.
  const secondPull = (await (
    await app.request(`/v1/sync/changes?since=${cursor}&clientId=phoneA`)
  ).json()) as ChangesBody;
  // gte means the last row is visible again — this is intentional.
  expect(secondPull.changes.some((c) => c.resourceId === "t2")).toBe(true);
  // Now push a NEW change — this must appear even though cursor hasn't changed.
  await push(app, "phoneB", [
    {
      clientChangeId: "third",
      resource: "transactions",
      resourceId: "t3",
      op: "upsert",
      payload: {
        id: "t3",
        accountId: "a1",
        amountCents: -1000,
        date: "2026-06-30",
        updatedAt: 3000,
      },
    },
  ]);
  const thirdPull = (await (
    await app.request(`/v1/sync/changes?since=${cursor}&clientId=phoneA`)
  ).json()) as ChangesBody;
  expect(thirdPull.changes.some((c) => c.resourceId === "t3")).toBe(true);
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
  type Row = { resourceId: string; payload: unknown };
  const body = (await res.json()) as { changes: Row[]; cursor: number };
  expect(body.changes.some((r) => r.resourceId === "bad")).toBe(false);
  // The good row still comes through and the cursor advances past both.
  expect(body.changes.some((r) => r.resourceId === "t1")).toBe(true);
  expect(body.cursor).toBeGreaterThan(0);
});

test("legacy rule payloads are omitted while the scan cursor advances", async () => {
  const { app, db } = makeApp();
  db.insert(schema.changeLog)
    .values({
      resource: "rules",
      resourceId: "legacy-rule",
      op: "upsert",
      payload: JSON.stringify({ legacyShape: true }),
      clientId: null,
      clientChangeId: null,
      at: 1000,
    })
    .run();
  const head = db.select().from(schema.changeLog).get()!.id;

  const response = await app.request(
    "/v1/sync/changes?since=0&clientId=reader",
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    changes: { resource: string }[];
    cursor: number;
  };
  expect(body.changes).toEqual([]);
  expect(body.cursor).toBe(head);
});
