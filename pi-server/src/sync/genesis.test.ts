import Database from "better-sqlite3";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { ChangeEnvelope, RegisterState } from "./crdt.ts";
import { candidateFor, canonicalRegisterJson, mergeCandidate } from "./crdt.ts";
import {
  activatePreparedEpoch,
  prepareGenesis,
  syncedProjectionDigest,
} from "./genesis.ts";
import { SYNCED_RESOURCES, transactionTagEntityId } from "./resources.ts";
import { applySyncChange } from "./store.ts";

const createdAt = 1_800_000_000_000;
const epochId = "epoch-genesis-test";
const genesisActorId = "genesis-actor-test";
const serverActorId = "server-actor-test";

const openDatabases: Database.Database[] = [];

afterEach(() => {
  for (const sqlite of openDatabases.splice(0)) sqlite.close();
});

function makeDb() {
  const sqlite = new Database(":memory:");
  openDatabases.push(sqlite);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { db, sqlite };
}

function seedCompleteProjection(db: ReturnType<typeof makeDb>["db"]): void {
  db.insert(schema.accounts)
    .values({
      id: "account-1",
      name: "Checking",
      kind: "checking",
      openingBalanceCents: 50_000,
      reconciledBalanceCents: 49_000,
      reconciledAt: createdAt - 10,
      onBudget: true,
      archived: false,
      sortOrder: 1,
      createdAt: createdAt - 100,
      updatedAt: createdAt - 10,
    })
    .run();
  db.insert(schema.categoryGroups)
    .values({
      id: "group-1",
      name: "Everyday",
      isIncome: false,
      sortOrder: 1,
    })
    .run();
  db.insert(schema.categories)
    .values({
      id: "category-1",
      name: "Shopping",
      groupId: "group-1",
      parentId: null,
      color: 0xff112233,
      icon: "bag",
      hidden: false,
      sortOrder: 1,
      updatedAt: createdAt - 9,
    })
    .run();
  db.insert(schema.payees)
    .values({
      id: "payee-1",
      name: "Dyson",
      useCount: 99,
      learnCategories: true,
      updatedAt: createdAt - 8,
    })
    .run();
  db.insert(schema.transactions)
    .values({
      id: "transaction-1",
      accountId: "account-1",
      categoryId: "category-1",
      payeeId: "payee-1",
      payeeName: "Dyson",
      amountCents: -45_000,
      date: "2026-07-21",
      notes: "vacuum",
      latitude: 12.9716,
      longitude: 77.5946,
      locationName: "Bengaluru",
      cleared: true,
      reconciled: false,
      origin: "manual",
      originRef: null,
      importedId: null,
      transferAccountId: null,
      transferGroupId: null,
      parentId: null,
      splitTotalCents: null,
      groupParentId: null,
      isGroupParent: false,
      originalAmountCents: null,
      originalCurrency: null,
      createdAt: createdAt - 7,
      updatedAt: createdAt - 6,
    })
    .run();
  db.insert(schema.tags)
    .values({
      id: "tag-1",
      name: "Home",
      color: 0xff445566,
      archived: false,
      createdAt: createdAt - 5,
      updatedAt: createdAt - 4,
    })
    .run();
  db.insert(schema.transactionTags)
    .values({
      id: "transaction-tag-1",
      transactionId: "transaction-1",
      tagId: "tag-1",
      updatedAt: createdAt - 3,
    })
    .run();
  db.insert(schema.budgets)
    .values({
      id: "budget-1",
      categoryId: "category-1",
      month: "2026-07",
      targetCents: 100_000,
      rolloverCents: 5_000,
      updatedAt: createdAt - 2,
    })
    .run();
  db.insert(schema.recurrences)
    .values({
      id: "recurrence-1",
      accountId: "account-1",
      categoryId: "category-1",
      payeeId: "payee-1",
      payeeName: "Dyson",
      amountCents: -5_000,
      notes: "filter replacement",
      cadence: "yearly",
      nextDate: "2027-07-21",
      anchorDay: 21,
      createdAt: createdAt - 2,
      updatedAt: createdAt - 1,
    })
    .run();

  // Server-only data is deliberately present as a negative control.
  db.insert(schema.rules)
    .values({
      id: "rule-legacy",
      name: "Legacy rule",
      triggerType: "user",
      triggerPayload: '{"legacy":true}',
      actionPayload: '{"category":"category-1"}',
      createdAt,
      updatedAt: createdAt,
    })
    .run();
  db.insert(schema.ruleMatches)
    .values({
      id: "rule-match-legacy",
      ruleId: "rule-legacy",
      sourceType: "transaction",
      sourceId: "transaction-1",
      transactionId: "transaction-1",
      matchedAt: createdAt,
      outcome: "matched",
      updatedAt: createdAt,
    })
    .run();
}

