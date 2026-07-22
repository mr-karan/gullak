import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";
import type { Db } from "../db/index.ts";
import type { AssignOp, ChangeEnvelope } from "../sync/crdt.ts";

const epoch = "epoch-route-test";
let db: Db;
let app: ReturnType<typeof createApp>;
let phoneToken: string;

beforeEach(async () => {
  const sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.syncEpochs)
    .values({ id: epoch, schemaVersion: 1, status: "active" })
    .run();
  db.insert(schema.syncLocalClocks)
    .values({ epoch, actorId: "server", nextSequence: 1, lamport: 0 })
    .run();
  app = createApp({
    db,
    config: {
      syncV2Mode: "active",
      sheets: { syncIntervalMinutes: 0 },
      ai: { enabled: false },
      rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
    } as unknown as AppConfig,
  });
  phoneToken = await registerActor("phone");
});

async function registerActor(actorId: string): Promise<string> {
  const response = await app.request("/v1/sync/v2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      actorId,
      appVersion: "test",
      platform: "android",
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { actorToken: string };
  return body.actorToken;
}

function change(
  actorId: string,
  ops: AssignOp[],
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
    changeId: `${actorId}:${sequence}`,
    actorId,
    sequence,
    context:
      options.context ?? (sequence === 1 ? {} : { [actorId]: sequence - 1 }),
    lamport: options.lamport ?? sequence,
    wallTimeMs: 123,
    schemaVersion: 1,
    ops,
  };
}

const accountCreateOps: AssignOp[] = [
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "$exists",
    value: true,
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "name",
    value: "Current",
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "kind",
    value: "checking",
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "openingBalanceCents",
    value: 0,
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "onBudget",
    value: true,
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "archived",
    value: false,
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "sortOrder",
    value: 0,
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "createdAt",
    value: 1,
  },
  {
    kind: "assign",
    resource: "accounts",
    entityId: "a1",
    field: "updatedAt",
    value: 1,
  },
];

function createOps(
  resource: string,
  entityId: string,
  fields: Record<string, string | number | boolean | null>,
  lifecycle = "$exists",
): AssignOp[] {
  return [
    { kind: "assign", resource, entityId, field: lifecycle, value: true },
    ...Object.entries(fields).map(([field, value]) => ({
      kind: "assign" as const,
      resource,
      entityId,
      field,
      value,
    })),
  ];
}

function transactionCreateOps(
  id: string,
  overrides: Record<string, string | number | boolean | null> = {},
): AssignOp[] {
  return createOps("transactions", id, {
    accountId: "a1",
    amountCents: -45_000,
    date: "2026-07-21",
    cleared: false,
    reconciled: false,
    origin: "manual",
    isGroupParent: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });
}

async function push(changes: unknown[]) {
  return app.request("/v1/sync/v2/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": phoneToken,
    },
    body: JSON.stringify({
      epoch,
      actorId: "phone",
      appVersion: "test",
      platform: "android",
      changes,
    }),
  });
}

test("push atomically accepts, materializes, and reports exact duplicates", async () => {
  const envelope = change("phone", accountCreateOps);
  const first = await push([envelope]);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ accepted: 1, duplicates: 0 });
  expect(
    db.select().from(schema.accounts).where(eq(schema.accounts.id, "a1")).get(),
  ).toMatchObject({ name: "Current", openingBalanceCents: 0 });
  expect(db.select().from(schema.changeLog).all()).toHaveLength(0);

  const retry = await push([envelope]);
  expect(await retry.json()).toMatchObject({ accepted: 0, duplicates: 1 });
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
});

test("permanent poison is quarantined without blocking an unrelated change", async () => {
  const invalid = change("phone", [
    {
      kind: "assign",
      resource: "transactions",
      entityId: "t1",
      field: "amountCents",
      value: 1.5,
    },
  ]);
  const good = change("phone", accountCreateOps);
  const response = await push([invalid, good]);
  expect(await response.json()).toMatchObject({ accepted: 1, rejected: 1 });
  expect(db.select().from(schema.syncQuarantine).all()).toHaveLength(1);
  expect(db.select().from(schema.accounts).all()).toHaveLength(1);
});

