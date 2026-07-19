import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import {
  accounts,
  budgets,
  categories,
  desires,
  goals,
  holdings,
  payees,
  transactions,
} from "../db/schema.ts";
import { computeNetWorth } from "../repos/networth.ts";

/// Pre-canned aggregate tools the assistant can invoke when the user
/// asks a question. The model picks one tool + params; the server runs
/// real SQL and feeds the result back as text. Model never authors SQL.

export type AskToolName =
  | "month_spend"
  | "category_spend"
  | "recent_transactions"
  | "budget_status"
  | "account_balances"
  | "summary"
  | "spend_by_category"
  | "top_payees"
  | "search_transactions"
  | "portfolio_summary"
  | "goal_progress"
  | "list_desires"
  | "afford_check"
  | "net_worth";

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
    query?: string;
    limit?: number;
    // M5 money-manager tool params
    goalName?: string;
    person?: string;
    status?: string;
    amountCents?: number;
    desireName?: string;
  };
}

export interface AskToolResult {
  formatted: string;
  // Echo of resolved params so the caller can use them in a friendlier
  // wrapping reply if needed. The model receives only `formatted`.
  resolved?: Record<string, unknown>;
}

/// OpenAI-compatible function schemas for the read-only ask tools, handed to
/// the model in the tool-calling loop. Descriptions steer tool selection; the
/// model fills params, we resolve names→ids and run real SQL.
export interface OpenAiToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const RANGE_PROPS = {
  month: { type: "string", description: "YYYY-MM. Use for a whole month." },
  startDate: { type: "string", description: "YYYY-MM-DD range start." },
  endDate: { type: "string", description: "YYYY-MM-DD range end." },
};

export const ASK_TOOL_SCHEMAS: OpenAiToolSchema[] = [
  {
    name: "summary",
    description:
      "Income, expense, and net for a month or date range (optionally one account). Use for 'how much did I spend this month', 'income in June', 'net this month'.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPS,
        accountName: { type: "string", description: "Account name to scope to." },
      },
    },
  },
  {
    name: "category_spend",
    description:
      "Total spent in ONE named category over a month/range. Use for 'how much on dining this month', 'groceries in June'.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPS,
        categoryName: {
          type: "string",
          description: "Category name, e.g. 'Dining', 'Groceries'.",
        },
      },
    },
  },
  {
    name: "spend_by_category",
    description:
      "Full per-category expense breakdown over a month/range. Use for 'where did my money go', 'break down my spending'.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPS,
        limit: { type: "integer", description: "Max categories (default 8)." },
      },
    },
  },
  {
    name: "top_payees",
    description:
      "Biggest merchants/payees by spend over a month/range. Use for 'top merchants this month', 'who did I pay the most'.",
    parameters: {
      type: "object",
      properties: {
        ...RANGE_PROPS,
        limit: { type: "integer", description: "Max merchants (default 5)." },
      },
    },
  },
  {
    name: "account_balances",
    description:
      "Computed balance per account. Use for 'balances', 'what's my HDFC balance', 'how much is in my accounts'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "recent_transactions",
    description:
      "Most recent transactions, optionally filtered by category or payee. Use for 'show my last 5 expenses', 'recent groceries'.",
    parameters: {
      type: "object",
      properties: {
        categoryName: { type: "string" },
        payee: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD." },
        endDate: { type: "string", description: "YYYY-MM-DD." },
        limit: { type: "integer", description: "Default 5, max 15." },
      },
    },
  },
  {
    name: "search_transactions",
    description:
      "Search transactions by free text (payee, notes, or category) and/or date range. Use for 'did my rent go out this month', 'find my swiggy charges', 'biggest expenses' (with a range).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text to match." },
        startDate: { type: "string", description: "YYYY-MM-DD." },
        endDate: { type: "string", description: "YYYY-MM-DD." },
        limit: { type: "integer", description: "Default 10, max 25." },
      },
    },
  },
  {
    name: "budget_status",
    description:
      "Budget vs actual for a month, all categories or one. Use for 'how am I doing on budget', 'budget left for food'.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM." },
        categoryName: { type: "string" },
      },
    },
  },
  {
    name: "portfolio_summary",
    description:
      "Investment holdings: invested/current value, P&L, top holdings, and equity-vs-mutual-fund split. Use for 'how's my portfolio', 'how concentrated is the portfolio', 'what are my biggest holdings'. Optional goalName to scope to holdings mapped to one goal.",
    parameters: {
      type: "object",
      properties: {
        goalName: { type: "string", description: "Scope to holdings mapped to this goal." },
        limit: { type: "integer", description: "Top holdings to list (default 5)." },
      },
    },
  },
  {
    name: "goal_progress",
    description:
      "Progress toward wealth goals: target, current value, %, and monthly amount needed to hit a dated target. Use for 'how are my goals doing', 'when do I hit the BMW target', 'which goal is furthest behind'. Optional goalName for one goal.",
    parameters: {
      type: "object",
      properties: {
        goalName: { type: "string", description: "One goal by name; omit for all goals." },
      },
    },
  },
  {
    name: "list_desires",
    description:
      "The shared wishlist (desires): title, estimated cost, status, why. Use for 'what's on our wishlist', 'what does Karan want to buy'. Filter by person ('karan'|'wife') and/or status ('dreaming'|'yes'|'nah'|'bought').",
    parameters: {
      type: "object",
      properties: {
        person: { type: "string", description: "'karan' or 'wife'." },
        status: { type: "string", description: "dreaming | yes | nah | bought." },
        limit: { type: "integer", description: "Max items (default 10)." },
      },
    },
  },
  {
    name: "afford_check",
    description:
      "Whether a purchase is affordable from recent monthly surplus. Give amountCents OR a desireName to look up its estimated cost. Returns monthly surplus (avg of the last 3 full months' income minus expense), how many months of surplus the item costs, and current liquid cash. Numbers only — do NOT tell the user whether to buy it.",
    parameters: {
      type: "object",
      properties: {
        amountCents: { type: "integer", description: "The purchase amount in paise (cents)." },
        desireName: { type: "string", description: "A wishlist item name to price instead." },
      },
    },
  },
  {
    name: "net_worth",
    description:
      "Total net worth: liquid cash (accounts) + invested (holdings current value), with P&L and import date. Use for money questions that span cash AND investments — 'what are we worth', 'net worth', 'total wealth'.",
    parameters: { type: "object", properties: {} },
  },
];

