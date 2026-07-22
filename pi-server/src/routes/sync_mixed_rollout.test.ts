import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";
import type { Db } from "../db/index.ts";
import type { ChangeEnvelope } from "../sync/crdt.ts";
import { activatePreparedEpoch, prepareGenesis } from "../sync/genesis.ts";

const epoch = "epoch-mixed-rollout";
const serverActor = "server-shadow";
let db: Db;
let app: ReturnType<typeof createApp>;

function config(mode: "disabled" | "preparing" | "active"): AppConfig {
  return {
    syncV2Mode: mode,
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
}

function preparingApp(): ReturnType<typeof createApp> {
  return createApp({ db, config: config("preparing") });
}

beforeEach(() => {
  db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  prepareGenesis(db, {
    epochId: epoch,
    genesisActorId: "genesis",
    serverActorId: serverActor,
    createdAt: 1,
  });
  app = preparingApp();
});

async function register(
  actorId = "phone-v2",
  legacyClientId?: string,
): Promise<string> {
  const response = await app.request("/v1/sync/v2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      actorId,
      appVersion: "test",
      platform: "android",
      ...(legacyClientId === undefined ? {} : { legacyClientId }),
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { actorToken: string }).actorToken;
}

function categoryGroupChange(
  name: string,
  options: {
    sequence?: number;
    context?: Record<string, number>;
    lamport?: number;
  } = {},
): ChangeEnvelope {
  const sequence = options.sequence ?? 1;
  return {
    protocol: 2,
    epoch,
    changeId: `phone-v2:${sequence}`,
    actorId: "phone-v2",
    sequence,
    context: options.context ?? {},
    lamport: options.lamport ?? 1,
    wallTimeMs: 10,
    schemaVersion: 1,
    ops:
      sequence === 1
        ? [
            {
              kind: "assign",
              resource: "category_groups",
              entityId: "g1",
              field: "$exists",
              value: true,
            },
            {
              kind: "assign",
              resource: "category_groups",
              entityId: "g1",
              field: "name",
              value: name,
            },
            {
              kind: "assign",
              resource: "category_groups",
              entityId: "g1",
              field: "isIncome",
              value: false,
            },
            {
              kind: "assign",
              resource: "category_groups",
              entityId: "g1",
              field: "sortOrder",
              value: 1,
            },
          ]
        : [
            {
              kind: "assign",
              resource: "category_groups",
              entityId: "g1",
              field: "name",
              value: name,
            },
          ],
  };
}

async function pushV2(token: string, envelope: ChangeEnvelope) {
  return app.request("/v1/sync/v2/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": token,
    },
    body: JSON.stringify({
      epoch,
      actorId: "phone-v2",
      appVersion: "test",
      platform: "android",
      changes: [envelope],
    }),
  });
}

test("verified preparing mode advertises and serves protocol v2 while v1 remains writable", async () => {
  const capabilities = await app.request("/v1/sync/capabilities");
  expect(capabilities.status).toBe(200);
  expect(await capabilities.json()).toMatchObject({
    preferredProtocol: 2,
    v1: { writes: "accepted" },
    v2: {
      mode: "preparing",
      epoch,
      epochStatus: "preparing",
      bootstrapRequired: true,
    },
  });

  const token = await register();
  const bootstrap = await app.request(
    "/v1/sync/v2/bootstrap?actorId=phone-v2",
    { headers: { "x-sync-actor-token": token } },
  );
  expect(bootstrap.status).toBe(200);
  expect(await bootstrap.json()).toMatchObject({ protocol: 2, epoch });
});

