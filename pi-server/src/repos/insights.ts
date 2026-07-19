import { and, asc, eq, getTableColumns, gte, lte, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import type { Transaction } from "../db/schema.ts";
import { accounts, payees, transactions } from "../db/schema.ts";

/// The largest outflows (most-negative amountCents) in [startDate, endDate].
/// Guards match the rest of the money math: split parents only (parentId NULL)
/// and non-archived accounts. Ordered most-negative first. Returns full
/// transaction rows so the caller can render payee/date/account/amount.
export function topSpends(
  db: Db,
  startDate: string,
  endDate: string,
  accountId?: string,
  limit = 10,
): Transaction[] {
  const conds = [
    sql`${transactions.parentId} IS NULL`,
    sql`${accounts.archived} = 0`,
    sql`${transactions.amountCents} < 0`,
    gte(transactions.date, startDate),
    lte(transactions.date, endDate),
    accountId ? eq(transactions.accountId, accountId) : undefined,
  ].filter((x): x is NonNullable<typeof x> => x !== undefined);

  return db
    .select(getTableColumns(transactions))
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conds))
    .orderBy(asc(transactions.amountCents))
    .limit(limit)
    .all();
}

export interface NewPayeeRow {
  payeeId: string;
  payeeName: string | null;
  firstDate: string; // YYYY-MM-DD — earliest txn ever for this payee
  firstAmountCents: number; // amount on that first txn
  periodTotalCents: number; // net amount within [startDate, endDate]
  txnCount: number; // txns within [startDate, endDate]
}

/// Payees first-seen within [startDate, endDate]: their earliest transaction
/// across ALL history falls inside the window. A payee that also transacted
/// before the window is excluded (its MIN(date) predates the window).
///
/// One grouped query. MIN(date) runs over all history (no date filter in the
/// WHERE); periodTotal/txnCount are windowed via CASE aggregates. We keep
/// exactly one min()/max() aggregate in the SELECT so SQLite's documented
/// "bare columns take values from the min/max row" rule makes
/// firstAmountCents the amount on the first-seen date. The window test on
/// MIN(date) is applied in JS (not HAVING) to avoid a second min() that would
/// disable that bare-column guarantee.
export function newPayees(
  db: Db,
  startDate: string,
  endDate: string,
): NewPayeeRow[] {
  const inWindow = sql`${transactions.date} >= ${startDate} AND ${transactions.date} <= ${endDate}`;

  const rows = db
    .select({
      payeeId: transactions.payeeId,
      payeeName: payees.name,
      // The sole min()/max() aggregate: enables the bare-column rule below.
      firstDate: sql<string>`MIN(${transactions.date})`,
      // Bare column → value from the MIN(date) row (SQLite special case).
      firstAmountCents: transactions.amountCents,
      periodTotalCents: sql<number>`COALESCE(SUM(CASE WHEN ${inWindow} THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      txnCount: sql<number>`COALESCE(SUM(CASE WHEN ${inWindow} THEN 1 ELSE 0 END), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(payees, eq(transactions.payeeId, payees.id))
    .where(
      sql`${accounts.archived} = 0 AND ${transactions.parentId} IS NULL AND ${transactions.payeeId} IS NOT NULL`,
    )
    .groupBy(transactions.payeeId)
    .all();

  return rows.filter(
    (r): r is NewPayeeRow =>
      r.payeeId !== null &&
      r.firstDate >= startDate &&
      r.firstDate <= endDate,
  );
}
