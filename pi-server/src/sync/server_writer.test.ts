import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { ChangeEnvelope } from "./crdt.ts";
import {
  ProjectionValidationError,
  transactionTagEntityId,
} from "./resources.ts";
import { ServerWriterError, authorServerCommand } from "./server_writer.ts";
import { applySyncChange } from "./store.ts";

const epoch = "active-epoch";

function makeDb(status: "preparing" | "active" = "active") {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.syncEpochs)
    .values({
      id: epoch,
      protocol: 2,
      schemaVersion: 1,
      status,
    })
    .run();
  db.insert(schema.syncLocalClocks)
    .values({
      epoch,
      actorId: "server-actor",
      nextSequence: 1,
      lamport: 0,
      integratedCursor: 0,
    })
    .run();
  db.insert(schema.accounts)
    .values([
      {
        id: "account-a",
        name: "A",
        kind: "checking",
        openingBalanceCents: 0,
        onBudget: true,
        archived: false,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "account-b",
        name: "B",
        kind: "checking",
        openingBalanceCents: 0,
        onBudget: true,
        archived: false,
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    .run();
  return { db, sqlite };
}

function transactionPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    accountId: "account-a",
    amountCents: -5000,
    date: "2026-07-22",
    cleared: false,
    reconciled: false,
    origin: "manual",
    isGroupParent: false,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function accountPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "Current Account",
    kind: "checking",
    openingBalanceCents: 0,
    onBudget: true,
    archived: false,
    sortOrder: 0,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function author(
  db: ReturnType<typeof makeDb>["db"],
  mutations: Parameters<typeof authorServerCommand>[1],
) {
  return authorServerCommand(db, mutations, {
    source: "server-test",
    wallTimeMs: 9000,
    acceptedAt: 9001,
  });
}

function storedEnvelope(db: ReturnType<typeof makeDb>["db"], sequence: number) {
  const row = db
    .select({ envelopeJson: schema.syncChanges.envelopeJson })
    .from(schema.syncChanges)
    .where(eq(schema.syncChanges.sequence, sequence))
    .get();
  if (row === undefined) throw new Error(`missing server change ${sequence}`);
  return JSON.parse(row.envelopeJson) as ChangeEnvelope;
}

describe("trusted server command authoring", () => {
  test("preparing commands tolerate legacy relation keys until activation", () => {
    const { db } = makeDb("preparing");
    db.insert(schema.transactions)
      .values({ id: "txn-legacy", ...transactionPayload() } as typeof schema.transactions.$inferInsert)
      .run();
    db.insert(schema.tags)
      .values({ id: "tag-legacy", name: "Legacy", createdAt: 1, updatedAt: 1 })
      .run();
    db.insert(schema.transactionTags)
      .values({
        id: "random-v1-id",
        transactionId: "txn-legacy",
        tagId: "tag-legacy",
        updatedAt: 1,
      })
      .run();

    const result = author(db, [
      {
        resource: "accounts",
        entityId: "account-a",
        op: "upsert",
        payload: { name: "Renamed during drain" },
      },
    ]);

    expect(result.status).toBe("accepted");
    expect(db.select().from(schema.transactionTags).get()?.id).toBe(
      "random-v1-id",
    );
  });

  test("active commands reject legacy relation keys", () => {
    const { db } = makeDb("active");
    db.insert(schema.transactions)
      .values({ id: "txn-legacy", ...transactionPayload() } as typeof schema.transactions.$inferInsert)
      .run();
    db.insert(schema.tags)
      .values({ id: "tag-legacy", name: "Legacy", createdAt: 1, updatedAt: 1 })
      .run();
    db.insert(schema.transactionTags)
      .values({
        id: "random-v1-id",
        transactionId: "txn-legacy",
        tagId: "tag-legacy",
        updatedAt: 1,
      })
      .run();

    expect(() =>
      author(db, [
        {
          resource: "accounts",
          entityId: "account-a",
          op: "upsert",
          payload: { name: "Must fail" },
        },
      ]),
    ).toThrow(ProjectionValidationError);
    expect(db.select().from(schema.syncChanges).all()).toEqual([]);
  });

  test("a split parent is replayable without an authored amount fact", () => {
    const { db } = makeDb();
    const structural = transactionPayload({
      origin: "split",
      categoryId: null,
    });
    delete structural.amountCents;
    const result = author(db, [
      {
        resource: "transactions",
        entityId: "split-parent",
        op: "upsert",
        payload: structural,
      },
      {
        resource: "transactions",
        entityId: "split-a",
        op: "upsert",
        payload: transactionPayload({
          amountCents: -300,
          parentId: "split-parent",
        }),
      },
      {
        resource: "transactions",
        entityId: "split-b",
        op: "upsert",
        payload: transactionPayload({
          amountCents: -700,
          parentId: "split-parent",
        }),
      },
    ]);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected acceptance");
    expect(
      result.envelope.ops.some(
        (op) => op.entityId === "split-parent" && op.field === "amountCents",
      ),
    ).toBe(false);
    expect(
      db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, "split-parent"))
        .get(),
    ).toMatchObject({ amountCents: -1000, splitTotalCents: -1000 });
  });

  test("first server create captures SQLite-defaulted replicated fields", () => {
    const { db } = makeDb();
    db.insert(schema.payees)
      .values({ id: "payee-defaults", name: "Complete", updatedAt: 100 })
      .run();

    const result = author(db, [
      {
        resource: "payees",
        entityId: "payee-defaults",
        op: "upsert",
        payload: { name: "Complete", updatedAt: 100 },
      },
    ]);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected acceptance");
    expect(result.envelope.ops).toContainEqual({
      kind: "assign",
      resource: "payees",
      entityId: "payee-defaults",
      field: "learnCategories",
      value: true,
    });
  });

  test("a transfer pair is one atomic multi-row event", () => {
    const { db } = makeDb();
    const result = author(db, [
      {
        resource: "transactions",
        entityId: "transfer-out",
        op: "upsert",
        payload: transactionPayload({
          transferAccountId: "account-b",
          transferGroupId: "group-1",
        }),
      },
      {
        resource: "transactions",
        entityId: "transfer-in",
        op: "upsert",
        payload: transactionPayload({
          accountId: "account-b",
          amountCents: 5000,
          transferAccountId: "account-a",
          transferGroupId: "group-1",
        }),
      },
    ]);

    expect(result.status).toBe("accepted");
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
    expect(db.select().from(schema.transactions).all()).toHaveLength(2);
    if (result.status !== "accepted") throw new Error("expected acceptance");
    expect(new Set(result.envelope.ops.map((op) => op.entityId))).toEqual(
      new Set(["transfer-out", "transfer-in"]),
    );
    expect(result.envelope.ops.filter((op) => op.field === "$exists")).toEqual([
      expect.objectContaining({ entityId: "transfer-out", value: true }),
      expect.objectContaining({ entityId: "transfer-in", value: true }),
    ]);
    expect(db.select().from(schema.syncLocalClocks).get()).toMatchObject({
      nextSequence: 2,
      lamport: 1,
      integratedCursor: 1,
    });
  });

  test("an update emits only patch keys whose visible values changed", () => {
    const { db } = makeDb();
    author(db, [
      {
        resource: "transactions",
        entityId: "txn-1",
        op: "upsert",
        payload: transactionPayload({
          payeeName: "Dyson V15",
          notes: null,
        }),
      },
    ]);

    const result = author(db, [
      {
        resource: "transactions",
        entityId: "txn-1",
        op: "upsert",
        payload: {
          id: "ignored-row-id",
          notes: "probe",
          staleUntouchedPayeeName: "Payu Retail",
          useCount: 999,
        },
      },
    ]);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected acceptance");
    expect(result.envelope.ops).toEqual([
      {
        kind: "assign",
        resource: "transactions",
        entityId: "txn-1",
        field: "notes",
        value: "probe",
      },
    ]);
    expect(
      db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, "txn-1"))
        .get(),
    ).toMatchObject({ payeeName: "Dyson V15", notes: "probe" });
  });

  test("delete authors only the lifecycle tombstone and materializes removal", () => {
    const { db } = makeDb();
    author(db, [
      {
        resource: "transactions",
        entityId: "txn-1",
        op: "upsert",
        payload: transactionPayload(),
      },
    ]);
    const result = author(db, [
      { resource: "transactions", entityId: "txn-1", op: "delete" },
    ]);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected acceptance");
    expect(result.envelope.ops).toEqual([
      {
        kind: "assign",
        resource: "transactions",
        entityId: "txn-1",
        field: "$exists",
        value: false,
      },
    ]);
    expect(
      db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, "txn-1"))
        .get(),
    ).toBeUndefined();
  });

  test("transaction-tag creation uses add-wins membership lifecycle", () => {
    const { db } = makeDb();
    db.insert(schema.transactions)
      .values({
        id: "txn-1",
        ...transactionPayload(),
      } as typeof schema.transactions.$inferInsert)
      .run();
    db.insert(schema.tags)
      .values({ id: "tag-1", name: "Home", createdAt: 1, updatedAt: 1 })
      .run();
    const relationId = transactionTagEntityId("txn-1", "tag-1");
    const result = author(db, [
      {
        resource: "transaction_tags",
        entityId: relationId,
        op: "upsert",
        payload: { transactionId: "txn-1", tagId: "tag-1", updatedAt: 100 },
      },
    ]);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected acceptance");
    expect(result.envelope.ops[0]).toMatchObject({
      field: "$member",
      value: true,
    });
    expect(db.select().from(schema.transactionTags).get()).toMatchObject({
      id: relationId,
      transactionId: "txn-1",
      tagId: "tag-1",
    });
  });

  test("context is every accepted frontier and clock advances exactly", () => {
    const { db } = makeDb();
    for (const actorId of ["phone", "web"]) {
      const remote: ChangeEnvelope = {
        protocol: 2,
        epoch,
        changeId: `${actorId}:1`,
        actorId,
        sequence: 1,
        context: {},
        lamport: 1,
        wallTimeMs: 1,
        schemaVersion: 1,
        ops: [
          {
            kind: "assign",
            resource: "accounts",
            entityId: `opaque-${actorId}`,
            field: "future.metadata",
            value: actorId,
          },
        ],
      };
      expect(
        applySyncChange(db, remote, { source: "remote", acceptedAt: 2 }).status,
      ).toBe("accepted");
    }

    const first = author(db, [
      {
        resource: "accounts",
        entityId: "account-a",
        op: "upsert",
        payload: accountPayload(),
      },
    ]);
    expect(first.status).toBe("accepted");
    if (first.status !== "accepted") throw new Error("expected acceptance");
    expect(first.envelope).toMatchObject({
      actorId: "server-actor",
      sequence: 1,
      context: { phone: 1, web: 1 },
      lamport: 2,
      wallTimeMs: 9000,
    });

    const second = author(db, [
      {
        resource: "accounts",
        entityId: "account-a",
        op: "upsert",
        payload: { name: "Renamed" },
      },
    ]);
    expect(second.status).toBe("accepted");
    if (second.status !== "accepted") throw new Error("expected acceptance");
    expect(second.envelope).toMatchObject({
      sequence: 2,
      context: { phone: 1, "server-actor": 1, web: 1 },
      lamport: 3,
    });
    expect(storedEnvelope(db, 2).context).toEqual(second.envelope.context);
    expect(db.select().from(schema.syncLocalClocks).get()).toMatchObject({
      nextSequence: 3,
      lamport: 3,
    });
  });

  test("a true no-op emits no event and consumes no sequence", () => {
    const { db } = makeDb();
    author(db, [
      {
        resource: "accounts",
        entityId: "account-a",
        op: "upsert",
        payload: accountPayload(),
      },
    ]);
    const before = db.select().from(schema.syncLocalClocks).get();
    const result = author(db, [
      {
        resource: "accounts",
        entityId: "account-a",
        op: "upsert",
        payload: {
          id: "ignored",
          name: "Current Account",
          futureMetadata: "ignored",
        },
      },
    ]);

    expect(result).toMatchObject({ status: "noop", transportCursor: null });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
    expect(db.select().from(schema.syncLocalClocks).get()).toEqual(before);
  });

  test("an incomplete create rolls event, registers, projection, and allocator back", () => {
    const { db } = makeDb();
    expect(() =>
      author(db, [
        {
          resource: "transactions",
          entityId: "incomplete",
          op: "upsert",
          payload: { notes: "not enough to create" },
        },
      ]),
    ).toThrow(/create is missing/);

    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.transactions).all()).toHaveLength(0);
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
    expect(db.select().from(schema.syncLocalClocks).get()).toMatchObject({
      nextSequence: 1,
      lamport: 0,
      integratedCursor: 0,
    });
  });

  test("an invalid known value is rejected with full rollback", () => {
    const { db } = makeDb();
    expect(() =>
      author(db, [
        {
          resource: "transactions",
          entityId: "invalid",
          op: "upsert",
          payload: transactionPayload({ amountCents: 1.5 }),
        },
      ]),
    ).toThrow(ServerWriterError);
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.syncLocalClocks).get()?.nextSequence).toBe(
      1,
    );
  });

  test("server-only rules cannot enter the replicated event stream", () => {
    const { db } = makeDb();
    expect(() =>
      author(db, [
        {
          resource: "rules",
          entityId: "rule-1",
          op: "upsert",
          payload: { name: "must not sync" },
        },
      ]),
    ).toThrow(ProjectionValidationError);
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncLocalClocks).get()?.nextSequence).toBe(
      1,
    );
  });
});
