import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { Db } from "../db/index.ts";
import { recordChange, recordCommand } from "./changelog.ts";

let db: Db;

beforeEach(() => {
  db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
});

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

test("first financial write atomically creates the active epoch and event", () => {
  const row = account("a1", "One");
  db.transaction((tx) => {
    tx.insert(schema.accounts).values(row).run();
    expect(
      recordChange(tx, {
        resource: "accounts",
        resourceId: row.id,
        op: "upsert",
        payload: row,
      }),
    ).toBe(true);
  });
  expect(db.select().from(schema.syncEpochs).all()).toHaveLength(1);
  expect(db.select().from(schema.syncEpochs).get()?.status).toBe("active");
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
  expect(db.select().from(schema.syncRegisters).all().length).toBeGreaterThan(1);
});

test("first create event captures relational defaults omitted by route payload", () => {
  const accountRow = account("a1", "One");
  db.insert(schema.accounts).values(accountRow).run();
  const row = {
    id: "t1",
    accountId: "a1",
    amountCents: -100,
    date: "2026-07-22",
    createdAt: 10,
    updatedAt: 10,
  };
  db.transaction((tx) => {
    tx.insert(schema.transactions).values(row).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: row.id,
      op: "upsert",
      payload: row,
    });
  });
  const last = db
    .select()
    .from(schema.syncChanges)
    .all()
    .at(-1)!;
  const ops = JSON.parse(last.opsJson) as Array<{ field: string; value: unknown }>;
  expect(ops).toContainEqual(expect.objectContaining({ field: "reconciled", value: false }));
  expect(ops).toContainEqual(expect.objectContaining({ field: "origin", value: "manual" }));
});

test("one compound command authors one envelope for every affected entity", () => {
  const rows = [account("a1", "One"), account("a2", "Two")];
  recordCommand(db, (tx) => {
    for (const row of rows) {
      tx.insert(schema.accounts).values(row).run();
      recordChange(tx, {
        resource: "accounts",
        resourceId: row.id,
        op: "upsert",
        payload: row,
      });
    }
  });
  const events = db.select().from(schema.syncChanges).all();
  expect(events).toHaveLength(1);
  const ids = new Set(
    (JSON.parse(events[0]!.opsJson) as Array<{ entityId: string }>).map(
      (op) => op.entityId,
    ),
  );
  expect(ids).toEqual(new Set(["a1", "a2"]));
});

test("server-owned configuration cannot enter the financial event journal", () => {
  expect(
    recordChange(db, {
      resource: "rules",
      resourceId: "r1",
      op: "upsert",
      payload: { id: "r1" },
    }),
  ).toBe(false);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});
