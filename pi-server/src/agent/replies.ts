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
        ? `Added ${details.transactions.length} expenses:\n${details.transactions.map(formatSavedTransactionBullet).join("\n")}`
        : undefined;
    case "record_income":
      return details.transaction ? formatSavedIncome(details.transaction) : undefined;
    case "edit_transaction":
      return details.transaction ? formatUpdatedTransaction(details.transaction) : undefined;
    case "edit_last_transaction":
      return details.transaction ? formatUpdatedTransaction(details.transaction) : undefined;
    case "edit_recent_transactions":
      return details.transactions?.length
        ? `Updated ${details.transactions.length} transactions:\n${details.transactions.map(formatUpdatedTransactionBullet).join("\n")}`
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
    return `Added ${savedTransactions.length} expenses:\n${savedTransactions.map(formatSavedTransactionBullet).join("\n")}`;
  }

  const formatted = details
    .map((detail) => formatReplyFromTool(detail))
    .filter(Boolean);

  return formatted.length > 0 ? formatted.join("\n\n") : undefined;
}

function formatSavedExpense(transaction: SimpleTransaction): string {
  return `Added ${formatAmount(transaction.amount)} ${transaction.currency} for ${transaction.payee}${formatOptionalNote(transaction)}.`;
}

function formatSavedIncome(transaction: SimpleTransaction): string {
  return `Added income of ${formatAmount(transaction.amount)} ${transaction.currency} from ${transaction.payee}${formatOptionalNote(transaction)}.`;
}

function formatUpdatedTransaction(transaction: SimpleTransaction): string {
  return `Updated ${transaction.payee}: ${formatTransactionSummary(transaction, { includeMethod: true })}.`;
}

function formatSavedTransactionBullet(transaction: SimpleTransaction): string {
  return `- ${transaction.payee}: ${formatTransactionSummary(transaction)}${formatBulletNote(transaction)}`;
}

function formatUpdatedTransactionBullet(transaction: SimpleTransaction): string {
  return `- ${transaction.payee}: ${formatTransactionSummary(transaction, { includeMethod: true })}${formatBulletNote(transaction)}`;
}

function formatTransactionSummary(
  transaction: SimpleTransaction,
  options: { includeMethod?: boolean } = {},
): string {
  const details = [`${formatAmount(transaction.amount)} ${transaction.currency}`];
  const method = options.includeMethod ? humanizeSettlementAccount(transaction) : undefined;
  if (method) {
    details.push(`via ${method}`);
  }

  return details.join(" ");
}

function humanizeSettlementAccount(transaction: SimpleTransaction): string | undefined {
  const account = transaction.kind === "expense"
    ? transaction.paymentAccount
    : transaction.depositAccount;
  if (!account) {
    return undefined;
  }

  const parts = account.split(":").filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  if (parts.some((part) => /^cash$/i.test(part))) {
    return "cash";
  }

  const nonStructuralParts = parts.filter((part) => !/^(assets|liabilities|bank)$/i.test(part));
  const last = nonStructuralParts.at(-1) ?? parts.at(-1)!;
  const previous = nonStructuralParts.at(-2);

  if (/^upi$/i.test(last)) {
    return previous ? `${previous} UPI` : "UPI";
  }

  if (/creditcard|card/i.test(account)) {
    return `${last} card`;
  }

  return last;
}

function formatOptionalNote(transaction: SimpleTransaction): string {
  const note = summarizeNote(transaction.note);
  return note ? ` (${note})` : "";
}

function formatBulletNote(transaction: SimpleTransaction): string {
  const note = summarizeNote(transaction.note);
  return note ? ` (${note})` : "";
}

function summarizeNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length <= 40 ? trimmed : undefined;
}