function prepare(db: ReturnType<typeof makeDb>["db"], id = epochId) {
  return prepareGenesis(db, {
    epochId: id,
    genesisActorId: `${genesisActorId}-${id}`,
    serverActorId: `${serverActorId}-${id}`,
    createdAt,
  });
}

describe("genesis preparation", () => {
  test("projection digest matches the Dart cross-runtime fixture", () => {
    const { db } = makeDb();
    db.insert(schema.accounts)
      .values({
        id: "a1",
        name: "Server truth",
        kind: "checking",
        openingBalanceCents: 0,
        reconciledBalanceCents: null,
        reconciledAt: null,
        onBudget: true,
        archived: false,
        sortOrder: 0,
        createdAt: 10,
        updatedAt: 10,
      })
      .run();

    expect(syncedProjectionDigest(db).hash).toBe(
      "93131f3de39c38a539e86559c04131c17ae99721e0d5ef73737c67fa5eba7194",
    );
  });

  test("captures every synced resource in one canonical event and excludes server-only or derived data", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    expect(
      syncedProjectionDigest(db, { allowLegacyTransactionTagIds: true }).hash,
    ).toBe("6de868ebb99baba2dcfefa188545b2d4fc1690753d7205dc08693529091f83f5");

    const result = prepare(db);
    const changeRows = db.select().from(schema.syncChanges).all();
    const checkpoint = db.select().from(schema.syncCheckpoints).get();
    const envelope = result.envelope;
    expect(envelope).not.toBeNull();
    if (envelope === null)
      throw new Error("expected non-empty genesis envelope");

    expect(changeRows).toHaveLength(1);
    expect(envelope).toEqual(JSON.parse(changeRows[0]?.envelopeJson ?? "null"));
    expect([...new Set(envelope.ops.map((op) => op.resource))].sort()).toEqual(
      [...SYNCED_RESOURCES].sort(),
    );
    expect(envelope.ops).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: "rules" }),
        expect.objectContaining({ resource: "rule_matches" }),
        expect.objectContaining({ resource: "payees", field: "useCount" }),
        expect.objectContaining({
          resource: "transactions",
          field: "splitTotalCents",
        }),
      ]),
    );
    expect(envelope.ops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resource: "transaction_tags",
          entityId: transactionTagEntityId("transaction-1", "tag-1"),
          field: "$member",
          value: true,
        }),
        expect.objectContaining({
          resource: "transactions",
          entityId: "transaction-1",
          field: "$exists",
          value: true,
        }),
      ]),
    );
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(
      envelope.ops.length,
    );
    expect(checkpoint).toMatchObject({
      id: result.checkpointId,
      epoch: epochId,
      creationCursor: result.creationCursor,
      eventCount: 1,
      isGenesis: true,
      verifiedAt: createdAt,
      projectionHash: result.projectionHash,
      contentHash: result.checkpointContentHash,
    });
    expect(JSON.parse(checkpoint?.registersJson ?? "[]")).toHaveLength(
      envelope.ops.length,
    );
    expect(JSON.parse(checkpoint?.frontierJson ?? "null")).toEqual({
      [`${genesisActorId}-${epochId}`]: 1,
    });
  });

  test("is deterministic for identical projection and inputs", () => {
    const first = makeDb();
    const second = makeDb();
    seedCompleteProjection(first.db);
    seedCompleteProjection(second.db);

    const left = prepare(first.db);
    const right = prepare(second.db);

    expect(left.envelope).toEqual(right.envelope);
    expect(left.projectionHash).toBe(right.projectionHash);
    expect(left.checkpointContentHash).toBe(right.checkpointContentHash);
    expect(
      first.db.select().from(schema.syncCheckpoints).get()?.registersJson,
    ).toBe(
      second.db.select().from(schema.syncCheckpoints).get()?.registersJson,
    );
  });

  test("leaves the verified epoch preparing", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    prepare(db);

    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      id: epochId,
      status: "preparing",
      activatedAt: null,
    });
  });

  test("creates and activates a verified empty checkpoint without fabricating an event", () => {
    const { db } = makeDb();

    const prepared = prepare(db);
    const checkpoint = db.select().from(schema.syncCheckpoints).get();

    expect(prepared).toMatchObject({
      envelope: null,
      creationCursor: 0,
      eventCount: 0,
    });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
    expect(checkpoint).toMatchObject({
      creationCursor: 0,
      eventCount: 0,
      frontierJson: "{}",
      registersJson: "[]",
      verifiedAt: createdAt,
    });

    expect(activatePreparedEpoch(db, epochId)).toMatchObject({ epochId });
    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      status: "active",
    });
  });

  test("rolls back the entire preparation for a corrupt projection", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    db.run(
      sql`update transactions set amount_cents = 'not-an-integer' where id = 'transaction-1'`,
    );

    expect(() => prepare(db)).toThrow(/transactions\.amountCents/);
    expect(db.select().from(schema.syncEpochs).all()).toHaveLength(0);
    expect(db.select().from(schema.syncLocalClocks).all()).toHaveLength(0);
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
    expect(db.select().from(schema.syncCheckpoints).all()).toHaveLength(0);
  });

  test("checkpoint candidates plus a causal tail fold to the live register", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    const genesis = prepare(db);
    const genesisEnvelope = genesis.envelope;
    if (genesisEnvelope === null) {
      throw new Error("expected non-empty genesis envelope");
    }
    const checkpoint = db.select().from(schema.syncCheckpoints).get();
    const checkpointRegisters = JSON.parse(
      checkpoint?.registersJson ?? "[]",
    ) as Array<{
      resource: string;
      entityId: string;
      field: string;
      candidates: RegisterState;
    }>;
    const genesisPayeeName = checkpointRegisters.find(
      (row) =>
        row.resource === "payees" &&
        row.entityId === "payee-1" &&
        row.field === "name",
    );
    expect(genesisPayeeName).toBeDefined();

    const tail: ChangeEnvelope = {
      protocol: 2,
      epoch: epochId,
      changeId: "web-tail:1",
      actorId: "web-tail",
      sequence: 1,
      context: { [genesisEnvelope.actorId]: 1 },
      lamport: 2,
      wallTimeMs: createdAt + 1,
      schemaVersion: 1,
      ops: [
        {
          kind: "assign",
          resource: "payees",
          entityId: "payee-1",
          field: "name",
          value: "Dyson V15",
        },
      ],
    };
    expect(
      applySyncChange(db, tail, {
        source: "test-tail",
        acceptedAt: createdAt + 1,
      }).status,
    ).toBe("accepted");

    const expected = mergeCandidate(
      genesisPayeeName?.candidates ?? { candidates: [] },
      candidateFor(tail, tail.ops[0]),
    );
    const live = db
      .select()
      .from(schema.syncRegisters)
      .where(
        and(
          eq(schema.syncRegisters.epoch, epochId),
          eq(schema.syncRegisters.resource, "payees"),
          eq(schema.syncRegisters.entityId, "payee-1"),
          eq(schema.syncRegisters.field, "name"),
        ),
      )
      .get();
    expect(live?.candidatesJson).toBe(canonicalRegisterJson(expected));
  });
});

