import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { assignBudget, computeBudgetPlan } from "./budget.ts";

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
  o: { onBudget?: boolean; openingBalanceCents?: number } = {},
) {
  db.insert(schema.accounts)
    .values({
      id,
      name: id,
      onBudget: o.onBudget ?? true,
      openingBalanceCents: o.openingBalanceCents ?? 0,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function addGroup(
  db: Db,
  id: string,
  o: { isIncome?: boolean; sortOrder?: number } = {},
) {
  db.insert(schema.categoryGroups)
    .values({
      id,
      name: id,
      isIncome: o.isIncome ?? false,
      sortOrder: o.sortOrder ?? 0,
    })
    .run();
}

function addCategory(
  db: Db,
  id: string,
  groupId: string,
  sortOrder = 0,
) {
  db.insert(schema.categories)
    .values({ id, name: id, groupId, sortOrder, updatedAt: at })
    .run();
}

function addTxn(
  db: Db,
  o: {
    id: string;
    accountId: string;
    categoryId?: string | null;
    amountCents: number;
    date: string;
    parentId?: string | null;
    isGroupParent?: boolean;
    transferGroupId?: string | null;
  },
) {
  db.insert(schema.transactions)
    .values({
      id: o.id,
      accountId: o.accountId,
      categoryId: o.categoryId ?? null,
      amountCents: o.amountCents,
      date: o.date,
      parentId: o.parentId ?? null,
      isGroupParent: o.isGroupParent ?? false,
      transferGroupId: o.transferGroupId ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function addTarget(
  db: Db,
  o: { categoryId: string; type: "monthly" | "by_date"; amountCents: number; byDate?: string | null },
) {
  db.insert(schema.categoryTargets)
    .values({
      categoryId: o.categoryId,
      type: o.type,
      amountCents: o.amountCents,
      byDate: o.byDate ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function addRecurrence(
  db: Db,
  o: { id: string; accountId: string; categoryId: string; amountCents: number; nextDate: string },
) {
  db.insert(schema.recurrences)
    .values({
      id: o.id,
      accountId: o.accountId,
      categoryId: o.categoryId,
      amountCents: o.amountCents,
      cadence: "monthly",
      nextDate: o.nextDate,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function findCat(plan: ReturnType<typeof computeBudgetPlan>, categoryId: string) {
  for (const g of plan.groups) {
    const c = g.categories.find((x) => x.categoryId === categoryId);
    if (c) return c;
  }
  return undefined;
}

test("available rolls over across months", () => {
  const db = makeDb();
  addAccount(db, "a1", { openingBalanceCents: 1_000_00 });
  addGroup(db, "g1");
  addCategory(db, "food", "g1");

  // Assign 100 in Jan, spend 60 in Jan.
  assignBudget(db, { categoryId: "food", month: "2026-01", assignedCents: 100_00 });
  addTxn(db, { id: "t1", accountId: "a1", categoryId: "food", amountCents: -60_00, date: "2026-01-15" });

  const jan = findCat(computeBudgetPlan(db, "2026-01"), "food")!;
  expect(jan.assignedCents).toBe(100_00);
  expect(jan.activityCents).toBe(-60_00);
  expect(jan.availableCents).toBe(40_00);

  // Nothing assigned/spent in Feb → the 40 carries forward.
  const feb = findCat(computeBudgetPlan(db, "2026-02"), "food")!;
  expect(feb.assignedCents).toBe(0);
  expect(feb.activityCents).toBe(0);
  expect(feb.availableCents).toBe(40_00);
});

test("activity excludes transfers, split children, group parents, off-budget", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addAccount(db, "off", { onBudget: false });
  addGroup(db, "g1");
  addCategory(db, "food", "g1");

  // Real spend — counted.
  addTxn(db, { id: "real", accountId: "a1", categoryId: "food", amountCents: -20_00, date: "2026-03-05" });
  // Transfer leg — excluded.
  addTxn(db, { id: "xfer", accountId: "a1", categoryId: "food", amountCents: -90_00, date: "2026-03-06", transferGroupId: "grp" });
  // Split child — excluded (parentId set).
  addTxn(db, { id: "child", accountId: "a1", categoryId: "food", amountCents: -30_00, date: "2026-03-07", parentId: "par" });
  // Group parent — excluded.
  addTxn(db, { id: "gp", accountId: "a1", categoryId: "food", amountCents: -50_00, date: "2026-03-08", isGroupParent: true });
  // Off-budget account spend — excluded.
  addTxn(db, { id: "offspend", accountId: "off", categoryId: "food", amountCents: -70_00, date: "2026-03-09" });

  const food = findCat(computeBudgetPlan(db, "2026-03"), "food")!;
  expect(food.activityCents).toBe(-20_00);
});

test("readyToAssign = on-budget balances − Σ available; assigning moves from RTA into available", () => {
  const db = makeDb();
  // 1000 opening + 200 inflow (uncategorized → stays in RTA) − 60 spend.
  addAccount(db, "a1", { openingBalanceCents: 1_000_00 });
  addAccount(db, "off", { onBudget: false, openingBalanceCents: 5_000_00 }); // ignored
  addGroup(db, "g1");
  addCategory(db, "food", "g1");

  addTxn(db, { id: "inflow", accountId: "a1", categoryId: null, amountCents: 200_00, date: "2026-04-01" });
  addTxn(db, { id: "spend", accountId: "a1", categoryId: "food", amountCents: -60_00, date: "2026-04-10" });

  // On-budget balance = 1000 + 200 − 60 = 1140.
  // Before assigning: food available = 0 + (−60) = −60. Σ available = −60.
  const before = computeBudgetPlan(db, "2026-04");
  expect(findCat(before, "food")!.availableCents).toBe(-60_00);
  expect(before.readyToAssign).toBe(1_140_00 - -60_00); // 1200_00

  // Assign 300 to food → available becomes 300 − 60 = 240; RTA drops by 300.
  assignBudget(db, { categoryId: "food", month: "2026-04", assignedCents: 300_00 });
  const after = computeBudgetPlan(db, "2026-04");
  expect(findCat(after, "food")!.availableCents).toBe(240_00);
  expect(after.readyToAssign).toBe(before.readyToAssign - 300_00);
});

test("income-group categories are excluded from the plan", () => {
  const db = makeDb();
  addAccount(db, "a1", { openingBalanceCents: 0 });
  addGroup(db, "income", { isIncome: true, sortOrder: 0 });
  addGroup(db, "spending", { isIncome: false, sortOrder: 1 });
  addCategory(db, "salary", "income");
  addCategory(db, "food", "spending");

  // Salary inflow lands in the account and flows to RTA, not an envelope.
  addTxn(db, { id: "pay", accountId: "a1", categoryId: "salary", amountCents: 500_00, date: "2026-05-01" });

  const plan = computeBudgetPlan(db, "2026-05");
  expect(plan.groups.map((g) => g.groupId)).toEqual(["spending"]);
  expect(findCat(plan, "salary")).toBeUndefined();
  expect(findCat(plan, "food")).toBeDefined();
  // Balance 500 sits fully in RTA (no available anywhere).
  expect(plan.readyToAssign).toBe(500_00);
});

test("overspend: spending more than assigned yields negative available", () => {
  const db = makeDb();
  addAccount(db, "a1", { openingBalanceCents: 1_000_00 });
  addGroup(db, "g1");
  addCategory(db, "food", "g1");

  assignBudget(db, { categoryId: "food", month: "2026-06", assignedCents: 50_00 });
  addTxn(db, { id: "big", accountId: "a1", categoryId: "food", amountCents: -80_00, date: "2026-06-12" });

  const food = findCat(computeBudgetPlan(db, "2026-06"), "food")!;
  expect(food.availableCents).toBe(-30_00);
});

test("assignBudget upserts without duplicates and emits a causal event", () => {
  const db = makeDb();
  addGroup(db, "g1");
  addCategory(db, "food", "g1");

  assignBudget(db, { categoryId: "food", month: "2026-07", assignedCents: 100_00 });
  assignBudget(db, { categoryId: "food", month: "2026-07", assignedCents: 250_00 });

  const rows = db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.categoryId, "food"))
    .all();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.targetCents).toBe(250_00);

  const ops = db.select().from(schema.syncChanges).all().flatMap((event) =>
    JSON.parse(event.opsJson) as Array<{ resource: string; entityId: string }>,
  );
  expect(
    ops.some((op) => op.resource === "budgets" && op.entityId === rows[0]!.id),
  ).toBe(true);
});

test("monthly target: underfunded when assigned < target, funded when >=", () => {
  const db = makeDb();
  addAccount(db, "a1", { openingBalanceCents: 1_000_00 });
  addGroup(db, "g1");
  addCategory(db, "food", "g1");
  addTarget(db, { categoryId: "food", type: "monthly", amountCents: 100_00 });

  // Nothing assigned → needs the whole target this month, underfunded.
  let food = findCat(computeBudgetPlan(db, "2026-01"), "food")!;
  expect(food.target).toEqual({ type: "monthly", amountCents: 100_00, byDate: null });
  expect(food.targetNeededCents).toBe(100_00);
  expect(food.targetStatus).toBe("underfunded");

  // Assign part → needed shrinks by the assigned amount.
  assignBudget(db, { categoryId: "food", month: "2026-01", assignedCents: 30_00 });
  food = findCat(computeBudgetPlan(db, "2026-01"), "food")!;
  expect(food.targetNeededCents).toBe(70_00);
  expect(food.targetStatus).toBe("underfunded");

  // Assign the rest → funded, needed 0.
  assignBudget(db, { categoryId: "food", month: "2026-01", assignedCents: 100_00 });
  food = findCat(computeBudgetPlan(db, "2026-01"), "food")!;
  expect(food.targetNeededCents).toBe(0);
  expect(food.targetStatus).toBe("funded");
});

test("by_date target: pace over months-left; needed = pace − assigned", () => {
  const db = makeDb();
  addAccount(db, "a1", { openingBalanceCents: 1_000_00 });
  addGroup(db, "g1");
  addCategory(db, "trip", "g1");
  // Reach 300_00 by March; from Jan that's 3 whole months inclusive.
  addTarget(db, { categoryId: "trip", type: "by_date", amountCents: 300_00, byDate: "2026-03-15" });

  // Unassigned: pace = ceil(300_00 / 3) = 100_00; needed = pace − 0.
  let trip = findCat(computeBudgetPlan(db, "2026-01"), "trip")!;
  expect(trip.target).toEqual({ type: "by_date", amountCents: 300_00, byDate: "2026-03-15" });
  expect(trip.targetNeededCents).toBe(100_00);
  expect(trip.targetStatus).toBe("underfunded");

  // Assign 30_00 → available 30_00, remaining 270_00, pace ceil(270_00/3)=90_00,
  // needed = 90_00 − 30_00 = 60_00.
  assignBudget(db, { categoryId: "trip", month: "2026-01", assignedCents: 30_00 });
  trip = findCat(computeBudgetPlan(db, "2026-01"), "trip")!;
  expect(trip.targetNeededCents).toBe(60_00);
  expect(trip.targetStatus).toBe("underfunded");
});

test("no target → target null, needed 0, status none", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addGroup(db, "g1");
  addCategory(db, "food", "g1");
  const food = findCat(computeBudgetPlan(db, "2026-01"), "food")!;
  expect(food.target).toBeNull();
  expect(food.targetNeededCents).toBe(0);
  expect(food.targetStatus).toBe("none");
});

test("upcomingCents: future-this-month recurrences count, past-this-month excluded", () => {
  const db = makeDb();
  addAccount(db, "a1");
  addGroup(db, "g1");
  addCategory(db, "food", "g1");
  addCategory(db, "rent", "g1");
  // now = Aug 15 2026 (local); current month = 2026-08.
  const now = new Date(2026, 7, 15);

  addRecurrence(db, { id: "r1", accountId: "a1", categoryId: "food", amountCents: -50_00, nextDate: "2026-08-20" }); // future → counts
  addRecurrence(db, { id: "r2", accountId: "a1", categoryId: "food", amountCents: -30_00, nextDate: "2026-08-10" }); // past this month → excluded
  addRecurrence(db, { id: "r3", accountId: "a1", categoryId: "rent", amountCents: -1000_00, nextDate: "2026-08-25" }); // future → counts
  addRecurrence(db, { id: "r4", accountId: "a1", categoryId: "food", amountCents: -70_00, nextDate: "2026-09-05" }); // other month → excluded

  const aug = computeBudgetPlan(db, "2026-08", now);
  expect(findCat(aug, "food")!.upcomingCents).toBe(50_00); // abs value, r2 excluded
  expect(findCat(aug, "rent")!.upcomingCents).toBe(1000_00);

  // A non-current plan month counts every recurrence in that month regardless
  // of today's date.
  const sep = computeBudgetPlan(db, "2026-09", now);
  expect(findCat(sep, "food")!.upcomingCents).toBe(70_00);
});

test("off-budget transfers move Ready-to-Assign; on↔on transfers do not", () => {
  const db = makeDb();
  addAccount(db, "a1", { openingBalanceCents: 1_000_00 });
  addAccount(db, "a2", { openingBalanceCents: 0 });
  addAccount(db, "off", { onBudget: false, openingBalanceCents: 0 });
  addGroup(db, "g1");
  addCategory(db, "food", "g1");

  const baseline = computeBudgetPlan(db, "2026-04").readyToAssign;
  expect(baseline).toBe(1_000_00);

  // Transfer between two on-budget accounts: both legs counted in the balance,
  // net zero → RTA unchanged.
  addTxn(db, { id: "on1", accountId: "a1", amountCents: -100_00, date: "2026-04-05", transferGroupId: "x" });
  addTxn(db, { id: "on2", accountId: "a2", amountCents: 100_00, date: "2026-04-05", transferGroupId: "x" });
  expect(computeBudgetPlan(db, "2026-04").readyToAssign).toBe(baseline);

  // Transfer from on-budget → off-budget: only the on-budget leg counts →
  // on-budget balance drops → RTA drops by the transfer amount.
  addTxn(db, { id: "out1", accountId: "a1", amountCents: -200_00, date: "2026-04-06", transferGroupId: "y" });
  addTxn(db, { id: "out2", accountId: "off", amountCents: 200_00, date: "2026-04-06", transferGroupId: "y" });
  expect(computeBudgetPlan(db, "2026-04").readyToAssign).toBe(baseline - 200_00);
});