export const ASK_TOOL_NAMES = new Set<string>(ASK_TOOL_SCHEMAS.map((s) => s.name));

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
    case "summary":
      return summary(db, call.params ?? {}, symbol);
    case "spend_by_category":
      return spendByCategory(db, call.params ?? {}, symbol);
    case "top_payees":
      return topPayees(db, call.params ?? {}, symbol);
    case "search_transactions":
      return searchTransactions(db, call.params ?? {}, symbol);
    case "portfolio_summary":
      return portfolioSummary(db, call.params ?? {}, symbol);
    case "goal_progress":
      return goalProgress(db, call.params ?? {}, symbol);
    case "list_desires":
      return listDesires(db, call.params ?? {}, symbol);
    case "afford_check":
      return affordCheck(db, call.params ?? {}, symbol);
    case "net_worth":
      return netWorth(db, symbol);
    default:
      return { formatted: "I don't know how to answer that yet." };
  }
}

/// income / expense / net over a range (or account). Mirrors GET /v1/summary.
function summary(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const [start, end] = rangeFrom(params);
  const accountId = resolveAccount(db, params);
  const conditions = [
    gte(transactions.date, start),
    lte(transactions.date, end),
    sql`${transactions.parentId} IS NULL`,
    sql`${transactions.transferGroupId} IS NULL`,
  ];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  const row = db
    .select({
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} < 0 THEN -${transactions.amountCents} ELSE 0 END), 0)`,
      net: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .get() ?? { income: 0, expense: 0, net: 0 };
  const scope = accountId ? ` on ${nameOfAccount(db, accountId)}` : "";
  const netLabel =
    row.net >= 0
      ? `net +${formatMoney(row.net, symbol)}`
      : `net -${formatMoney(-row.net, symbol)}`;
  return {
    formatted: `${rangeLabelCap(start, end)}${scope}: income ${formatMoney(row.income, symbol)}, spent ${formatMoney(row.expense, symbol)}, ${netLabel}.`,
    resolved: {
      startDate: start,
      endDate: end,
      incomeCents: row.income,
      expenseCents: row.expense,
      netCents: row.net,
    },
  };
}

/// Full per-category expense breakdown over a range (top `limit`, default 8).
function spendByCategory(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const [start, end] = rangeFrom(params);
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 25);
  const rows = db
    .select({
      categoryName: categories.name,
      spent: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        sql`${transactions.amountCents} < 0`,
        sql`${transactions.parentId} IS NULL`,
        sql`${transactions.transferGroupId} IS NULL`,
      ),
    )
    .groupBy(transactions.categoryId)
    .orderBy(sql`SUM(-${transactions.amountCents}) DESC`)
    .limit(limit)
    .all()
    .filter((r) => r.spent > 0);
  if (rows.length === 0) {
    return { formatted: `Nothing spent ${rangeLabel(start, end)}.` };
  }
  const lines = rows.map(
    (r) => `  • ${r.categoryName ?? "Uncategorised"} — ${formatMoney(r.spent, symbol)}`,
  );
  return {
    formatted: `Spend by category ${rangeLabel(start, end)}:\n${lines.join("\n")}`,
    resolved: {
      startDate: start,
      endDate: end,
      categories: rows.map((r) => ({
        name: r.categoryName ?? "Uncategorised",
        spentCents: r.spent,
      })),
    },
  };
}

/// Biggest merchants (payees) by expense over a range.
function topPayees(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const [start, end] = rangeFrom(params);
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 15);
  const rows = db
    .select({
      payeeName: transactions.payeeName,
      spent: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        sql`${transactions.amountCents} < 0`,
        sql`${transactions.payeeName} IS NOT NULL`,
        sql`${transactions.parentId} IS NULL`,
        sql`${transactions.transferGroupId} IS NULL`,
      ),
    )
    .groupBy(transactions.payeeName)
    .orderBy(sql`SUM(-${transactions.amountCents}) DESC`)
    .limit(limit)
    .all()
    .filter((r) => r.spent > 0 && r.payeeName);
  if (rows.length === 0) {
    return { formatted: `No merchant spend ${rangeLabel(start, end)}.` };
  }
  const lines = rows.map(
    (r) => `  • ${r.payeeName} — ${formatMoney(r.spent, symbol)}`,
  );
  return {
    formatted: `Top merchants ${rangeLabel(start, end)}:\n${lines.join("\n")}`,
    resolved: {
      startDate: start,
      endDate: end,
      payees: rows.map((r) => ({ name: r.payeeName, spentCents: r.spent })),
    },
  };
}

/// Free-text/merchant/date search over transactions. Unlike
/// recent_transactions, `query` matches payee OR notes OR category name.
function searchTransactions(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);
  const conditions = [
    sql`${transactions.parentId} IS NULL`,
    sql`${transactions.transferGroupId} IS NULL`,
  ];
  const q = params.query?.trim() ?? params.payee?.trim();
  if (q) {
    const lower = `%${q.toLowerCase()}%`;
    conditions.push(
      sql`(LOWER(${transactions.payeeName}) LIKE ${lower} OR LOWER(${transactions.notes}) LIKE ${lower} OR LOWER(${categories.name}) LIKE ${lower})`,
    );
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
    formatted: `Matches:\n${lines.join("\n")}`,
    resolved: { limit, query: q ?? null },
  };
}

// ── M5 money-manager tools ──────────────────────────────────────────────────

/// Investment overview: totals, P&L, top holdings, equity/MF split. Non-stale
/// rows only. Optional goalName scopes to holdings mapped to that goal.
function portfolioSummary(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 15);
  const conditions = [eq(holdings.stale, false)];
  let goalLabel = "";
  if (params.goalName?.trim()) {
    const goal = db
      .select()
      .from(goals)
      .where(like(sql`LOWER(${goals.name})`, `%${params.goalName.trim().toLowerCase()}%`))
      .limit(1)
      .get();
    if (!goal) {
      return { formatted: `No goal matching "${params.goalName}".` };
    }
    conditions.push(eq(holdings.goalId, goal.id));
    goalLabel = ` for ${goal.name}`;
  }

  const totals = db
    .select({
      investedCents: sql<number>`COALESCE(SUM(${holdings.investedCents}), 0)`,
      currentCents: sql<number>`COALESCE(SUM(${holdings.currentCents}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(holdings)
    .where(and(...conditions))
    .get() ?? { investedCents: 0, currentCents: 0, count: 0 };

  if (totals.count === 0) {
    return { formatted: `No holdings${goalLabel} yet — import a Kite/Coin export first.` };
  }

  const split = db
    .select({
      kind: holdings.kind,
      currentCents: sql<number>`COALESCE(SUM(${holdings.currentCents}), 0)`,
    })
    .from(holdings)
    .where(and(...conditions))
    .groupBy(holdings.kind)
    .all();
  const equityCents = split.find((s) => s.kind === "equity")?.currentCents ?? 0;
  const mfCents = split.find((s) => s.kind === "mutual_fund")?.currentCents ?? 0;

  const top = db
    .select({
      symbol: holdings.symbol,
      name: holdings.name,
      currentCents: holdings.currentCents,
    })
    .from(holdings)
    .where(and(...conditions))
    .orderBy(sql`${holdings.currentCents} DESC`)
    .limit(limit)
    .all();

  const pnl = totals.currentCents - totals.investedCents;
  const pnlPct =
    totals.investedCents > 0
      ? Math.round((pnl / totals.investedCents) * 1000) / 10
      : 0;
  const pnlSign = pnl >= 0 ? "+" : "-";
  const lines = top.map(
    (h) => `  • ${h.name ?? h.symbol} — ${formatMoney(h.currentCents, symbol)}`,
  );
  const formatted = [
    `Portfolio${goalLabel}: ${formatMoney(totals.currentCents, symbol)} current (invested ${formatMoney(totals.investedCents, symbol)}, P&L ${pnlSign}${formatMoney(Math.abs(pnl), symbol)} / ${pnlSign}${Math.abs(pnlPct)}%).`,
    `Split: equity ${formatMoney(equityCents, symbol)}, mutual funds ${formatMoney(mfCents, symbol)}.`,
    `Top holdings:`,
    ...lines,
  ].join("\n");
  return {
    formatted,
    resolved: {
      investedCents: totals.investedCents,
      currentCents: totals.currentCents,
      pnlCents: pnl,
      equityCents,
      mfCents,
    },
  };
}

/// Per-goal progress: target, current, %, and monthly-needed for dated goals.
function goalProgress(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const conditions = [eq(goals.archived, false)];
  if (params.goalName?.trim()) {
    conditions.push(
      like(sql`LOWER(${goals.name})`, `%${params.goalName.trim().toLowerCase()}%`),
    );
  }
  const goalRows = db
    .select()
    .from(goals)
    .where(and(...conditions))
    .orderBy(goals.sortOrder, goals.createdAt)
    .all();
  if (goalRows.length === 0) {
    return { formatted: "No goals set yet." };
  }

  const lines = goalRows.map((g) => {
    const cur =
      db
        .select({
          cents: sql<number>`COALESCE(SUM(${holdings.currentCents}), 0)`,
        })
        .from(holdings)
        .where(and(eq(holdings.goalId, g.id), eq(holdings.stale, false)))
        .get()?.cents ?? 0;
    const pct = g.targetCents > 0 ? Math.round((cur / g.targetCents) * 100) : 0;
    const emoji = g.emoji ? `${g.emoji} ` : "";
    let tail = "";
    const remaining = g.targetCents - cur;
    if (g.targetDate && remaining > 0) {
      const months = monthsUntil(g.targetDate);
      if (months !== null && months > 0) {
        tail = ` — needs ${formatMoney(Math.round(remaining / months), symbol)}/mo to reach it by ${g.targetDate}`;
      } else if (months !== null) {
        tail = ` — target date ${g.targetDate} has passed`;
      }
    } else if (remaining <= 0) {
      tail = " — on track (target reached)";
    }
    return `  • ${emoji}${g.name} — ${formatMoney(cur, symbol)} of ${formatMoney(g.targetCents, symbol)} (${pct}%)${tail}`;
  });
  return { formatted: `Goals:\n${lines.join("\n")}` };
}

/// The shared wishlist, filtered by person/status.
function listDesires(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);
  const conditions = [];
  if (params.person?.trim()) {
    conditions.push(eq(desires.person, params.person.trim().toLowerCase()));
  }
  if (params.status?.trim()) {
    conditions.push(eq(desires.status, params.status.trim().toLowerCase()));
  }
  const rows = db
    .select()
    .from(desires)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(desires.createdAt))
    .limit(limit)
    .all();
  if (rows.length === 0) {
    return { formatted: "Nothing on the wishlist matches that." };
  }
  const lines = rows.map((d) => {
    const why = d.why ? ` — "${d.why.slice(0, 60)}${d.why.length > 60 ? "…" : ""}"` : "";
    return `  • ${d.title} (${formatMoney(d.estCostCents, symbol)}, ${d.status})${why}`;
  });
  return { formatted: `Wishlist:\n${lines.join("\n")}` };
}