test("a whole-command structural failure rolls back its event and is quarantined", async () => {
  await push([change("phone", accountCreateOps)]);
  const oneSidedTransfer = change(
    "phone",
    transactionCreateOps("transfer-out", {
      transferAccountId: "a1",
      transferGroupId: "group-1",
    }),
    { sequence: 2 },
  );

  const response = await push([oneSidedTransfer]);
  expect(await response.json()).toMatchObject({ rejected: 1, accepted: 0 });
  expect(db.select().from(schema.transactions).all()).toHaveLength(0);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
  expect(db.select().from(schema.syncQuarantine).get()).toMatchObject({
    reasonCode: "projection_invalid",
  });
});

test("a SQLite uniqueness violation is a permanent structured rejection", async () => {
  const tagFields = {
    name: "Home",
    color: null,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
  await push([change("phone", createOps("tags", "tag-1", tagFields))]);
  const response = await push([
    change("phone", createOps("tags", "tag-2", tagFields), { sequence: 2 }),
  ]);
  const body = (await response.json()) as {
    results: Array<{ result: { code?: string } }>;
  };
  expect(body.results[0]?.result.code).toBe("constraint_violation");
  expect(db.select().from(schema.tags).all()).toHaveLength(1);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
  expect(db.select().from(schema.syncQuarantine).get()).toMatchObject({
    reasonCode: "constraint_violation",
  });
});

test("a client cannot alter an already reconciled transaction", async () => {
  await push([change("phone", accountCreateOps)]);
  await push([
    change(
      "phone",
      transactionCreateOps("locked", { cleared: true, reconciled: true }),
      { sequence: 2 },
    ),
  ]);
  const response = await push([
    change(
      "phone",
      [
        {
          kind: "assign",
          resource: "transactions",
          entityId: "locked",
          field: "notes",
          value: "rewrite",
        },
      ],
      { sequence: 3 },
    ),
  ]);
  expect(await response.json()).toMatchObject({ rejected: 1 });
  expect(
    db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, "locked"))
      .get(),
  ).toMatchObject({ notes: null, reconciled: true });
});

test("canonical payee projection defeats a stale cache in an unrelated edit", async () => {
  const initial = change("phone", [
    ...accountCreateOps,
    ...createOps("payees", "p1", {
      name: "Payu Retail",
      learnCategories: true,
      updatedAt: 1,
    }),
    ...transactionCreateOps("dyson", {
      payeeId: "p1",
      payeeName: "Payu Retail",
    }),
  ]);
  expect(await (await push([initial])).json()).toMatchObject({ accepted: 1 });

  const renameAndUnrelatedEdit = change(
    "phone",
    [
      {
        kind: "assign",
        resource: "payees",
        entityId: "p1",
        field: "name",
        value: "Dyson V15",
      },
      {
        kind: "assign",
        resource: "transactions",
        entityId: "dyson",
        field: "notes",
        value: "probe",
      },
      {
        kind: "assign",
        resource: "transactions",
        entityId: "dyson",
        field: "payeeName",
        value: "Payu Retail",
      },
    ],
    { sequence: 2 },
  );
  expect(await (await push([renameAndUnrelatedEdit])).json()).toMatchObject({
    accepted: 1,
  });
  expect(
    db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, "dyson"))
      .get(),
  ).toMatchObject({ payeeName: "Dyson V15", notes: "probe" });
  expect(db.select().from(schema.payees).get()).toMatchObject({
    name: "Dyson V15",
    useCount: 1,
  });
});

test("unlinking a canonical payee requires an explicit detached label", async () => {
  const initial = change("phone", [
    ...accountCreateOps,
    ...createOps("payees", "p1", {
      name: "Dyson V15",
      learnCategories: true,
      updatedAt: 1,
    }),
    ...transactionCreateOps("dyson", {
      payeeId: "p1",
      payeeName: "old hidden cache",
    }),
  ]);
  await push([initial]);
  const response = await push([
    change(
      "phone",
      [
        {
          kind: "assign",
          resource: "transactions",
          entityId: "dyson",
          field: "payeeId",
          value: null,
        },
      ],
      { sequence: 2 },
    ),
  ]);
  expect(await response.json()).toMatchObject({ rejected: 1 });
  expect(db.select().from(schema.transactions).get()).toMatchObject({
    payeeId: "p1",
    payeeName: "Dyson V15",
  });
});

test("a missing dependency is retryable and never quarantined", async () => {
  const envelope = change(
    "phone",
    [
      {
        kind: "assign",
        resource: "accounts",
        entityId: "a1",
        field: "name",
        value: "x",
      },
    ],
    { context: { web: 9 }, lamport: 10 },
  );
  const response = await push([envelope]);
  expect(await response.json()).toMatchObject({ retryable: 1, rejected: 0 });
  expect(db.select().from(schema.syncQuarantine).all()).toHaveLength(0);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});