test("one accepted multi-entity v2 event emits v1 snapshots without recursively duplicating semantic history", async () => {
  const token = await register();
  const envelope = categoryGroupChange("Essentials");
  envelope.ops.push(
    {
      kind: "assign",
      resource: "category_groups",
      entityId: "g2",
      field: "$exists",
      value: true,
    },
    {
      kind: "assign",
      resource: "category_groups",
      entityId: "g2",
      field: "name",
      value: "Income",
    },
    {
      kind: "assign",
      resource: "category_groups",
      entityId: "g2",
      field: "isIncome",
      value: true,
    },
    {
      kind: "assign",
      resource: "category_groups",
      entityId: "g2",
      field: "sortOrder",
      value: 2,
    },
  );
  expect(await (await pushV2(token, envelope)).json()).toMatchObject({
    accepted: 1,
  });

  const legacyRows = db.select().from(schema.changeLog).all();
  expect(legacyRows).toHaveLength(2);
  expect(legacyRows[0]).toMatchObject({
    resource: "category_groups",
    resourceId: "g1",
    op: "upsert",
    clientId: null,
  });
  expect(JSON.parse(legacyRows[0]!.payload!)).toMatchObject({
    id: "g1",
    name: "Essentials",
    isIncome: false,
    sortOrder: 1,
  });
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);

  expect(await (await pushV2(token, envelope)).json()).toMatchObject({
    duplicates: 1,
  });
  expect(db.select().from(schema.changeLog).all()).toHaveLength(2);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);

  const legacyPull = await app.request(
    "/v1/sync/changes?since=0&clientId=old-phone",
  );
  expect(await legacyPull.json()).toMatchObject({
    changes: [
      { resource: "category_groups", resourceId: "g1" },
      { resource: "category_groups", resourceId: "g2" },
    ],
  });
});

test("a v1 write is translated once into the preparing CRDT history", async () => {
  const response = await app.request("/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: "old-phone",
      changes: [
        {
          clientChangeId: "legacy-1",
          resource: "category_groups",
          resourceId: "g1",
          op: "upsert",
          payload: {
            id: "g1",
            name: "Legacy write",
            isIncome: false,
            sortOrder: 1,
          },
        },
      ],
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ applied: 1 });
  expect(db.select().from(schema.changeLog).all()).toHaveLength(1);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
  expect(
    JSON.parse(db.select().from(schema.syncChanges).get()!.envelopeJson),
  ).toMatchObject({ actorId: serverActor, sequence: 1 });
});

test("legacy random transaction-tag ids translate to one canonical relation", async () => {
  const push = (changes: unknown[]) =>
    app.request("/v1/sync/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "old-phone", changes }),
    });
  const response = await push([
    {
      clientChangeId: "account",
      resource: "accounts",
      resourceId: "a1",
      op: "upsert",
      payload: {
        id: "a1",
        name: "A",
        kind: "checking",
        openingBalanceCents: 0,
        onBudget: true,
        archived: false,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      clientChangeId: "transaction",
      resource: "transactions",
      resourceId: "t1",
      op: "upsert",
      payload: {
        id: "t1",
        accountId: "a1",
        amountCents: -1,
        date: "2026-07-22",
        cleared: false,
        reconciled: false,
        origin: "manual",
        isGroupParent: false,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      clientChangeId: "tag",
      resource: "tags",
      resourceId: "tag1",
      op: "upsert",
      payload: {
        id: "tag1",
        name: "Home",
        color: null,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      clientChangeId: "link",
      resource: "transaction_tags",
      resourceId: "random-link-id",
      op: "upsert",
      payload: {
        id: "random-link-id",
        transactionId: "t1",
        tagId: "tag1",
        updatedAt: 1,
      },
    },
  ]);
  expect(response.status).toBe(200);
  const canonical = 'tt:["t1","tag1"]';
  expect(db.select().from(schema.transactionTags).get()).toMatchObject({
    id: canonical,
  });
  expect(db.select().from(schema.syncLegacyRelationIds).get()).toMatchObject({
    legacyId: "random-link-id",
    canonicalId: canonical,
  });

  const removed = await push([
    {
      clientChangeId: "unlink",
      resource: "transaction_tags",
      resourceId: "random-link-id",
      op: "delete",
      payload: { updatedAt: 2 },
    },
  ]);
  expect(removed.status).toBe(200);
  expect(db.select().from(schema.transactionTags).all()).toEqual([]);
  expect(
    db
      .select()
      .from(schema.syncRegisters)
      .where(eq(schema.syncRegisters.entityId, canonical))
      .all()
      .find((row) => row.field === "$member"),
  ).toMatchObject({ visibleValueJson: "false" });
});

test("legacy drain is actor-bound and a later v1 push invalidates it", async () => {
  const pull = await app.request(
    "/v1/sync/changes?since=0&clientId=legacy-device",
  );
  const pullBody = (await pull.json()) as { cursor: number };
  const token = await register("phone-v2", "legacy-device");
  const drained = await app.request("/v1/sync/v2/legacy-drain", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": token,
    },
    body: JSON.stringify({
      actorId: "phone-v2",
      epoch,
      legacyClientId: "legacy-device",
      v1Cursor: pullBody.cursor,
      pendingOutboxCount: 0,
    }),
  });
  expect(drained.status).toBe(200);
  expect(db.select().from(schema.syncLegacyClients).get()).toMatchObject({
    status: "drained",
    migratedActorId: "phone-v2",
  });

  await app.request("/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: "legacy-device",
      changes: [
        {
          clientChangeId: "late",
          resource: "category_groups",
          resourceId: "late",
          op: "upsert",
          payload: { id: "late", name: "Late", isIncome: false, sortOrder: 0 },
        },
      ],
    }),
  });
  expect(db.select().from(schema.syncLegacyClients).get()).toMatchObject({
    status: "pending",
    drainedV1Head: null,
  });
});