describe("prepared epoch activation", () => {
  test("rejects relational projection drift without changing epoch status", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    prepare(db);
    db.update(schema.payees)
      .set({ name: "Projection drift" })
      .where(eq(schema.payees.id, "payee-1"))
      .run();

    expect(() => activatePreparedEpoch(db, epochId)).toThrow(
      /projection drifted/,
    );
    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      status: "preparing",
      activatedAt: null,
    });
  });

  test("activates a verified drift-free epoch", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    const prepared = prepare(db);

    const activated = activatePreparedEpoch(db, epochId);

    expect(activated).toMatchObject({
      epochId,
      checkpointId: prepared.checkpointId,
      projectionHash: prepared.projectionHash,
    });
    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      status: "active",
      activatedAt: activated.activatedAt,
    });
  });

  test("accepts a hidden concurrent candidate when it is justified by the immutable tail", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    const prepared = prepare(db);
    if (prepared.envelope === null)
      throw new Error("expected genesis envelope");
    const tail: ChangeEnvelope = {
      protocol: 2,
      epoch: epochId,
      changeId: "concurrent-tail:1",
      actorId: "concurrent-tail",
      sequence: 1,
      context: {},
      lamport: 1,
      wallTimeMs: createdAt + 1,
      schemaVersion: 1,
      ops: [
        {
          kind: "assign",
          resource: "payees",
          entityId: "payee-1",
          field: "name",
          value: "Dyson",
        },
      ],
    };
    expect(
      applySyncChange(db, tail, {
        source: "test-tail",
        acceptedAt: createdAt + 1,
      }).status,
    ).toBe("accepted");

    expect(activatePreparedEpoch(db, epochId)).toMatchObject({ epochId });
    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      status: "active",
    });
  });

  test("rejects a hidden register candidate even when the visible projection is unchanged", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    prepare(db);
    const row = db
      .select()
      .from(schema.syncRegisters)
      .where(
        and(
          eq(schema.syncRegisters.epoch, epochId),
          eq(schema.syncRegisters.resource, "payees"),
          eq(schema.syncRegisters.entityId, "payee-1"),
          eq(schema.syncRegisters.field, "name"),
        ),
      )
      .get();
    if (row === undefined) throw new Error("missing payee register");
    const tampered = mergeCandidate(JSON.parse(row.candidatesJson), {
      dot: { actorId: "aaa-hidden", sequence: 1 },
      context: {},
      lamport: 1,
      value: "Hidden alternative",
    });
    db.update(schema.syncRegisters)
      .set({ candidatesJson: canonicalRegisterJson(tampered) })
      .where(
        and(
          eq(schema.syncRegisters.epoch, epochId),
          eq(schema.syncRegisters.resource, "payees"),
          eq(schema.syncRegisters.entityId, "payee-1"),
          eq(schema.syncRegisters.field, "name"),
        ),
      )
      .run();

    expect(() => activatePreparedEpoch(db, epochId)).toThrow(/live registers/);
    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      status: "preparing",
    });
  });

  test("rejects a tampered live actor frontier", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    const prepared = prepare(db);
    if (prepared.envelope === null)
      throw new Error("expected genesis envelope");
    db.update(schema.syncFrontiers)
      .set({ contiguousSequence: 2 })
      .where(
        and(
          eq(schema.syncFrontiers.epoch, epochId),
          eq(schema.syncFrontiers.actorId, prepared.envelope.actorId),
        ),
      )
      .run();

    expect(() => activatePreparedEpoch(db, epochId)).toThrow(/live frontiers/);
    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      status: "preparing",
    });
  });

  test("refuses activation while another epoch is active", () => {
    const { db } = makeDb();
    seedCompleteProjection(db);
    prepare(db, "epoch-first");
    activatePreparedEpoch(db, "epoch-first");
    prepare(db, "epoch-second");

    expect(() => activatePreparedEpoch(db, "epoch-second")).toThrow(
      /already active/,
    );
    expect(
      db
        .select()
        .from(schema.syncEpochs)
        .where(eq(schema.syncEpochs.id, "epoch-second"))
        .get(),
    ).toMatchObject({ status: "preparing" });
  });
});