/// Surplus math for a purchase. surplus = avg of the last 3 FULL calendar
/// months' (income − expense). Reports months-of-surplus + liquid cash. States
/// numbers plainly; the humans decide — no verdicts here.
function affordCheck(
  db: Db,
  params: NonNullable<AskToolCall["params"]>,
  symbol: string,
): AskToolResult {
  let amountCents = typeof params.amountCents === "number" ? Math.abs(params.amountCents) : undefined;
  let itemLabel = "that";
  if (amountCents === undefined && params.desireName?.trim()) {
    const desire = db
      .select()
      .from(desires)
      .where(like(sql`LOWER(${desires.title})`, `%${params.desireName.trim().toLowerCase()}%`))
      .limit(1)
      .get();
    if (!desire) {
      return { formatted: `I couldn't find "${params.desireName}" on the wishlist.` };
    }
    amountCents = desire.estCostCents;
    itemLabel = desire.title;
  }
  if (amountCents === undefined) {
    return { formatted: "Tell me an amount or a wishlist item to check." };
  }

  const [start, end] = lastFullMonths(3);
  const net =
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.date, start),
          lte(transactions.date, end),
          sql`${transactions.parentId} IS NULL`,
          sql`${transactions.transferGroupId} IS NULL`,
        ),
      )
      .get()?.cents ?? 0;
  const surplusPerMonth = Math.round(net / 3);
  const nw = computeNetWorth(db);

  const parts = [
    `${itemLabel === "that" ? "That" : itemLabel} costs ${formatMoney(amountCents, symbol)}.`,
  ];
  if (surplusPerMonth > 0) {
    const months = Math.round((amountCents / surplusPerMonth) * 10) / 10;
    parts.push(
      `Average monthly surplus over the last 3 full months is ${formatMoney(surplusPerMonth, symbol)} — that's ${months} month${months === 1 ? "" : "s"} of surplus.`,
    );
  } else {
    parts.push(
      `Average monthly surplus over the last 3 full months is ${surplusPerMonth < 0 ? "-" : ""}${formatMoney(Math.abs(surplusPerMonth), symbol)} (spending met or exceeded income).`,
    );
  }
  parts.push(`Liquid cash right now is ${formatMoney(nw.cashCents, symbol)}.`);
  return {
    formatted: parts.join(" "),
    resolved: {
      amountCents,
      surplusPerMonthCents: surplusPerMonth,
      cashCents: nw.cashCents,
    },
  };
}