test("exclusive pull cursor is monotonic and echoes originated events", async () => {
  await push([change("phone", accountCreateOps)]);
  const first = await app.request(
    `/v1/sync/v2/changes?epoch=${epoch}&after=0&limit=1&actorId=phone`,
    { headers: { "x-sync-actor-token": phoneToken } },
  );
  const body = (await first.json()) as {
    cursor: number;
    hasMore: boolean;
    changes: Array<{ envelope: { changeId: string } }>;
  };
  expect(body.cursor).toBe(1);
  expect(body.changes[0]?.envelope.changeId).toBe("phone:1");
  const head = await app.request(
    `/v1/sync/v2/changes?epoch=${epoch}&after=${body.cursor}&limit=1&actorId=phone`,
    { headers: { "x-sync-actor-token": phoneToken } },
  );
  expect(await head.json()).toMatchObject({
    cursor: 1,
    changes: [],
    hasMore: false,
  });
});

test("bootstrap returns only a verified complete checkpoint", async () => {
  db.insert(schema.syncCheckpoints)
    .values({
      id: "cp1",
      epoch,
      schemaVersion: 1,
      frontierJson: "{}",
      registersJson: "[]",
      projectionHash: "p",
      contentHash: "c",
      creationCursor: 0,
      eventCount: 0,
      isGenesis: true,
      verifiedAt: 123,
    })
    .run();
  const response = await app.request("/v1/sync/v2/bootstrap?actorId=phone", {
    headers: { "x-sync-actor-token": phoneToken },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    protocol: 2,
    epoch,
    checkpoint: {
      id: "cp1",
      epoch,
      registers: [],
      cursor: 0,
      isGenesis: true,
    },
    changesThroughCheckpoint: [],
  });
});

test("bootstrap includes the ordered immutable event prefix through its checkpoint", async () => {
  const envelope = change("phone", accountCreateOps);
  await push([envelope]);
  const accepted = db.select().from(schema.syncChanges).get();
  expect(accepted).toBeDefined();
  db.insert(schema.syncCheckpoints)
    .values({
      id: "cp-with-prefix",
      epoch,
      schemaVersion: 1,
      frontierJson: JSON.stringify({ phone: 1 }),
      registersJson: "[]",
      projectionHash: "p",
      contentHash: "c",
      creationCursor: accepted!.transportCursor,
      eventCount: 1,
      isGenesis: true,
      verifiedAt: 123,
    })
    .run();

  const response = await app.request("/v1/sync/v2/bootstrap?actorId=phone", {
    headers: { "x-sync-actor-token": phoneToken },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    checkpoint: {
      id: "cp-with-prefix",
      epoch,
      cursor: accepted!.transportCursor,
      eventCount: 1,
      isGenesis: true,
    },
    changesThroughCheckpoint: [
      {
        cursor: accepted!.transportCursor,
        contentHash: accepted!.contentHash,
        envelope,
      },
    ],
  });
});

test("pull and bootstrap reads are bound to the actor credential", async () => {
  const pull = await app.request(
    `/v1/sync/v2/changes?epoch=${epoch}&after=0&actorId=phone`,
  );
  expect(pull.status).toBe(401);
  expect(await pull.json()).toEqual({ error: "actor_token_required" });

  const bootstrap = await app.request("/v1/sync/v2/bootstrap?actorId=phone", {
    headers: { "x-sync-actor-token": "not-the-token" },
  });
  expect(bootstrap.status).toBe(401);
  expect(await bootstrap.json()).toEqual({ error: "actor_auth_failed" });
});

test("pull requires a verified bootstrap when its cursor is ahead of the server", async () => {
  const response = await app.request(
    `/v1/sync/v2/changes?epoch=${epoch}&after=1&actorId=phone`,
    { headers: { "x-sync-actor-token": phoneToken } },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "reset_required",
    reason: "cursor_ahead_of_server",
    activeEpoch: epoch,
    head: 0,
    received: 1,
  });
});

test("ack cannot move a client beyond the server head", async () => {
  const response = await app.request("/v1/sync/v2/ack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": phoneToken,
    },
    body: JSON.stringify({ actorId: "phone", epoch, cursor: 1, frontier: {} }),
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "cursor_ahead_of_server",
    head: 0,
  });
});

