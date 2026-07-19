import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { computeCalendar } from "./calendar.ts";

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const at = Date.now();

function account(id: string, archived = false) {
  return {
    id,
    name: id,
    kind: "checking",
    openingBalanceCents: 0,
    onBudget: true,
    archived,
    sortOrder: 0,
    createdAt: at,
    updatedAt: at,
  };
}

function txn(
  id: string,
  accountId: string,
  amountCents: number,
  date: string,
  parentId: string | null = null,
) {
  return {
    id,
    accountId,
    categoryId: null,
    payeeId: null,
    payeeName: null,
    amountCents,
    date,
    notes: null,
    latitude: null,
    longitude: null,
    locationName: null,
    cleared: false,
    origin: "manual",
    originRef: null,
    transferAccountId: null,
    transferGroupId: null,
    parentId,
    splitTotalCents: null,
    originalAmountCents: null,
    originalCurrency: null,
    createdAt: at,
    updatedAt: at,
  };
}

test("per-day totals: expense/income/net/count are correct", () => {
  const db = makeDb();
  db.insert(schema.accounts).values(account("a1")).run();
  db.insert(schema.transactions).values([
    txn("t1", "a1", -5000, "2026-07-01"),
    txn("t2", "a1", -3000, "2026-07-01"),
    txn("t3", "a1", 10000, "2026-07-01"), // income same day
    txn("t4", "a1", -2000, "2026-07-05"),
  ]).run();

  const days = computeCalendar(db, "2026-07-01", "2026-07-31");
  expect(days).toHaveLength(2);

  const d1 = days.find((d) => d.date === "2026-07-01")!;
  expect(d1.expenseCents).toBe(8000); // 5000 + 3000, positive
  expect(d1.incomeCents).toBe(10000);
  expect(d1.netCents).toBe(2000); // -5000 -3000 +10000
  expect(d1.txnCount).toBe(3);

  const d5 = days.find((d) => d.date === "2026-07-05")!;
  expect(d5.expenseCents).toBe(2000);
  expect(d5.incomeCents).toBe(0);
  expect(d5.netCents).toBe(-2000);
  expect(d5.txnCount).toBe(1);
});

test("split parent + children counted once (no double count)", () => {
  const db = makeDb();
  db.insert(schema.accounts).values(account("a1")).run();
  db.insert(schema.transactions).values([
    txn("t-parent", "a1", -10000, "2026-07-10", null),
    txn("t-child1", "a1", -6000, "2026-07-10", "t-parent"),
    txn("t-child2", "a1", -4000, "2026-07-10", "t-parent"),
  ]).run();

  const days = computeCalendar(db, "2026-07-01", "2026-07-31");
  expect(days).toHaveLength(1);
  expect(days[0]!.expenseCents).toBe(10000); // parent only
  expect(days[0]!.netCents).toBe(-10000);
  expect(days[0]!.txnCount).toBe(1);
});

test("archived account is excluded", () => {
  const db = makeDb();
  db.insert(schema.accounts).values(account("live")).run();
  db.insert(schema.accounts).values(account("dead", true)).run();
  db.insert(schema.transactions).values([
    txn("t1", "live", -5000, "2026-07-02"),
    txn("t2", "dead", -9999, "2026-07-02"),
  ]).run();

  const days = computeCalendar(db, "2026-07-01", "2026-07-31");
  expect(days).toHaveLength(1);
  expect(days[0]!.expenseCents).toBe(5000);
  expect(days[0]!.txnCount).toBe(1);
});

test("accountId filter is honored", () => {
  const db = makeDb();
  db.insert(schema.accounts).values(account("a1")).run();
  db.insert(schema.accounts).values(account("a2")).run();
  db.insert(schema.transactions).values([
    txn("t1", "a1", -5000, "2026-07-03"),
    txn("t2", "a2", -7000, "2026-07-03"),
  ]).run();

  const days = computeCalendar(db, "2026-07-01", "2026-07-31", "a2");
  expect(days).toHaveLength(1);
  expect(days[0]!.expenseCents).toBe(7000);
});

test("empty range returns []", () => {
  const db = makeDb();
  db.insert(schema.accounts).values(account("a1")).run();
  db.insert(schema.transactions).values([txn("t1", "a1", -5000, "2026-06-15")]).run();

  const days = computeCalendar(db, "2026-07-01", "2026-07-31");
  expect(days).toEqual([]);
});
