import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { Db } from "../db/index.ts";
import { recordChange, recordCommand } from "./changelog.ts";

let db: Db;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
});

function activateV2() {
  db.insert(schema.syncEpochs)
    .values({ id: "e1", schemaVersion: 1, status: "active" })
    .run();
  db.insert(schema.syncLocalClocks)
    .values({ epoch: "e1", actorId: "server", nextSequence: 1, lamport: 0 })
    .run();
}

function prepareV2() {
  db.insert(schema.syncEpochs)
    .values({ id: "e1", schemaVersion: 1, status: "preparing" })
    .run();
  db.insert(schema.syncLocalClocks)
    .values({ epoch: "e1", actorId: "server", nextSequence: 1, lamport: 0 })
    .run();
}

function account(id: string, name: string) {
  return {
    id,
    name,
    kind: "checking",
    openingBalanceCents: 0,
    onBudget: true,
    archived: false,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

test("legacy-only mode preserves the existing snapshot changelog", () => {
  expect(
    recordChange(db, {
      resource: "accounts",
      resourceId: "a1",
      op: "upsert",
      payload: account("a1", "One"),
    }),
  ).toBe(true);
  expect(db.select().from(schema.changeLog).all()).toHaveLength(1);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});

test("active v2 authors one atomic event alongside the transitional v1 row", () => {
  activateV2();
  const row = account("a1", "One");
  db.transaction((tx) => {
    tx.insert(schema.accounts).values(row).run();
    recordChange(tx, {
      resource: "accounts",
      resourceId: "a1",
      op: "upsert",
      payload: row,
    });
  });
  expect(db.select().from(schema.changeLog).all()).toHaveLength(1);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
  expect(db.select().from(schema.syncRegisters).all().length).toBeGreaterThan(
    1,
  );
});

test("preparing v2 keeps the shadow event history current", () => {
  prepareV2();
  const row = account("a1", "Shadow");
  db.transaction((tx) => {
    tx.insert(schema.accounts).values(row).run();
    recordChange(tx, {
      resource: "accounts",
      resourceId: "a1",
      op: "upsert",
      payload: row,
    });
  });
  expect(db.select().from(schema.changeLog).all()).toHaveLength(1);
  const events = db.select().from(schema.syncChanges).all();
  expect(events).toHaveLength(1);
  expect(events[0]?.epoch).toBe("e1");
});

test("first create event captures relational defaults omitted by route payload", () => {
  activateV2();
  db.insert(schema.accounts).values(account("a1", "One")).run();
  db.transaction((tx) => {
    tx.insert(schema.transactions)
      .values({
        id: "t1",
        accountId: "a1",
        amountCents: -100,
        date: "2026-07-22",
        createdAt: 10,
        updatedAt: 10,
      })
      .run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: "t1",
      op: "upsert",
      payload: {
        id: "t1",
        accountId: "a1",
        amountCents: -100,
        date: "2026-07-22",
        createdAt: 10,
        updatedAt: 10,
      },
    });
  });
  const ops = JSON.parse(db.select().from(schema.syncChanges).get()!.opsJson) as
    Array<{ field: string; value: unknown }>;
  expect(ops).toContainEqual(expect.objectContaining({ field: "reconciled", value: false }));
  expect(ops).toContainEqual(expect.objectContaining({ field: "isGroupParent", value: false }));
  expect(ops).toContainEqual(expect.objectContaining({ field: "origin", value: "manual" }));
});

test("recordCommand groups a multi-row domain command into one v2 envelope", () => {
  activateV2();
  const first = account("a1", "One");
  const second = account("a2", "Two");
  recordCommand(db, (tx) => {
    for (const row of [first, second]) {
      tx.insert(schema.accounts).values(row).run();
      recordChange(tx, {
        resource: "accounts",
        resourceId: row.id,
        op: "upsert",
        payload: row,
      });
    }
  });
  expect(db.select().from(schema.changeLog).all()).toHaveLength(2);
  const events = db.select().from(schema.syncChanges).all();
  expect(events).toHaveLength(1);
  expect(
    new Set(
      (JSON.parse(events[0]!.opsJson) as Array<{ entityId: string }>).map(
        (op) => op.entityId,
      ),
    ),
  ).toEqual(new Set(["a1", "a2"]));
});

test("server-owned rules stay out of v2 without breaking their transitional legacy log", () => {
  activateV2();
  expect(
    recordChange(db, {
      resource: "rules",
      resourceId: "r1",
      op: "upsert",
      payload: { id: "r1", name: "must stay server-only" },
    }),
  ).toBe(true);
  expect(db.select().from(schema.changeLog).all()).toHaveLength(1);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});