test("registration returns a high-entropy credential once and stores only its hash", async () => {
  expect(phoneToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  const stored = db
    .select()
    .from(schema.syncClients)
    .where(eq(schema.syncClients.actorId, "phone"))
    .get();
  expect(stored?.actorTokenHash).toMatch(/^[0-9a-f]{64}$/u);
  expect(stored?.actorTokenHash).not.toContain(phoneToken);

  const retry = await app.request("/v1/sync/v2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actorId: "phone" }),
  });
  expect(retry.status).toBe(409);
  expect(await retry.json()).toEqual({ error: "actor_already_registered" });
});

test("registration cannot claim a server or historical actor identity", async () => {
  for (const actorId of ["server", "genesis-reserved"]) {
    if (actorId === "genesis-reserved") {
      db.insert(schema.syncFrontiers)
        .values({ epoch, actorId, contiguousSequence: 1, integratedCursor: 0 })
        .run();
    }
    const response = await app.request("/v1/sync/v2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "actor_id_reserved" });
  }
});

test("push is bound to the registered actor credential", async () => {
  const missing = await app.request("/v1/sync/v2/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      epoch,
      actorId: "phone",
      changes: [change("phone", accountCreateOps)],
    }),
  });
  expect(missing.status).toBe(401);
  expect(await missing.json()).toEqual({ error: "actor_token_required" });

  const otherToken = await registerActor("other");
  const forged = await app.request("/v1/sync/v2/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": otherToken,
    },
    body: JSON.stringify({
      epoch,
      actorId: "phone",
      changes: [change("phone", accountCreateOps)],
    }),
  });
  expect(forged.status).toBe(401);
  expect(await forged.json()).toEqual({ error: "actor_auth_failed" });
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});

test("a retired actor is permanently denied and cannot re-register", async () => {
  db.update(schema.syncClients)
    .set({ status: "retired", retiredAt: Date.now() })
    .where(eq(schema.syncClients.actorId, "phone"))
    .run();

  const retiredPush = await push([change("phone", accountCreateOps)]);
  expect(retiredPush.status).toBe(410);
  expect(await retiredPush.json()).toEqual({ error: "actor_retired" });

  const registration = await app.request("/v1/sync/v2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actorId: "phone" }),
  });
  expect(registration.status).toBe(410);
  expect(await registration.json()).toEqual({ error: "actor_retired" });
  expect(
    db
      .select()
      .from(schema.syncClients)
      .where(eq(schema.syncClients.actorId, "phone"))
      .get(),
  ).toMatchObject({ status: "retired" });
});

test("ack requires the exact integrated frontier at its cursor", async () => {
  await push([change("phone", accountCreateOps)]);

  const forged = await app.request("/v1/sync/v2/ack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": await registerActor("other-ack-actor"),
    },
    body: JSON.stringify({
      actorId: "phone",
      epoch,
      cursor: 1,
      frontier: { phone: 1 },
    }),
  });
  expect(forged.status).toBe(401);
  expect(await forged.json()).toEqual({ error: "actor_auth_failed" });

  const falseAck = await app.request("/v1/sync/v2/ack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": phoneToken,
    },
    body: JSON.stringify({ actorId: "phone", epoch, cursor: 1, frontier: {} }),
  });
  expect(falseAck.status).toBe(400);
  expect(await falseAck.json()).toMatchObject({
    error: "frontier_mismatch",
    expected: { phone: 1 },
    received: {},
  });

  const ack = await app.request("/v1/sync/v2/ack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": phoneToken,
    },
    body: JSON.stringify({
      actorId: "phone",
      epoch,
      cursor: 1,
      frontier: { phone: 1 },
    }),
  });
  expect(ack.status).toBe(200);
  expect(await ack.json()).toMatchObject({
    acknowledged: 1,
    frontier: { phone: 1 },
  });
});

