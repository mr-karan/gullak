import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { newPayees, topSpends } from "./insights.ts";

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const at = 1_700_000_000_000;

function addAccount(db: Db, id: string, archived = false) {
  db.insert(schema.accounts)
    .values({ id, name: id, archived, createdAt: at, updatedAt: at })
    .run();
}

function addPayee(db: Db, id: string, name: string) {
  db.insert(schema.payees).values({ id, name, updatedAt: at }).run();
}

function addTxn(
  db: Db,
  o: {
    id: string;
    accountId: string;
    amountCents: number;
    date: string;
    payeeId?: string | null;
    parentId?: string | null;
  },
) {
  db.insert(schema.transactions)
    .values({
      id: o.id,
      accountId: o.accountId,
      amountCents: o.amountCents,
      date: o.date,
      payeeId: o.payeeId ?? null,
      parentId: o.parentId ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

const START = "2026-03-01";
const END = "2026-03-31";

test("newPayees: excludes a payee that transacted before the window", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addPayee(db, "pA", "Old Vendor");
  addPayee(db, "pB", "New Vendor");
  // pA: first seen BEFORE the window, plus one inside → excluded.
  addTxn(db, { id: "a-old", accountId: "a1", amountCents: -10_00, date: "2026-01-15", payeeId: "pA" });
  addTxn(db, { id: "a-now", accountId: "a1", amountCents: -20_00, date: "2026-03-05", payeeId: "pA" });
  // pB: first seen INSIDE the window → included.
  addTxn(db, { id: "b1", accountId: "a1", amountCents: -30_00, date: "2026-03-10", payeeId: "pB" });
  addTxn(db, { id: "b2", accountId: "a1", amountCents: -15_00, date: "2026-03-20", payeeId: "pB" });

  const rows = newPayees(db, START, END);
  expect(rows.map((r) => r.payeeId)).toEqual(["pB"]);
  const pB = rows[0]!;
  expect(pB.payeeName).toBe("New Vendor");
  expect(pB.firstDate).toBe("2026-03-10");
  expect(pB.firstAmountCents).toBe(-30_00); // amount on the first-seen date
  expect(pB.periodTotalCents).toBe(-45_00); // -30 + -15 within window
  expect(pB.txnCount).toBe(2);
});

test("newPayees: guards on split children and archived accounts", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addAccount(db, "arch", true);
  addPayee(db, "pSplit", "Split Payee");
  addPayee(db, "pArch", "Archived Payee");
  // A split child first-seen in window must not surface (parent has no payee).
  addTxn(db, { id: "par", accountId: "a1", amountCents: -100_00, date: "2026-03-02" });
  addTxn(db, { id: "chi", accountId: "a1", amountCents: -100_00, date: "2026-03-02", payeeId: "pSplit", parentId: "par" });
  // A payee only ever seen on an archived account must not surface.
  addTxn(db, { id: "arx", accountId: "arch", amountCents: -50_00, date: "2026-03-03", payeeId: "pArch" });

  const rows = newPayees(db, START, END);
  expect(rows).toHaveLength(0);
});

test("topSpends: orders most-negative first and respects limit", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addTxn(db, { id: "small", accountId: "a1", amountCents: -10_00, date: "2026-03-04" });
  addTxn(db, { id: "big", accountId: "a1", amountCents: -90_00, date: "2026-03-05" });
  addTxn(db, { id: "mid", accountId: "a1", amountCents: -50_00, date: "2026-03-06" });
  addTxn(db, { id: "income", accountId: "a1", amountCents: 200_00, date: "2026-03-07" }); // inflow excluded

  const all = topSpends(db, START, END);
  expect(all.map((t) => t.id)).toEqual(["big", "mid", "small"]);

  const limited = topSpends(db, START, END, undefined, 2);
  expect(limited.map((t) => t.id)).toEqual(["big", "mid"]);
});

test("topSpends: filters by accountId and excludes split children", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addAccount(db, "a2");
  addTxn(db, { id: "a1big", accountId: "a1", amountCents: -80_00, date: "2026-03-05" });
  addTxn(db, { id: "a2big", accountId: "a2", amountCents: -95_00, date: "2026-03-05" });
  // Split parent + children on a1: only the parent may appear.
  addTxn(db, { id: "par", accountId: "a1", amountCents: -70_00, date: "2026-03-06" });
  addTxn(db, { id: "chi", accountId: "a1", amountCents: -70_00, date: "2026-03-06", parentId: "par" });

  const a1 = topSpends(db, START, END, "a1");
  expect(a1.map((t) => t.id)).toEqual(["a1big", "par"]); // a2 excluded, child excluded

  const a2 = topSpends(db, START, END, "a2");
  expect(a2.map((t) => t.id)).toEqual(["a2big"]);
});

test("topSpends: honours the date range", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addTxn(db, { id: "before", accountId: "a1", amountCents: -99_00, date: "2026-02-28" });
  addTxn(db, { id: "inside", accountId: "a1", amountCents: -40_00, date: "2026-03-15" });
  addTxn(db, { id: "after", accountId: "a1", amountCents: -99_00, date: "2026-04-01" });

  const rows = topSpends(db, START, END);
  expect(rows.map((t) => t.id)).toEqual(["inside"]);
});