test("legacy server-owned rule rows remain v1-only and cannot poison the preparing epoch", async () => {
  const response = await app.request("/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: "old-phone",
      changes: [
        {
          clientChangeId: "legacy-rule-1",
          resource: "rules",
          resourceId: "r1",
          op: "upsert",
          payload: {
            id: "r1",
            name: "Legacy rule",
            enabled: true,
            stage: "main",
            priority: 100,
            triggerType: "user",
            triggerPayload: "{}",
            actionPayload: "{}",
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ applied: 1 });
  expect(db.select().from(schema.rules).all()).toHaveLength(1);
  expect(db.select().from(schema.changeLog).all()).toHaveLength(1);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});

test("a v1-bridge failure rolls back v2 admission and materialization", async () => {
  const token = await register();
  db.run(
    sql.raw(`
    CREATE TRIGGER reject_mixed_bridge
    BEFORE INSERT ON change_log
    BEGIN
      SELECT RAISE(ABORT, 'bridge unavailable');
    END
  `),
  );
  const response = await pushV2(token, categoryGroupChange("Essentials"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ accepted: 0, rejected: 1 });
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
  expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
  expect(db.select().from(schema.categoryGroups).all()).toHaveLength(0);
});

test("edits from both protocols during preparation survive activation with no history gap", async () => {
  await app.request("/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: "old-phone",
      changes: [
        {
          clientChangeId: "legacy-1",
          resource: "category_groups",
          resourceId: "g1",
          op: "upsert",
          payload: {
            id: "g1",
            name: "Before",
            isIncome: false,
            sortOrder: 1,
          },
        },
      ],
    }),
  });
  const token = await register();
  const update = categoryGroupChange("After", {
    sequence: 1,
    context: { [serverActor]: 1 },
    lamport: 2,
  });
  // sequence 1 still needs a complete create only when no lifecycle exists;
  // this entity already exists causally through the server event.
  update.ops = [
    {
      kind: "assign",
      resource: "category_groups",
      entityId: "g1",
      field: "name",
      value: "After",
    },
  ];
  expect(await (await pushV2(token, update)).json()).toMatchObject({
    accepted: 1,
  });

  const activated = activatePreparedEpoch(db, epoch);
  expect(activated).toMatchObject({ epochId: epoch });
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(2);
  expect(db.select().from(schema.categoryGroups).get()).toMatchObject({
    id: "g1",
    name: "After",
  });
  expect(
    db
      .select()
      .from(schema.syncEpochs)
      .where(eq(schema.syncEpochs.id, epoch))
      .get(),
  ).toMatchObject({ status: "active" });
});

test("config and writable-epoch status mismatches fail closed", async () => {
  activatePreparedEpoch(db, epoch);
  app = preparingApp();
  const capabilities = await app.request("/v1/sync/capabilities");
  expect(capabilities.status).toBe(503);
  expect(await capabilities.json()).toMatchObject({
    error: "sync_v2_rollout_misconfigured",
  });
  const registration = await app.request("/v1/sync/v2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actorId: "new-phone" }),
  });
  expect(registration.status).toBe(503);

  const pullV1 = await app.request(
    "/v1/sync/changes?since=0&clientId=legacy-phone",
  );
  expect(pullV1.status).toBe(426);
  const before = db.select().from(schema.changeLog).all();
  const pushV1 = await app.request("/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: "legacy-phone",
      changes: [
        {
          clientChangeId: "must-not-write",
          resource: "category_groups",
          resourceId: "g2",
          op: "upsert",
          payload: { id: "g2", name: "blocked", isIncome: false, sortOrder: 0 },
        },
      ],
    }),
  });
  expect(pushV1.status).toBe(426);
  expect(db.select().from(schema.changeLog).all()).toEqual(before);
});
