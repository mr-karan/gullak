import { sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { accounts, transactions } from "../db/schema.ts";

// YNAB-style Age of Money. A FIFO cash-age metric over ON-BUDGET cash flow:
// inflows fill a queue of dated dollar-batches; each outflow consumes from the
// oldest batches first, and its "age" is the days between the outflow and the
// inflow dollars it spent (weighted average when it spans batches). Age of
// Money is the median age of the last up-to-10 fully-covered outflows, for
// stability against a single unusual spend.
//
// Guards mirror the rest of the budget math: on-budget accounts only, top-level
// rows (parentId IS NULL), no group parents, and no transfer legs (transfers
// aren't real income/spend).

const MS_PER_DAY = 86_400_000;

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Whole days from an (earlier) inflow date to an outflow date, UTC midnight. */
function daysBetween(fromDay: string, toDay: string): number {
  return (Date.parse(toDay) - Date.parse(fromDay)) / MS_PER_DAY;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

export interface AgeOfMoney {
  days: number | null;
}

/// Deterministic given the data + `now`. Future-dated rows (after today) are
/// ignored so a scheduled/misdated txn can't skew the metric. Returns null when
/// no outflow could be fully covered by prior inflows.
export function computeAgeOfMoney(db: Db, now: Date = new Date()): AgeOfMoney {
  const today = todayUtc(now);

  const rows = db
    .select({
      date: transactions.date,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .innerJoin(accounts, sql`${transactions.accountId} = ${accounts.id}`)
    .where(
      sql`${accounts.onBudget} = 1
        AND ${transactions.parentId} IS NULL
        AND ${transactions.isGroupParent} = 0
        AND ${transactions.transferGroupId} IS NULL
        AND ${transactions.amountCents} <> 0
        AND ${transactions.date} <= ${today}`,
    )
    .orderBy(transactions.date, transactions.createdAt, transactions.id)
    .all();

  // FIFO queue of inflow batches, oldest first.
  const queue: { date: string; remaining: number }[] = [];
  const coveredAges: number[] = [];

  for (const row of rows) {
    if (row.amountCents > 0) {
      queue.push({ date: row.date, remaining: row.amountCents });
      continue;
    }
    // Outflow: consume oldest inflow dollars first.
    let need = -row.amountCents;
    let weightedDays = 0;
    let consumed = 0;
    while (need > 0 && queue.length > 0) {
      const batch = queue[0]!;
      const take = Math.min(need, batch.remaining);
      weightedDays += daysBetween(batch.date, row.date) * take;
      consumed += take;
      batch.remaining -= take;
      need -= take;
      if (batch.remaining === 0) queue.shift();
    }
    // Only fully-covered outflows contribute to the metric.
    if (need === 0 && consumed > 0) {
      coveredAges.push(weightedDays / consumed);
    }
  }

  if (coveredAges.length < 1) return { days: null };
  const last = coveredAges.slice(-10);
  return { days: Math.round(median(last)) };
}