/// Net worth = liquid cash + invested (current). The 100% lens.
function netWorth(db: Db, symbol: string): AskToolResult {
  const nw = computeNetWorth(db);
  const pnlSign = nw.investedPnlCents >= 0 ? "+" : "-";
  const importLine =
    nw.lastImportAt !== null
      ? ` (holdings as of the ${new Date(nw.lastImportAt).toISOString().slice(0, 10)} import)`
      : "";
  return {
    formatted:
      `Net worth ${formatMoney(nw.totalCents, symbol)}: ${formatMoney(nw.cashCents, symbol)} liquid cash + ${formatMoney(nw.investedCurrentCents, symbol)} invested` +
      `${nw.investedInvestedCents > 0 ? ` (P&L ${pnlSign}${formatMoney(Math.abs(nw.investedPnlCents), symbol)})` : ""}${importLine}.`,
    resolved: {
      cashCents: nw.cashCents,
      investedCurrentCents: nw.investedCurrentCents,
      totalCents: nw.totalCents,
    },
  };
}

/// Whole-month window covering the last `n` FULL calendar months (excludes the
/// current, in-progress month). Returns [startYmd, endYmd].
function lastFullMonths(n: number): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based current month
  const start = new Date(y, m - n, 1);
  const end = new Date(y, m, 0); // last day of previous month
  return [ymd(start), ymd(end)];
}

/// Whole months from today until a YYYY-MM-DD target (rounded up by calendar
/// month). null if the target isn't a valid date.
function monthsUntil(targetDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const [ty, tm] = targetDate.split("-").map((s) => Number.parseInt(s, 10));
  const now = new Date();
  return (ty! - now.getFullYear()) * 12 + (tm! - (now.getMonth() + 1));
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeLabelCap(start: string, end: string): string {
  const label = rangeLabel(start, end);
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  // Format the absolute value and prepend the sign: Math.floor on a negative
  // total rounds AWAY from zero (-10050/100 → -101), printing ₹-101.50 for
  // what is actually -₹100.50.
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const formatted = whole.toLocaleString("en-IN");
  const sign = minor < 0 ? "-" : "";
  return `${sign}${symbol}${formatted}.${String(frac).padStart(2, "0")}`;
}

function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isYmonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
}
