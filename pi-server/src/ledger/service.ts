import { readFile } from "node:fs/promises";

import { DateTime } from "luxon";

import type { AppConfig } from "../config.js";
import { extractAccounts, parseLedger } from "./parser.js";
import {
  type LedgerTransaction,
  type SimpleTransaction,
  type TransactionSource,
  createExpenseTransaction,
  createIncomeTransaction,
  toSimpleTransaction,
} from "./models.js";
import { type TransactionUpdate, LedgerWriter } from "./writer.js";

export interface TransactionQuery {
  limit?: number;
  startDate?: string;
  endDate?: string;
  payee?: string;
  account?: string;
}

export interface SummaryBucket {
  name: string;
  total: number;
}

export interface LedgerSummary {
  startDate?: string;
  endDate?: string;
  totalExpense: number;
  totalIncome: number;
  net: number;
  transactionCount: number;
  topAccounts: SummaryBucket[];
  topPayees: SummaryBucket[];
  transactions: SimpleTransaction[];
}

export class LedgerService {
  constructor(
    private readonly config: AppConfig,
    private readonly writer: LedgerWriter,
  ) {}

  async readTransactions(): Promise<LedgerTransaction[]> {
    const content = await this.readContent();
    return parseLedger(content);
  }

  async listAccounts(): Promise<string[]> {
    const content = await this.readContent();
    return extractAccounts(content);
  }

  async listTransactions(query: TransactionQuery = {}): Promise<SimpleTransaction[]> {
    const filtered = (await this.readTransactions())
      .filter((transaction) => matchesQuery(transaction, query))
      .map(toSimpleTransaction)
      .sort((left, right) => right.date.localeCompare(left.date));

    return typeof query.limit === "number" ? filtered.slice(0, query.limit) : filtered;
  }

  async getTransactionById(gullakId: string): Promise<SimpleTransaction | undefined> {
    const transactions = await this.listTransactions();
    return transactions.find((transaction) => transaction.id === gullakId);
  }

  async appendExpense(input: {
    date: string;
    payee: string;
    amount: number;
    expenseAccount: string;
    paymentAccount: string;
    currency: string;
    note?: string;
    source?: TransactionSource;
    sourceUser?: string;
  }): Promise<SimpleTransaction> {
    const transaction = createExpenseTransaction(input);
    await this.writer.appendTransaction(transaction);
    return toSimpleTransaction(transaction);
  }

  async appendIncome(input: {
    date: string;
    payee: string;
    amount: number;
    incomeAccount: string;
    depositAccount: string;
    currency: string;
    note?: string;
    source?: TransactionSource;
    sourceUser?: string;
  }): Promise<SimpleTransaction> {
    const transaction = createIncomeTransaction(input);
    await this.writer.appendTransaction(transaction);
    return toSimpleTransaction(transaction);
  }

  async updateTransaction(
    gullakId: string,
    updates: TransactionUpdate,
  ): Promise<SimpleTransaction | undefined> {
    return this.writer.updateTransaction(gullakId, updates);
  }

  async deleteTransaction(gullakId: string): Promise<boolean> {
    return this.writer.deleteTransaction(gullakId);
  }

  async getCommonAccounts(): Promise<{ paymentAccounts: string[]; expenseAccounts: string[] }> {
    const transactions = await this.listTransactions({ limit: 50 });
    return {
      paymentAccounts: mostCommon(
        transactions.map((transaction) => transaction.paymentAccount).filter(Boolean) as string[],
      ),
      expenseAccounts: mostCommon(
        transactions.map((transaction) => transaction.expenseAccount).filter(Boolean) as string[],
      ),
    };
  }

  async getSummary(options: {
    period?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LedgerSummary> {
    const range = resolveRange(this.config.timezone, options.period, options.startDate, options.endDate);
    const transactions = await this.listTransactions({
      startDate: range.startDate,
      endDate: range.endDate,
    });

    let totalExpense = 0;
    let totalIncome = 0;
    const accountBuckets = new Map<string, number>();
    const payeeBuckets = new Map<string, number>();

    for (const transaction of transactions) {
      if (transaction.kind === "expense") {
        totalExpense += transaction.amount;
        if (transaction.expenseAccount) {
          accountBuckets.set(
            transaction.expenseAccount,
            (accountBuckets.get(transaction.expenseAccount) ?? 0) + transaction.amount,
          );
        }
        payeeBuckets.set(transaction.payee, (payeeBuckets.get(transaction.payee) ?? 0) + transaction.amount);
      }

      if (transaction.kind === "income") {
        totalIncome += transaction.amount;
      }
    }

    return {
      startDate: range.startDate,
      endDate: range.endDate,
      totalExpense: roundMoney(totalExpense),
      totalIncome: roundMoney(totalIncome),
      net: roundMoney(totalIncome - totalExpense),
      transactionCount: transactions.length,
      topAccounts: toBuckets(accountBuckets),
      topPayees: toBuckets(payeeBuckets),
      transactions,
    };
  }

  private async readContent(): Promise<string> {
    try {
      return await readFile(this.config.ledgerPath, "utf8");
    } catch {
      return "";
    }
  }
}

function matchesQuery(transaction: LedgerTransaction, query: TransactionQuery): boolean {
  if (query.startDate && transaction.date < query.startDate) {
    return false;
  }

  if (query.endDate && transaction.date > query.endDate) {
    return false;
  }

  if (query.payee && !transaction.payee.toLowerCase().includes(query.payee.toLowerCase())) {
    return false;
  }

  if (
    query.account &&
    !transaction.postings.some((posting) => posting.account.toLowerCase().includes(query.account!.toLowerCase()))
  ) {
    return false;
  }

  return true;
}

function resolveRange(
  timezone: string,
  period?: string,
  startDate?: string,
  endDate?: string,
): { startDate?: string; endDate?: string } {
  if (startDate || endDate) {
    return { startDate, endDate };
  }

  if (!period) {
    return {};
  }

  const now = DateTime.now().setZone(timezone);
  if (period === "today") {
    return { startDate: now.toISODate() ?? undefined, endDate: now.toISODate() ?? undefined };
  }

  if (period === "this-month") {
    return {
      startDate: now.startOf("month").toISODate() ?? undefined,
      endDate: now.endOf("month").toISODate() ?? undefined,
    };
  }

  if (period === "last-month") {
    const previous = now.minus({ months: 1 });
    return {
      startDate: previous.startOf("month").toISODate() ?? undefined,
      endDate: previous.endOf("month").toISODate() ?? undefined,
    };
  }

  if (period === "this-week") {
    return {
      startDate: now.startOf("week").toISODate() ?? undefined,
      endDate: now.endOf("week").toISODate() ?? undefined,
    };
  }

  if (period === "last-week") {
    const previous = now.minus({ weeks: 1 });
    return {
      startDate: previous.startOf("week").toISODate() ?? undefined,
      endDate: previous.endOf("week").toISODate() ?? undefined,
    };
  }

  return {};
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function toBuckets(entries: Map<string, number>): SummaryBucket[] {
  return [...entries.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total: roundMoney(total) }));
}

function mostCommon(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name]) => name);
}
