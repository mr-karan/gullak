import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { computeAgeOfMoney } from "./age_of_money.ts";

const at = 1_700_000_000_000;

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

function addAccount(db: Db, id: string, onBudget = true) {
  db.insert(schema.accounts)
    .values({ id, name: id, onBudget, createdAt: at, updatedAt: at })
    .run();
}

function addTxn(
  db: Db,
  o: { id: string; accountId: string; amountCents: number; date: string; transferGroupId?: string | null },
) {
  db.insert(schema.transactions)
    .values({
      id: o.id,
      accountId: o.accountId,
      amountCents: o.amountCents,
      date: o.date,
      transferGroupId: o.transferGroupId ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

// A fixed "today" well after all test data so nothing is filtered as future.
const now = new Date("2027-01-01T00:00:00Z");

test("simple inflow then outflow yields the day gap", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addTxn(db, { id: "in", accountId: "a1", amountCents: 100_00, date: "2026-01-01" });
  addTxn(db, { id: "out", accountId: "a1", amountCents: -50_00, date: "2026-01-11" });

  expect(computeAgeOfMoney(db, now)).toEqual({ days: 10 });
});

test("null when no outflow can be fully covered", () => {
  const db = makeDb();
  addAccount(db, "a1");
  // Only an inflow — no outflow to age.
  addTxn(db, { id: "in", accountId: "a1", amountCents: 100_00, date: "2026-01-01" });
  expect(computeAgeOfMoney(db, now)).toEqual({ days: null });

  // An outflow with no prior inflow can't be covered → still null.
  addTxn(db, { id: "early-out", accountId: "a1", amountCents: -10_00, date: "2025-12-01" });
  expect(computeAgeOfMoney(db, now)).toEqual({ days: null });
});

test("median of covered outflow ages (multiple batches)", () => {
  const db = makeDb();
  addAccount(db, "a1");
  // Three inflows, three fully-covered outflows each aging exactly one batch.
  addTxn(db, { id: "in1", accountId: "a1", amountCents: 100_00, date: "2026-01-01" });
  addTxn(db, { id: "out1", accountId: "a1", amountCents: -100_00, date: "2026-01-06" }); // age 5
  addTxn(db, { id: "in2", accountId: "a1", amountCents: 100_00, date: "2026-01-10" });
  addTxn(db, { id: "out2", accountId: "a1", amountCents: -100_00, date: "2026-01-20" }); // age 10
  addTxn(db, { id: "in3", accountId: "a1", amountCents: 100_00, date: "2026-01-25" });
  addTxn(db, { id: "out3", accountId: "a1", amountCents: -100_00, date: "2026-02-09" }); // age 15

  // Ages [5, 10, 15] → median 10.
  expect(computeAgeOfMoney(db, now)).toEqual({ days: 10 });
});

test("excludes transfers and off-budget accounts", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addAccount(db, "off", false);
  addTxn(db, { id: "in", accountId: "a1", amountCents: 100_00, date: "2026-01-01" });
  // Transfer leg on-budget — excluded from the metric.
  addTxn(db, { id: "xfer", accountId: "a1", amountCents: -40_00, date: "2026-01-03", transferGroupId: "g" });
  // Off-budget outflow — excluded.
  addTxn(db, { id: "offout", accountId: "off", amountCents: -40_00, date: "2026-01-04" });
  // Real covered outflow aged 20 days.
  addTxn(db, { id: "out", accountId: "a1", amountCents: -50_00, date: "2026-01-21" });

  expect(computeAgeOfMoney(db, now)).toEqual({ days: 20 });
});