test("ack validates a named checkpoint and never moves backwards", async () => {
  await push([change("phone", accountCreateOps)]);
  db.insert(schema.syncCheckpoints)
    .values({
      id: "cp-at-one",
      epoch,
      schemaVersion: 1,
      frontierJson: JSON.stringify({ phone: 1 }),
      registersJson: "[]",
      projectionHash: "p",
      contentHash: "c",
      creationCursor: 1,
      eventCount: 1,
      verifiedAt: 123,
    })
    .run();

  const ack = await app.request("/v1/sync/v2/ack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": phoneToken,
    },
    body: JSON.stringify({
      actorId: "phone",
      epoch,
      cursor: 1,
      frontier: { phone: 1 },
      checkpointId: "cp-at-one",
    }),
  });
  expect(ack.status).toBe(200);
  expect(
    db
      .select()
      .from(schema.syncClients)
      .where(eq(schema.syncClients.actorId, "phone"))
      .get(),
  ).toMatchObject({
    acknowledgedCursor: 1,
    bootstrapCheckpointId: "cp-at-one",
  });

  const regression = await app.request("/v1/sync/v2/ack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-actor-token": phoneToken,
    },
    body: JSON.stringify({ actorId: "phone", epoch, cursor: 0, frontier: {} }),
  });
  expect(regression.status).toBe(409);
  expect(await regression.json()).toMatchObject({
    error: "cursor_regression",
    acknowledged: 1,
  });
});

test("SQLite aborts at every admission/materialization boundary roll back exactly", async () => {
  const setup = async () => {
    const sqlite = new Database(":memory:");
    const isolatedDb = drizzle(sqlite, { schema });
    migrate(isolatedDb, { migrationsFolder: "./drizzle" });
    isolatedDb
      .insert(schema.syncEpochs)
      .values({ id: epoch, schemaVersion: 1, status: "active" })
      .run();
    isolatedDb
      .insert(schema.syncLocalClocks)
      .values({ epoch, actorId: "server", nextSequence: 1, lamport: 0 })
      .run();
    const isolatedApp = createApp({
      db: isolatedDb,
      config: {
        syncV2Mode: "active",
        sheets: { syncIntervalMinutes: 0 },
        ai: { enabled: false },
        rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
      } as unknown as AppConfig,
    });
    const registration = await isolatedApp.request("/v1/sync/v2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId: "fault-phone" }),
    });
    const token = ((await registration.json()) as { actorToken: string })
      .actorToken;
    const faultPush = (envelope: ChangeEnvelope) =>
      isolatedApp.request("/v1/sync/v2/push", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sync-actor-token": token,
        },
        body: JSON.stringify({ epoch, actorId: "fault-phone", changes: [envelope] }),
      });
    return { sqlite, isolatedDb, faultPush };
  };

  for (const table of [
    "sync_changes",
    "sync_registers",
    "accounts",
    "sync_frontiers",
  ]) {
    const isolated = await setup();
    isolated.sqlite.exec(`
      CREATE TRIGGER fault_insert_${table}
      BEFORE INSERT ON ${table}
      BEGIN SELECT RAISE(ABORT, 'fault at ${table} insert'); END
    `);
    const response = await isolated.faultPush(
      change("fault-phone", accountCreateOps),
    );
    expect(await response.json(), table).toMatchObject({ rejected: 1 });
    expect(isolated.isolatedDb.select().from(schema.syncChanges).all(), table)
      .toHaveLength(0);
    expect(isolated.isolatedDb.select().from(schema.syncRegisters).all(), table)
      .toHaveLength(0);
    expect(isolated.isolatedDb.select().from(schema.accounts).all(), table)
      .toHaveLength(0);
    expect(isolated.isolatedDb.select().from(schema.syncFrontiers).all(), table)
      .toHaveLength(0);
    isolated.sqlite.close();
  }

  for (const table of ["sync_registers", "accounts", "sync_frontiers"]) {
    const isolated = await setup();
    expect(
      await (
        await isolated.faultPush(change("fault-phone", accountCreateOps))
      ).json(),
    ).toMatchObject({ accepted: 1 });
    isolated.sqlite.exec(`
      CREATE TRIGGER fault_update_${table}
      BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'fault at ${table} update'); END
    `);
    const response = await isolated.faultPush(
      change(
        "fault-phone",
        [
          {
            kind: "assign",
            resource: "accounts",
            entityId: "a1",
            field: "name",
            value: "must roll back",
          },
        ],
        { sequence: 2 },
      ),
    );
    expect(await response.json(), table).toMatchObject({ rejected: 1 });
    expect(isolated.isolatedDb.select().from(schema.syncChanges).all(), table)
      .toHaveLength(1);
    expect(isolated.isolatedDb.select().from(schema.accounts).get()?.name, table)
      .toBe("Current");
    expect(isolated.isolatedDb.select().from(schema.syncFrontiers).get(), table)
      .toMatchObject({ contiguousSequence: 1 });
    isolated.sqlite.close();
  }
});
