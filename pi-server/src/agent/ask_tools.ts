import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import {
  accounts,
  budgets,
  categories,
  payees,
  transactions,
} from "../db/schema.ts";

/// Pre-canned aggregate tools the assistant can invoke when the user
/// asks a question. The model picks one tool + params; the server runs
/// real SQL and feeds the result back as text. Model never authors SQL.

export type AskToolName =
  | "month_spend"
  | "category_spend"
  | "recent_transactions"
  | "budget_status"
  | "account_balances";

export interface AskToolCall {
  tool: AskToolName;
  params?: {
    month?: string; // YYYY-MM
    startDate?: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD
    accountId?: string;
    accountName?: string;
    categoryId?: string;
    categoryName?: string;
    payee?: string;
    limit?: number;
  };
}

export interface AskToolResult {
  formatted: string;
  // Echo of resolved params so the caller can use them in a friendlier
  // wrapping reply if needed. The model receives only `formatted`.
  resolved?: Record<string, unknown>;
}

export function runAskTool(
  db: Db,
  call: AskToolCall,
  symbol = "₹",
): AskToolResult {
  switch (call.tool) {
    case "month_spend":
      return monthSpend(db, call.params ?? {}, symbol);
    case "category_spend":
      return categorySpend(db, call.params ?? {}, symbol);
    case "recent_transactions":
      return recentTransactions(db, call.params ?? {}, symbol);
    case "budget_status":
      return budgetStatus(db, call.params ?? {}, symbol);
    case "account_balances":
      return accountBalances(db, symbol);
    default:
      return { formatted: "I don't know how to answer that yet." };
  }
}

function monthSpend(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const month = isYmonth(params.month) ? params.month! : currentMonth();
  const [start, end] = monthBounds(month);
  const accountId = resolveAccount(db, params);
  const conditions = [
    gte(transactions.date, start),
    lte(transactions.date, end),
    sql`${transactions.parentId} IS NULL`,
    sql`${transactions.transferGroupId} IS NULL`,
  ];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  const rows = db
    .select({
      spent: sql<number>`
        COALESCE(SUM(CASE WHEN ${transactions.amountCents} < 0
                          THEN -${transactions.amountCents} ELSE 0 END), 0)
      `,
      income: sql<number>`
        COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0
                          THEN ${transactions.amountCents} ELSE 0 END), 0)
      `,
    })
    .from(transactions)
    .where(and(...conditions))
    .all();
  const spent = rows[0]?.spent ?? 0;
  const income = rows[0]?.income ?? 0;
  const monthLabel = monthName(month);
  const scope = accountId ? ` on ${nameOfAccount(db, accountId)}` : "";
  return {
    formatted: `Spent ${formatMoney(spent, symbol)}${scope} in ${monthLabel}. Income ${formatMoney(income, symbol)}.`,
    resolved: { month, accountId },
  };
}

