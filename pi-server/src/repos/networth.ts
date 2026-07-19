import { eq, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { accounts, holdings, transactions } from "../db/schema.ts";

export interface NetWorth {
  cashCents: number;
  investedCurrentCents: number;
  investedInvestedCents: number;
  investedPnlCents: number;
  totalCents: number;
  lastImportAt: number | null;
}

/// The "100% lens": liquid cash across non-archived accounts (opening balance +
/// all transaction activity) plus the current value of non-stale holdings. All
/// aggregation is integer cents. Stale holdings (absent from the latest import)
/// are excluded so a sold position doesn't inflate net worth.
export function computeNetWorth(db: Db): NetWorth {
  const opening =
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${accounts.openingBalanceCents}), 0)`,
      })
      .from(accounts)
      .where(eq(accounts.archived, false))
      .get()?.cents ?? 0;

  // Activity across non-archived accounts only (join to filter out archived).
  // parentId IS NULL: split children mirror their parent's amount across
  // categories — summing both double-counts every split (the Drift app and all
  // ask_tools use the same filter).
  const activity =
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        sql`${accounts.archived} = 0 AND ${transactions.parentId} IS NULL`,
      )
      .get()?.cents ?? 0;

  const cash = opening + activity;

  const invested =
    db
      .select({
        currentCents: sql<number>`COALESCE(SUM(${holdings.currentCents}), 0)`,
        investedCents: sql<number>`COALESCE(SUM(${holdings.investedCents}), 0)`,
        lastImportAt: sql<number | null>`MAX(${holdings.importedAt})`,
      })
      .from(holdings)
      .where(eq(holdings.stale, false))
      .get() ?? { currentCents: 0, investedCents: 0, lastImportAt: null };

  return {
    cashCents: cash,
    investedCurrentCents: invested.currentCents,
    investedInvestedCents: invested.investedCents,
    investedPnlCents: invested.currentCents - invested.investedCents,
    totalCents: cash + invested.currentCents,
    lastImportAt: invested.lastImportAt,
  };
}

/// The last `n` months as "YYYY-MM" keys, oldest → newest, ending with the
/// month containing `now`. Built from local Date parts to match how dates are
/// stored/queried elsewhere (YYYY-MM-DD in the user's local sense).
function monthKeys(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export interface NetWorthHistoryPoint {
  month: string; // YYYY-MM
  cashCents: number;
  investedCents: number;
  totalCents: number;
}

/// Net-worth history as a computed walk — no snapshot table (Actual's approach).
/// Two queries: (1) the starting cash = opening balances + all transaction
/// activity strictly BEFORE the window, then (2) this month's net cash delta
/// grouped by month over the window. We accumulate the deltas month by month;
/// months with no activity carry the prior running total forward.
///
/// Holdings carry no history, so invested value is only honest for the latest
/// month (the current non-stale portfolio). Earlier months report investedCents
/// = 0 and totalCents = cashCents — we do NOT fake a flat investment line
/// backward. The UI must label this.
export function computeNetWorthHistory(
  db: Db,
  months: number,
  now: Date = new Date(),
): NetWorthHistoryPoint[] {
  const keys = monthKeys(months, now);
  const windowStartDay = `${keys[0]}-01`; // first day of the earliest month

  const opening =
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${accounts.openingBalanceCents}), 0)`,
      })
      .from(accounts)
      .where(eq(accounts.archived, false))
      .get()?.cents ?? 0;

  // Everything before the window folds into the starting cash. Same guards as
  // computeNetWorth: non-archived accounts, split parents only (parentId NULL).
  const preWindow =
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        sql`${accounts.archived} = 0 AND ${transactions.parentId} IS NULL AND ${transactions.date} < ${windowStartDay}`,
      )
      .get()?.cents ?? 0;

  const monthlyRows = db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      delta: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      sql`${accounts.archived} = 0 AND ${transactions.parentId} IS NULL AND ${transactions.date} >= ${windowStartDay}`,
    )
    .groupBy(sql`substr(${transactions.date}, 1, 7)`)
    .all();

  const deltaByMonth = new Map(monthlyRows.map((r) => [r.month, r.delta]));

  const nw = computeNetWorth(db);
  const latestKey = keys[keys.length - 1];

  let running = opening + preWindow;
  return keys.map((month) => {
    running += deltaByMonth.get(month) ?? 0;
    const investedCents = month === latestKey ? nw.investedCurrentCents : 0;
    return {
      month,
      cashCents: running,
      investedCents,
      totalCents: running + investedCents,
    };
  });
}

export interface CashFlowPoint {
  month: string; // YYYY-MM
  incomeCents: number; // positive
  expenseCents: number; // negative (sum of outflows), matching /v1/summary
  netCents: number;
}

/// Month-by-month income / expense / net over the last `n` months. Same guards
/// as the summary route (non-archived accounts, split parents only). Months
/// with no activity are zero-filled so the series is contiguous.
export function computeCashFlow(
  db: Db,
  months: number,
  now: Date = new Date(),
): CashFlowPoint[] {
  const keys = monthKeys(months, now);
  const windowStartDay = `${keys[0]}-01`;

  const rows = db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      incomeCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      expenseCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} < 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      netCents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      sql`${accounts.archived} = 0 AND ${transactions.parentId} IS NULL AND ${transactions.date} >= ${windowStartDay}`,
    )
    .groupBy(sql`substr(${transactions.date}, 1, 7)`)
    .all();

  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => {
    const r = byMonth.get(month);
    return {
      month,
      incomeCents: r?.incomeCents ?? 0,
      expenseCents: r?.expenseCents ?? 0,
      netCents: r?.netCents ?? 0,
    };
  });
}
