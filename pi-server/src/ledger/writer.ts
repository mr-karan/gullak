import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Mutex } from "../mutex.js";
import { findTransactionSpan, parseLedger } from "./parser.js";
import {
  type LedgerTransaction,
  type SimpleTransaction,
  createExpenseTransaction,
  createIncomeTransaction,
  toLedger,
  toSimpleTransaction,
  transactionKind,
} from "./models.js";
import { LedgerValidator } from "./validator.js";

export interface TransactionUpdate {
  date?: string;
  payee?: string;
  note?: string;
  amount?: number;
  currency?: string;
  expenseAccount?: string;
  paymentAccount?: string;
  incomeAccount?: string;
  depositAccount?: string;
}

export class LedgerWriter {
  private readonly lock = new Mutex();

  constructor(
    private readonly ledgerPath: string,
    private readonly validator: LedgerValidator,
  ) {}

  async readContent(): Promise<string> {
    try {
      return await readFile(this.ledgerPath, "utf8");
    } catch {
      return "";
    }
  }

  async appendTransaction(transaction: LedgerTransaction): Promise<void> {
    await this.lock.runExclusive(async () => {
      const current = await this.readContent();
      if (transaction.gullakId && current.includes(`gullak:id ${transaction.gullakId}`)) {
        throw new Error(`Transaction ${transaction.gullakId} already exists`);
      }

      const next = current.trim().length > 0
        ? `${current.trimEnd()}\n\n${toLedger(transaction)}\n`
        : `${toLedger(transaction)}\n`;

      await this.writeValidated(next);
    });
  }

  async deleteTransaction(gullakId: string): Promise<boolean> {
    return this.lock.runExclusive(async () => {
      const current = await this.readContent();
      if (!current) {
        return false;
      }

      const lines = current.split("\n");
      const span = findTransactionSpan(lines, gullakId);
      if (!span) {
        return false;
      }

      const nextLines = lines.slice(0, span.start).concat(lines.slice(span.end));
      const next = cleanupEmptyLines(nextLines.join("\n"));
      await this.writeValidated(next);
      return true;
    });
  }

  async updateTransaction(
    gullakId: string,
    updates: TransactionUpdate,
  ): Promise<SimpleTransaction | undefined> {
    return this.lock.runExclusive(async () => {
      const current = await this.readContent();
      if (!current) {
        return undefined;
      }

      const lines = current.split("\n");
      const span = findTransactionSpan(lines, gullakId);
      if (!span) {
        return undefined;
      }

      const block = lines.slice(span.start, span.end).join("\n");
      const parsed = parseLedger(block);
      const target = parsed[0];
      if (!target) {
        return undefined;
      }

      const next = applySimpleUpdate(target, updates);
      next.gullakId = gullakId;

      const replacement = toLedger(next).split("\n");
      const nextLines = lines.slice(0, span.start).concat(replacement, lines.slice(span.end));
      await this.writeValidated(nextLines.join("\n"));
      return toSimpleTransaction(next);
    });
  }

  private async writeValidated(content: string): Promise<void> {
    const validation = await this.validator.validateContent(content);
    if (!validation.valid) {
      throw new Error(validation.error || "ledger validation failed");
    }

    await mkdir(dirname(this.ledgerPath), { recursive: true });
    await writeFile(this.ledgerPath, content, "utf8");
  }
}

function cleanupEmptyLines(content: string): string {
  const compact = content.replace(/\n{3,}/g, "\n\n").trim();
  return compact ? `${compact}\n` : "";
}

function applySimpleUpdate(
  target: LedgerTransaction,
  updates: TransactionUpdate,
): LedgerTransaction {
  if (target.postings.length !== 2) {
    throw new Error("Only simple two-posting transactions are editable in v1");
  }

  const kind = transactionKind(target);
  if (kind === "expense") {
    const simple = toSimpleTransaction(target);
    return {
      ...createExpenseTransaction({
        date: updates.date ?? target.date,
        payee: updates.payee ?? target.payee,
        amount: updates.amount ?? simple.amount,
        expenseAccount: updates.expenseAccount ?? simple.expenseAccount ?? target.postings[0].account,
        paymentAccount: updates.paymentAccount ?? simple.paymentAccount ?? target.postings[1].account,
        currency: updates.currency ?? simple.currency,
        note: updates.note ?? target.note,
        source: target.source,
        sourceUser: target.sourceUser,
      }),
      gullakId: target.gullakId,
      status: target.status,
      tags: { ...target.tags },
    };
  }

  if (kind === "income") {
    const simple = toSimpleTransaction(target);
    return {
      ...createIncomeTransaction({
        date: updates.date ?? target.date,
        payee: updates.payee ?? target.payee,
        amount: updates.amount ?? simple.amount,
        incomeAccount: updates.incomeAccount ?? simple.incomeAccount ?? target.postings[0].account,
        depositAccount: updates.depositAccount ?? simple.depositAccount ?? target.postings[1].account,
        currency: updates.currency ?? simple.currency,
        note: updates.note ?? target.note,
        source: target.source,
        sourceUser: target.sourceUser,
      }),
      gullakId: target.gullakId,
      status: target.status,
      tags: { ...target.tags },
    };
  }

  throw new Error("Only simple expense and income transactions are editable in v1");
}