function categorySpend(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const [start, end] = rangeFrom(params);
  const categoryId = resolveCategory(db, params);
  const conditions = [
    gte(transactions.date, start),
    lte(transactions.date, end),
    sql`${transactions.amountCents} < 0`,
    sql`${transactions.parentId} IS NULL`,
    sql`${transactions.transferGroupId} IS NULL`,
  ];
  if (categoryId) conditions.push(eq(transactions.categoryId, categoryId));
  const sumRow = db
    .select({
      spent: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .all();
  const spent = sumRow[0]?.spent ?? 0;
  const count = sumRow[0]?.count ?? 0;
  if (!categoryId) {
    // Without a specific category, return the top breakdown so the user
    // can see the shape of spend across categories for the range.
    const breakdown = db
      .select({
        categoryName: categories.name,
        spent: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .groupBy(transactions.categoryId)
      .orderBy(sql`spent DESC`)
      .limit(5)
      .all();
    const top = breakdown
      .filter((r) => r.spent > 0)
      .map(
        (r) =>
          `  • ${r.categoryName ?? "Uncategorised"} — ${formatMoney(r.spent, symbol)}`,
      )
      .join("\n");
    return {
      formatted: top
        ? `Spent ${formatMoney(spent, symbol)} across ${count} transactions ${rangeLabel(start, end)}.\nTop categories:\n${top}`
        : `Nothing spent ${rangeLabel(start, end)}.`,
      resolved: { startDate: start, endDate: end },
    };
  }
  const catName = nameOfCategory(db, categoryId);
  return {
    formatted: count > 0
      ? `Spent ${formatMoney(spent, symbol)} on ${catName} across ${count} transactions ${rangeLabel(start, end)}.`
      : `Nothing spent on ${catName} ${rangeLabel(start, end)}.`,
    resolved: { startDate: start, endDate: end, categoryId },
  };
}

function recentTransactions(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 15);
  const categoryId = resolveCategory(db, params);
  const conditions = [
    sql`${transactions.parentId} IS NULL`,
    sql`${transactions.transferGroupId} IS NULL`,
  ];
  if (categoryId) conditions.push(eq(transactions.categoryId, categoryId));
  if (params.payee && params.payee.trim()) {
    const lower = `%${params.payee.trim().toLowerCase()}%`;
    conditions.push(sql`LOWER(${transactions.payeeName}) LIKE ${lower}`);
  }
  if (params.startDate) conditions.push(gte(transactions.date, params.startDate));
  if (params.endDate) conditions.push(lte(transactions.date, params.endDate));

  const rows = db
    .select({
      amountCents: transactions.amountCents,
      date: transactions.date,
      payeeName: transactions.payeeName,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit)
    .all();
  if (rows.length === 0) {
    return { formatted: "No matching transactions." };
  }
  const lines = rows.map((r) => {
    const sign = r.amountCents < 0 ? "-" : "+";
    const amount = formatMoney(Math.abs(r.amountCents), symbol);
    const label = r.payeeName ?? r.categoryName ?? "Uncategorised";
    return `  • ${r.date} ${sign}${amount} — ${label}`;
  });
  return {
    formatted: `Recent transactions:\n${lines.join("\n")}`,
    resolved: { limit, categoryId },
  };
}

function budgetStatus(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const month = isYmonth(params.month) ? params.month! : currentMonth();
  const [start, end] = monthBounds(month);
  const categoryId = resolveCategory(db, params);
  const conditions = [eq(budgets.month, month)];
  if (categoryId) conditions.push(eq(budgets.categoryId, categoryId));
  const targetRows = db
    .select({
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      targetCents: budgets.targetCents,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(...conditions))
    .all();
  if (targetRows.length === 0) {
    return {
      formatted: categoryId
        ? `No budget set for ${nameOfCategory(db, categoryId)} in ${monthName(month)}.`
        : `No budgets set for ${monthName(month)} yet.`,
    };
  }
  const spendByCat = new Map<string, number>();
  for (const r of targetRows) {
    const sumRow = db
      .select({
        spent: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.categoryId, r.categoryId),
          gte(transactions.date, start),
          lte(transactions.date, end),
          sql`${transactions.amountCents} < 0`,
          sql`${transactions.parentId} IS NULL`,
          sql`${transactions.transferGroupId} IS NULL`,
        ),
      )
      .all();
    spendByCat.set(r.categoryId, sumRow[0]?.spent ?? 0);
  }
  if (categoryId) {
    const r = targetRows[0]!;
    const spent = spendByCat.get(r.categoryId) ?? 0;
    const left = r.targetCents - spent;
    const pct = r.targetCents > 0 ? Math.round((spent / r.targetCents) * 100) : 0;
    const verdict =
      left >= 0
        ? `${formatMoney(left, symbol)} left (${pct}% used)`
        : `over by ${formatMoney(-left, symbol)} (${pct}% used)`;
    return {
      formatted: `${r.categoryName} budget for ${monthName(month)}: ${formatMoney(r.targetCents, symbol)} target. Spent ${formatMoney(spent, symbol)} — ${verdict}.`,
    };
  }
  const lines = targetRows.map((r) => {
    const spent = spendByCat.get(r.categoryId) ?? 0;
    const left = r.targetCents - spent;
    const pct =
      r.targetCents > 0 ? Math.round((spent / r.targetCents) * 100) : 0;
    const tail = left >= 0 ? `${formatMoney(left, symbol)} left` : `over by ${formatMoney(-left, symbol)}`;
    return `  • ${r.categoryName ?? "Uncategorised"} — ${formatMoney(spent, symbol)} / ${formatMoney(r.targetCents, symbol)} (${pct}%, ${tail})`;
  });
  return {
    formatted: `Budgets for ${monthName(month)}:\n${lines.join("\n")}`,
  };
}

function accountBalances(db: Db, symbol: string): AskToolResult {
  const rows = db
    .select({
      id: accounts.id,
      name: accounts.name,
      openingBalanceCents: accounts.openingBalanceCents,
    })
    .from(accounts)
    .where(eq(accounts.archived, false))
    .all();
  if (rows.length === 0) {
    return { formatted: "No accounts yet." };
  }
  const lines: string[] = [];
  for (const acc of rows) {
    const sumRow = db
      .select({
        sum: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .where(eq(transactions.accountId, acc.id))
      .all();
    const balance = (acc.openingBalanceCents ?? 0) + (sumRow[0]?.sum ?? 0);
    const sign = balance < 0 ? "-" : "";
    lines.push(`  • ${acc.name} — ${sign}${formatMoney(Math.abs(balance), symbol)}`);
  }
  return { formatted: `Account balances:\n${lines.join("\n")}` };
}

function resolveAccount(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
): string | null {
  if (params.accountId) return params.accountId;
  if (params.accountName) {
    const hint = `%${params.accountName.trim().toLowerCase()}%`;
    const row = db
      .select()
      .from(accounts)
      .where(like(sql`LOWER(${accounts.name})`, hint))
      .limit(1)
      .get();
    return row?.id ?? null;
  }
  return null;
}

function resolveCategory(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
): string | null {
  if (params.categoryId) return params.categoryId;
  if (params.categoryName) {
    const hint = `%${params.categoryName.trim().toLowerCase()}%`;
    const row = db
      .select()
      .from(categories)
      .where(like(sql`LOWER(${categories.name})`, hint))
      .limit(1)
      .get();
    return row?.id ?? null;
  }
  return null;
}

function nameOfAccount(db: Db, id: string): string {
  return db.select().from(accounts).where(eq(accounts.id, id)).get()?.name ?? "(unknown account)";
}

function nameOfCategory(db: Db, id: string): string {
  return db.select().from(categories).where(eq(categories.id, id)).get()?.name ?? "(uncategorised)";
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(ym: string): [string, string] {
  const [yStr, mStr] = ym.split("-");
  const y = Number.parseInt(yStr!, 10);
  const m = Number.parseInt(mStr!, 10);
  const lastDay = new Date(y, m, 0).getDate();
  return [
    `${y}-${String(m).padStart(2, "0")}-01`,
    `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  ];
}

function rangeFrom(
  params: NonNullable<AskToolCall["params"]>,
): [string, string] {
  if (isYmd(params.startDate) && isYmd(params.endDate)) {
    return [params.startDate!, params.endDate!];
  }
  return monthBounds(isYmonth(params.month) ? params.month! : currentMonth());
}

function rangeLabel(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `in ${monthName(start.slice(0, 7))}`;
  }
  return `between ${start} and ${end}`;
}

function monthName(ym: string): string {
  const [yStr, mStr] = ym.split("-");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[Number.parseInt(mStr!, 10) - 1]} ${yStr}`;
}

function formatMoney(minor: number, symbol: string): string {
  const whole = Math.floor(minor / 100);
  const frac = Math.abs(minor % 100);
  const formatted = whole.toLocaleString("en-IN");
  return `${symbol}${formatted}.${String(frac).padStart(2, "0")}`;
}

function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isYmonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
}
