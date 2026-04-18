import { randomUUID } from "node:crypto";

export type TransactionStatus = "" | "*" | "!";
export type TransactionSource = "http" | "whatsapp" | "api" | "job";
export type TransactionKind = "expense" | "income" | "other";

const UNSAFE_CHARS = /[\n\r\x00-\x08\x0b\x0c\x0e-\x1f]/g;

export interface Posting {
  account: string;
  amount: number;
  currency: string;
}

export interface LedgerTransaction {
  date: string;
  payee: string;
  postings: Posting[];
  status: TransactionStatus;
  note?: string;
  tags: Record<string, string>;
  gullakId: string;
  source?: TransactionSource;
  sourceUser?: string;
}

export interface SimpleTransaction {
  id: string;
  date: string;
  payee: string;
  amount: number;
  currency: string;
  kind: TransactionKind;
  expenseAccount?: string;
  paymentAccount?: string;
  incomeAccount?: string;
  depositAccount?: string;
  note?: string;
  source?: TransactionSource;
  sourceUser?: string;
}

export interface ExpenseInput {
  date: string;
  payee: string;
  amount: number;
  expenseAccount: string;
  paymentAccount: string;
  currency: string;
  note?: string;
  source?: TransactionSource;
  sourceUser?: string;
}

export interface IncomeInput {
  date: string;
  payee: string;
  amount: number;
  incomeAccount: string;
  depositAccount: string;
  currency: string;
  note?: string;
  source?: TransactionSource;
  sourceUser?: string;
}

export function sanitizeLedgerText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(UNSAFE_CHARS, " ").trim() || undefined;
}

export function normalizeAmount(value: number): number {
  return Number(value.toFixed(2));
}

export function createTransactionId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 8);
}

export function createExpenseTransaction(input: ExpenseInput): LedgerTransaction {
  const amount = normalizeAmount(input.amount);
  return {
    date: input.date,
    payee: input.payee,
    status: "",
    note: sanitizeLedgerText(input.note),
    tags: {},
    gullakId: createTransactionId(),
    source: input.source,
    sourceUser: sanitizeLedgerText(input.sourceUser),
    postings: [
      {
        account: input.expenseAccount,
        amount,
        currency: input.currency,
      },
      {
        account: input.paymentAccount,
        amount: normalizeAmount(-amount),
        currency: input.currency,
      },
    ],
  };
}

export function createIncomeTransaction(input: IncomeInput): LedgerTransaction {
  const amount = normalizeAmount(input.amount);
  return {
    date: input.date,
    payee: input.payee,
    status: "",
    note: sanitizeLedgerText(input.note),
    tags: {},
    gullakId: createTransactionId(),
    source: input.source,
    sourceUser: sanitizeLedgerText(input.sourceUser),
    postings: [
      {
        account: input.incomeAccount,
        amount: normalizeAmount(-amount),
        currency: input.currency,
      },
      {
        account: input.depositAccount,
        amount,
        currency: input.currency,
      },
    ],
  };
}

export function formatAmount(value: number): string {
  return normalizeAmount(value).toFixed(2);
}

export function toLedger(transaction: LedgerTransaction): string {
  const safePayee = sanitizeLedgerText(transaction.payee) ?? "Unknown";
  const status = transaction.status ? ` ${transaction.status}` : "";
  const lines = [`${transaction.date.replaceAll("-", "/")}${status} ${safePayee}`];

  lines.push(`    ; gullak:id ${transaction.gullakId}`);

  if (transaction.source) {
    lines.push(`    ; gullak:source ${transaction.source}`);
  }

  if (transaction.sourceUser) {
    lines.push(`    ; gullak:user ${transaction.sourceUser}`);
  }

  if (transaction.note) {
    lines.push(`    ; ${transaction.note}`);
  }

  for (const [key, value] of Object.entries(transaction.tags)) {
    const safeKey = sanitizeLedgerText(key);
    const safeValue = sanitizeLedgerText(value);
    if (safeKey && safeValue) {
      lines.push(`    ; ${safeKey}: ${safeValue}`);
    }
  }

  for (const posting of transaction.postings) {
    const safeAccount = sanitizeLedgerText(posting.account) ?? "Expenses:Other";
    const safeCurrency = sanitizeLedgerText(posting.currency) ?? "INR";
    lines.push(`    ${safeAccount}  ${formatAmount(posting.amount)} ${safeCurrency}`);
  }

  return lines.join("\n");
}

export function transactionAmount(transaction: LedgerTransaction): number {
  return normalizeAmount(
    transaction.postings
      .filter((posting) => posting.amount > 0)
      .reduce((sum, posting) => sum + posting.amount, 0),
  );
}

export function transactionKind(transaction: LedgerTransaction): TransactionKind {
  const positive = transaction.postings.find((posting) => posting.amount > 0);
  const negative = transaction.postings.find((posting) => posting.amount < 0);

  if (positive?.account.startsWith("Expenses:")) {
    return "expense";
  }

  if (negative?.account.startsWith("Income:")) {
    return "income";
  }

  return "other";
}

export function toSimpleTransaction(transaction: LedgerTransaction): SimpleTransaction {
  const kind = transactionKind(transaction);
  const positive = transaction.postings.find((posting) => posting.amount > 0);
  const negative = transaction.postings.find((posting) => posting.amount < 0);

  return {
    id: transaction.gullakId,
    date: transaction.date,
    payee: transaction.payee,
    amount: transactionAmount(transaction),
    currency: positive?.currency ?? negative?.currency ?? "INR",
    kind,
    expenseAccount: kind === "expense" ? positive?.account : undefined,
    paymentAccount: kind === "expense" ? negative?.account : undefined,
    incomeAccount: kind === "income" ? negative?.account : undefined,
    depositAccount: kind === "income" ? positive?.account : undefined,
    note: transaction.note,
    source: transaction.source,
    sourceUser: transaction.sourceUser,
  };
}
