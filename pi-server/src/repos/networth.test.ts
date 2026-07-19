import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import {
  computeCashFlow,
  computeNetWorth,
  computeNetWorthHistory,
} from "./networth.ts";

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const at = 1_700_000_000_000;

function addAccount(
  db: Db,
  id: string,
  openingBalanceCents: number,
  archived = false,
) {
  db.insert(schema.accounts)
    .values({ id, name: id, openingBalanceCents, archived, createdAt: at, updatedAt: at })
    .run();
}

function addTxn(
  db: Db,
  id: string,
  accountId: string,
  amountCents: number,
  date: string,
  parentId: string | null = null,
) {
  db.insert(schema.transactions)
    .values({ id, accountId, amountCents, date, parentId, createdAt: at, updatedAt: at })
    .run();
}

// Fixed "now" so month keys are deterministic: window = Jan/Feb/Mar 2026.
const NOW = new Date(2026, 2, 15); // March 15 2026 (month index 2)

test("history: starting balance folds opening + pre-window activity", () => {
  const db = makeDb();
  addAccount(db, "a1", 100_00);
  addTxn(db, "pre", "a1", -30_00, "2025-12-10"); // before the window
  addTxn(db, "jan", "a1", 50_00, "2026-01-05");
  addTxn(db, "mar", "a1", -20_00, "2026-03-10");
  // Feb intentionally has no activity — it must carry forward.

  const hist = computeNetWorthHistory(db, 3, NOW);
  expect(hist.map((h) => h.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
  // start = 100_00 opening - 30_00 pre = 70_00; +50 Jan = 120_00
  expect(hist[0]).toEqual({
    month: "2026-01",
    cashCents: 120_00,
    investedCents: 0,
    totalCents: 120_00,
  });
  // Feb empty → carries 120_00 forward
  expect(hist[1]).toEqual({
    month: "2026-02",
    cashCents: 120_00,
    investedCents: 0,
    totalCents: 120_00,
  });
  // Mar -20_00 → 100_00
  expect(hist[2]).toEqual({
    month: "2026-03",
    cashCents: 100_00,
    investedCents: 0,
    totalCents: 100_00,
  });
});

test("history: excludes archived accounts and split children", () => {
  const db = makeDb();
  addAccount(db, "a1", 0);
  addAccount(db, "arch", 999_00, true); // archived opening excluded
  addTxn(db, "archtx", "arch", 500_00, "2026-02-01"); // archived activity excluded
  addTxn(db, "parent", "a1", -100_00, "2026-02-10");
  addTxn(db, "child1", "a1", -60_00, "2026-02-10", "parent"); // split child excluded
  addTxn(db, "child2", "a1", -40_00, "2026-02-10", "parent");

  const hist = computeNetWorthHistory(db, 3, NOW);
  // Only the parent counts: -100_00 in Feb, carried to Mar.
  expect(hist[0]!.cashCents).toBe(0);
  expect(hist[1]!.cashCents).toBe(-100_00);
  expect(hist[2]!.cashCents).toBe(-100_00);
});

test("history: only the latest month carries invested value", () => {
  const db = makeDb();
  addAccount(db, "a1", 10_00);
  db.insert(schema.holdings)
    .values({
      id: "h1",
      isin: "INE245A01021",
      symbol: "TATA",
      kind: "equity",
      quantity: 1,
      avgPrice: 1,
      lastPrice: 1,
      investedCents: 500_00,
      currentCents: 800_00,
      importedAt: at,
      createdAt: at,
      updatedAt: at,
    })
    .run();

  const hist = computeNetWorthHistory(db, 3, NOW);
  const nw = computeNetWorth(db);
  expect(nw.investedCurrentCents).toBe(800_00);
  // Earlier months: invested 0, total = cash.
  expect(hist[0]!.investedCents).toBe(0);
  expect(hist[0]!.totalCents).toBe(hist[0]!.cashCents);
  expect(hist[1]!.investedCents).toBe(0);
  // Latest month: invested = current non-stale holdings value.
  expect(hist[2]!.investedCents).toBe(800_00);
  expect(hist[2]!.totalCents).toBe(hist[2]!.cashCents + 800_00);
});

test("cash-flow: groups income/expense per month, zero-fills empty months", () => {
  const db = makeDb();
  addAccount(db, "a1", 0);
  addAccount(db, "arch", 0, true);
  addTxn(db, "inc", "a1", 200_00, "2026-01-03");
  addTxn(db, "exp", "a1", -50_00, "2026-01-20");
  addTxn(db, "archtx", "arch", -999_00, "2026-01-20"); // archived excluded
  addTxn(db, "parent", "a1", -100_00, "2026-03-01");
  addTxn(db, "child", "a1", -100_00, "2026-03-01", "parent"); // split child excluded

  const cf = computeCashFlow(db, 3, NOW);
  expect(cf.map((c) => c.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
  expect(cf[0]).toEqual({
    month: "2026-01",
    incomeCents: 200_00,
    expenseCents: -50_00,
    netCents: 150_00,
  });
  // Feb empty → all zero.
  expect(cf[1]).toEqual({
    month: "2026-02",
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
  });
  // Mar: only the parent (-100_00), child excluded.
  expect(cf[2]).toEqual({
    month: "2026-03",
    incomeCents: 0,
    expenseCents: -100_00,
    netCents: -100_00,
  });
});
