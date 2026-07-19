import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { accounts, transactions } from "../db/schema.ts";

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  netCents: number;
  expenseCents: number; // sum of outflows as a positive number
  incomeCents: number; // sum of inflows
  txnCount: number;
}

/// Per-day spend totals for the calendar month-grid. Aggregates `transactions`
/// grouped by date over [startDate, endDate].
///
/// Guards (mirrors computeNetWorth in repos/networth.ts):
/// - parentId IS NULL: split children mirror their parent's amount across
///   categories — counting both double-counts every split.
/// - INNER JOIN accounts WHERE archived = 0: activity on archived accounts is
///   excluded, same as net worth and the ask-tools.
///
/// Returns one row per day that has activity; the client fills empty days.
/// better-sqlite3 is synchronous — no await on .all().
export function computeCalendar(
  db: Db,
  startDate: string,
  endDate: string,
  accountId?: string,
): CalendarDay[] {
  const where = [
    gte(transactions.date, startDate),
    lte(transactions.date, endDate),
    isNull(transactions.parentId),
    eq(accounts.archived, false),
    accountId ? eq(transactions.accountId, accountId) : undefined,
  ].filter((x): x is NonNullable<typeof x> => x !== undefined);

  const incomeExpr = sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`;
  // Negative amounts summed then negated so expenseCents is a positive number.
  const expenseExpr = sql<number>`COALESCE(-SUM(CASE WHEN ${transactions.amountCents} < 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`;
  const netExpr = sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`;
  const countExpr = sql<number>`COUNT(*)`;

  return db
    .select({
      date: transactions.date,
      netCents: netExpr,
      expenseCents: expenseExpr,
      incomeCents: incomeExpr,
      txnCount: countExpr,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...where))
    .groupBy(transactions.date)
    .orderBy(transactions.date)
    .all();
}
