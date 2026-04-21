import { formatAmount, type SimpleTransaction } from "../ledger/models.js";
import type { ToolDetails } from "./tools.js";

export function formatReplyFromTool(details: ToolDetails | undefined): string | undefined {
  if (!details) {
    return undefined;
  }

  switch (details.action) {
    case "record_expense":
      return details.transaction ? formatSavedExpense(details.transaction) : undefined;
    case "record_expense_batch":
      return details.transactions?.length
        ? `Got it. Saved these ${details.transactions.length} expenses:\n${details.transactions.map(formatTransactionBullet).join("\n")}`
        : undefined;
    case "record_income":
      return details.transaction ? formatSavedIncome(details.transaction) : undefined;
    case "edit_transaction":
      return details.transaction ? `Done. Updated it.\n${formatTransactionBody(details.transaction)}` : undefined;
    case "edit_last_transaction":
      return details.transaction ? `Done. Updated it.\n${formatTransactionBody(details.transaction)}` : undefined;
    case "edit_recent_transactions":
      return details.transactions?.length
        ? `Done. Updated these ${details.transactions.length} transactions:\n${details.transactions.map(formatTransactionBullet).join("\n")}`
        : undefined;
    case "delete_transaction":
      return details.deletedId ? `Done. Deleted transaction ${details.deletedId}.` : undefined;
    default:
      return undefined;
  }
}

export function formatReplyFromTurn(details: ToolDetails[]): string | undefined {
  if (details.length === 0) {
    return undefined;
  }

  if (details.length === 1) {
    return formatReplyFromTool(details[0]);
  }

  const savedTransactions = details.flatMap((detail) => {
    if (detail.action === "record_expense" || detail.action === "record_income" || detail.action === "edit_transaction" || detail.action === "edit_last_transaction") {
      return detail.transaction ? [detail.transaction] : [];
    }

    if (detail.action === "record_expense_batch" || detail.action === "edit_recent_transactions") {
      return detail.transactions ?? [];
    }

    return [];
  });

  if (savedTransactions.length > 1 && details.every((detail) => detail.action === "record_expense" || detail.action === "record_expense_batch")) {
    return `Got it. Saved these ${savedTransactions.length} expenses:\n${savedTransactions.map(formatTransactionBullet).join("\n")}`;
  }

  const formatted = details
    .map((detail) => formatReplyFromTool(detail))
    .filter(Boolean);

  return formatted.length > 0 ? formatted.join("\n\n") : undefined;
}

function formatSavedExpense(transaction: SimpleTransaction): string {
  return `Got it. Saved ${formatAmount(transaction.amount)} ${transaction.currency} for ${transaction.payee}.\n${formatTransactionBody(transaction)}`;
}

function formatSavedIncome(transaction: SimpleTransaction): string {
  return `Got it. Saved income of ${formatAmount(transaction.amount)} ${transaction.currency} from ${transaction.payee}.\n${formatTransactionBody(transaction)}`;
}

function formatTransactionBullet(transaction: SimpleTransaction): string {
  return `- ${transaction.payee}, ${formatTransactionBody(transaction, false)}`;
}

function formatTransactionBody(transaction: SimpleTransaction, multiline = true): string {
  const details: string[] = [];

  if (transaction.kind === "expense") {
    details.push(withLabel("Category", transaction.expenseAccount ?? "Expenses:Other", multiline));
    details.push(withLabel("Paid via", transaction.paymentAccount ?? "Unknown", multiline));
  }

  if (transaction.kind === "income") {
    details.push(withLabel("Income head", transaction.incomeAccount ?? "Income:Other", multiline));
    details.push(withLabel("Received in", transaction.depositAccount ?? "Unknown", multiline));
  }

  details.push(withLabel("Date", transaction.date, multiline));

  if (transaction.note) {
    details.push(withLabel("Note", transaction.note, multiline));
  }

  details.push(withLabel("Ref", transaction.id, multiline));

  return multiline ? details.join("\n") : details.join(" · ");
}

function withLabel(label: string, value: string, multiline: boolean): string {
  return multiline ? `${label}: ${value}` : `${label}: ${value}`;
}
