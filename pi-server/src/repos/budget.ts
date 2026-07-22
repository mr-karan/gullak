import { and, eq, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import {
  accounts,
  budgets,
  categories,
  categoryGroups,
  categoryTargets,
  recurrences,
  transactions,
} from "../db/schema.ts";
import { newId, nowMs, recordChange, recordCommand } from "./changelog.ts";

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

export interface CategoryTargetView {
  type: "monthly" | "by_date";
  amountCents: number;
  byDate: string | null;
}

export interface BudgetCategoryPlan {
  categoryId: string;
  categoryName: string;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
  // Per-category funding TARGET (server-only config), null when none is set.
  target: CategoryTargetView | null;
  // Still-needed THIS month to stay on track toward the target (>= 0).
  targetNeededCents: number;
  targetStatus: "funded" | "underfunded" | "none";
  // Sum of scheduled recurrence outflows still upcoming in this month (>= 0).
  upcomingCents: number;
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

// Guards for the on-budget BALANCE query: like activityGuards but WITHOUT the
// transfer exclusion. Transfers move real cash between accounts, so they must
// count toward the balance (and hence Ready-to-Assign): a transfer between two
// on-budget accounts nets to zero (both legs counted), while a transfer to an
// OFF-budget account only leaves its on-budget leg here, correctly reducing the
// on-budget balance. They stay excluded from category activity — a transfer
// isn't category spend.
const balanceGuards = sql`${transactions.parentId} IS NULL AND ${transactions.isGroupParent} = 0`;

/** Today as YYYY-MM-DD from local Date parts (matches the route's currentMonth). */
function todayLocal(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/// Resolve a category's funding target into the plan view + this-month's
/// still-needed amount + status. See BudgetCategoryPlan for field meaning.
function evalTarget(
  target: typeof categoryTargets.$inferSelect | null,
  ctx: { month: string; assignedCents: number; availableCents: number },
): {
  target: CategoryTargetView | null;
  targetNeededCents: number;
  targetStatus: "funded" | "underfunded" | "none";
} {
  if (!target) {
    return { target: null, targetNeededCents: 0, targetStatus: "none" };
  }

  const view: CategoryTargetView = {
    type: target.type as "monthly" | "by_date",
    amountCents: target.amountCents,
    byDate: target.byDate ?? null,
  };

  let neededThisMonth: number;
  if (target.type === "by_date" && target.byDate) {
    // Whole calendar months from `month` to byDate, inclusive; min 1 (a
    // past-due date collapses to "fund the rest now").
    const [my, mm] = ctx.month.split("-").map(Number);
    const [ty, tm] = target.byDate.slice(0, 7).split("-").map(Number);
    const diff = ty! * 12 + tm! - (my! * 12 + mm!) + 1;
    const monthsLeft = Math.max(1, diff);
    const remainingToGoal = Math.max(
      0,
      target.amountCents - ctx.availableCents,
    );
    const pace = Math.ceil(remainingToGoal / monthsLeft);
    neededThisMonth = Math.max(0, pace - ctx.assignedCents);
  } else {
    // monthly (default): fund amountCents every month.
    neededThisMonth = Math.max(0, target.amountCents - ctx.assignedCents);
  }

  return {
    target: view,
    targetNeededCents: neededThisMonth,
    targetStatus: neededThisMonth === 0 ? "funded" : "underfunded",
  };
}

/// Compute the full envelope plan for a month. Efficient: a handful of grouped
/// queries, never N queries per category. `now` (default today) drives which
/// scheduled recurrences count as still-upcoming this month.
export function computeBudgetPlan(
  db: Db,
  month: string,
  now: Date = new Date(),
): BudgetPlan {
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
  const assignedByCat = new Map(
    assignedRows.map((r) => [r.categoryId, r.cents]),
  );

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
      .where(sql`${accounts.onBudget} = 1 AND ${balanceGuards}`)
      .get()?.cents ?? 0;
  const onBudgetBalance = openingCents + balanceActivityCents;

  // 6. Per-category funding TARGETS (server-only config).
  const targetByCat = new Map(
    db
      .select()
      .from(categoryTargets)
      .all()
      .map((t) => [t.categoryId, t]),
  );

  // 7. Scheduled recurrences still upcoming this month, summed per category.
  //    For the CURRENT month only future-dated (>= today) recurrences count;
  //    for a past/future plan month, every recurrence whose nextDate lands in
  //    that month counts. Stored as absolute value — a planned outflow.
  const today = todayLocal(now);
  const currentMonth = today.slice(0, 7);
  const upcomingFilter =
    month === currentMonth
      ? sql`substr(${recurrences.nextDate}, 1, 7) = ${month} AND ${recurrences.nextDate} >= ${today}`
      : sql`substr(${recurrences.nextDate}, 1, 7) = ${month}`;
  const upcomingByCat = new Map(
    db
      .select({
        categoryId: recurrences.categoryId,
        cents: sql<number>`COALESCE(SUM(ABS(${recurrences.amountCents})), 0)`,
      })
      .from(recurrences)
      .where(sql`${recurrences.categoryId} IS NOT NULL AND ${upcomingFilter}`)
      .groupBy(recurrences.categoryId)
      .all()
      .map((r) => [r.categoryId, r.cents]),
  );

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

    const { target, targetNeededCents, targetStatus } = evalTarget(
      targetByCat.get(row.categoryId) ?? null,
      { month, assignedCents, availableCents },
    );
    const upcomingCents = upcomingByCat.get(row.categoryId) ?? 0;

    let group = groupIndex.get(row.groupId);
    if (!group) {
      group = {
        groupId: row.groupId,
        groupName: row.groupName,
        categories: [],
      };
      groupIndex.set(row.groupId, group);
      groups.push(group);
    }
    group.categories.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      assignedCents,
      activityCents,
      availableCents,
      target,
      targetNeededCents,
      targetStatus,
      upcomingCents,
    });
  }

  // Every dollar in a budget account is either sitting in some category's
  // Available or free to assign.
  const readyToAssign = onBudgetBalance - totalAvailable;

  return { month, readyToAssign, groups };
}

/// Upsert the assigned amount (budgets.targetCents) for a (categoryId, month).
/// Finds an existing row by (categoryId, month) — not by id — so re-assigning
/// the same envelope never creates a duplicate row. Emits causal field ops
/// so the mutation syncs to the phone. Runs in one transaction.
export function assignBudget(
  db: Db,
  args: { categoryId: string; month: string; assignedCents: number },
): typeof budgets.$inferSelect {
  return recordCommand(db, (tx) => {
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
