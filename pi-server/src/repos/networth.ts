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
