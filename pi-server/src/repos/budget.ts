import { and, eq, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import {
  accounts,
  budgets,
  categories,
  categoryGroups,
  transactions,
} from "../db/schema.ts";
import { newId, nowMs, recordChange } from "./changelog.ts";

// YNAB envelope-budgeting plan. We reuse the existing `budgets` table with no
// schema change: `budgets.targetCents` is the ASSIGNED amount for a
// (categoryId, month); `rolloverCents` is ignored because the rollover is
// derived as a running cumulative sum of (assigned + activity).
//
// Standard activity guards (mirror /v1/summary, net-worth, calendar):
//   - accounts.onBudget = 1     (only budget accounts fund envelopes)
//   - parentId IS NULL          (split children mirror the parent → skip)
//   - isGroupParent = 0         (group parents duplicate their children → skip)
//   - transferGroupId IS NULL   (transfer legs aren't income/spend)

export interface BudgetCategoryPlan {
  categoryId: string;
  categoryName: string;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
}

export interface BudgetGroupPlan {
  groupId: string;
  groupName: string;
  categories: BudgetCategoryPlan[];
}

export interface BudgetPlan {
  month: string; // YYYY-MM
  readyToAssign: number;
  groups: BudgetGroupPlan[];
}

// Reusable SQL for the four activity guards on the `transactions` table.
const activityGuards = sql`${transactions.parentId} IS NULL AND ${transactions.isGroupParent} = 0 AND ${transactions.transferGroupId} IS NULL`;

/// Compute the full envelope plan for a month. Efficient: a handful of grouped
/// queries, never N queries per category.
export function computeBudgetPlan(db: Db, month: string): BudgetPlan {
  // 1. Assignable categories = every category in a NON-income group. Income
  //    groups aren't envelopes; their inflow lands in accounts → Ready-to-Assign.
  const catRows = db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      groupId: categoryGroups.id,
      groupName: categoryGroups.name,
      groupSort: categoryGroups.sortOrder,
      catSort: categories.sortOrder,
    })
    .from(categories)
    .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
    .where(eq(categoryGroups.isIncome, false))
    .orderBy(categoryGroups.sortOrder, categories.sortOrder)
    .all();

  // 2. THIS-month activity per category (spending is negative).
  const activityRows = db
    .select({
      categoryId: transactions.categoryId,
      cents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      sql`${accounts.onBudget} = 1 AND ${activityGuards} AND substr(${transactions.date}, 1, 7) = ${month}`,
    )
    .groupBy(transactions.categoryId)
    .all();
  const activityByCat = new Map(
    activityRows.map((r) => [r.categoryId, r.cents]),
  );

  // 3. THIS-month assigned per category = budgets.targetCents for the month.
  const assignedRows = db
    .select({ categoryId: budgets.categoryId, cents: budgets.targetCents })
    .from(budgets)
    .where(eq(budgets.month, month))
    .all();
  const assignedByCat = new Map(assignedRows.map((r) => [r.categoryId, r.cents]));

  // 4. Available THROUGH the month = cumulative Σ over months m ≤ month of
  //    (assigned + activity). This cumulative sum IS the rollover. Two grouped
  //    queries (cumulative activity, cumulative assigned), summed per category.
  const cumActivityRows = db
    .select({
      categoryId: transactions.categoryId,
      cents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      sql`${accounts.onBudget} = 1 AND ${activityGuards} AND substr(${transactions.date}, 1, 7) <= ${month}`,
    )
    .groupBy(transactions.categoryId)
    .all();
  const cumActivityByCat = new Map(
    cumActivityRows.map((r) => [r.categoryId, r.cents]),
  );

  const cumAssignedRows = db
    .select({
      categoryId: budgets.categoryId,
      cents: sql<number>`COALESCE(SUM(${budgets.targetCents}), 0)`,
    })
    .from(budgets)
    .where(sql`${budgets.month} <= ${month}`)
    .groupBy(budgets.categoryId)
    .all();
  const cumAssignedByCat = new Map(
    cumAssignedRows.map((r) => [r.categoryId, r.cents]),
  );

  // 5. On-budget account balances = Σ openingBalance + Σ guarded txns.
  const openingCents =
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${accounts.openingBalanceCents}), 0)`,
      })
      .from(accounts)
      .where(eq(accounts.onBudget, true))
      .get()?.cents ?? 0;
  const balanceActivityCents =
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(sql`${accounts.onBudget} = 1 AND ${activityGuards}`)
      .get()?.cents ?? 0;
  const onBudgetBalance = openingCents + balanceActivityCents;

  // Assemble groups in sort order, tracking the total available so we can
  // derive Ready-to-Assign.
  const groups: BudgetGroupPlan[] = [];
  const groupIndex = new Map<string, BudgetGroupPlan>();
  let totalAvailable = 0;

  for (const row of catRows) {
    const assignedCents = assignedByCat.get(row.categoryId) ?? 0;
    const activityCents = activityByCat.get(row.categoryId) ?? 0;
    const availableCents =
      (cumAssignedByCat.get(row.categoryId) ?? 0) +
      (cumActivityByCat.get(row.categoryId) ?? 0);
    totalAvailable += availableCents;

    let group = groupIndex.get(row.groupId);
    if (!group) {
      group = { groupId: row.groupId, groupName: row.groupName, categories: [] };
      groupIndex.set(row.groupId, group);
      groups.push(group);
    }
    group.categories.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      assignedCents,
      activityCents,
      availableCents,
    });
  }

  // Every dollar in a budget account is either sitting in some category's
  // Available or free to assign.
  const readyToAssign = onBudgetBalance - totalAvailable;

  return { month, readyToAssign, groups };
}

/// Upsert the assigned amount (budgets.targetCents) for a (categoryId, month).
/// Finds an existing row by (categoryId, month) — not by id — so re-assigning
/// the same envelope never creates a duplicate row. Emits a change_log upsert
/// so the mutation syncs to the phone. Runs in one transaction.
export function assignBudget(
  db: Db,
  args: { categoryId: string; month: string; assignedCents: number },
): typeof budgets.$inferSelect {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.categoryId, args.categoryId),
          eq(budgets.month, args.month),
        ),
      )
      .get();

    const row = {
      id: existing?.id ?? newId(),
      categoryId: args.categoryId,
      month: args.month,
      targetCents: args.assignedCents,
      rolloverCents: existing?.rolloverCents ?? 0,
      updatedAt: nowMs(),
    };

    if (existing) {
      tx.update(budgets).set(row).where(eq(budgets.id, existing.id)).run();
    } else {
      tx.insert(budgets).values(row).run();
    }

    recordChange(tx, {
      resource: "budgets",
      resourceId: row.id,
      op: "upsert",
      payload: row,
    });

    return row;
  });
}
