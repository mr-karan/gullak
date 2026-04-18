import { DateTime } from "luxon";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { AppConfig } from "../config.js";
import { formatAmount, type SimpleTransaction, type TransactionSource } from "../ledger/models.js";
import { suggestDepositAccount, suggestExpenseAccount, suggestIncomeAccount, suggestPaymentAccount } from "../ledger/inference.js";
import type { LedgerSummary, LedgerService } from "../ledger/service.js";
import type { StateStore } from "../state/store.js";

export interface ToolDetails {
  action:
    | "record_expense"
    | "record_income"
    | "edit_last_transaction"
    | "delete_transaction"
    | "list_recent_transactions"
    | "get_accounts"
    | "get_summary";
  transaction?: SimpleTransaction;
  deletedId?: string;
  transactions?: SimpleTransaction[];
  accounts?: string[];
  summary?: LedgerSummary;
}

interface ToolContext {
  config: AppConfig;
  ledgerService: LedgerService;
  stateStore: StateStore;
  threadId: string;
  source: TransactionSource;
  sourceUser?: string;
}

const recordExpenseSchema = Type.Object({
  payee: Type.String({ minLength: 1 }),
  amount: Type.Number({ exclusiveMinimum: 0 }),
  expenseAccount: Type.Optional(Type.String()),
  paymentAccount: Type.Optional(Type.String()),
  date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
  currency: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
});

const recordIncomeSchema = Type.Object({
  payee: Type.String({ minLength: 1 }),
  amount: Type.Number({ exclusiveMinimum: 0 }),
  incomeAccount: Type.Optional(Type.String()),
  depositAccount: Type.Optional(Type.String()),
  date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
  currency: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
});

const editLastSchema = Type.Object({
  payee: Type.Optional(Type.String()),
  amount: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  expenseAccount: Type.Optional(Type.String()),
  paymentAccount: Type.Optional(Type.String()),
  incomeAccount: Type.Optional(Type.String()),
  depositAccount: Type.Optional(Type.String()),
  date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
  currency: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
});

const deleteTransactionSchema = Type.Object({
  transactionId: Type.Optional(Type.String()),
});

const listRecentSchema = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  payee: Type.Optional(Type.String()),
  account: Type.Optional(Type.String()),
  startDate: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
  endDate: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
});

const getAccountsSchema = Type.Object({
  prefix: Type.Optional(Type.String()),
});

const getSummarySchema = Type.Object({
  period: Type.Optional(Type.String({ description: "today, this-week, last-week, this-month, last-month" })),
  startDate: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
  endDate: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
});

type RecordExpenseArgs = Static<typeof recordExpenseSchema>;
type RecordIncomeArgs = Static<typeof recordIncomeSchema>;
type EditLastArgs = Static<typeof editLastSchema>;
type DeleteArgs = Static<typeof deleteTransactionSchema>;
type ListRecentArgs = Static<typeof listRecentSchema>;
type GetAccountsArgs = Static<typeof getAccountsSchema>;
type GetSummaryArgs = Static<typeof getSummarySchema>;

export function createTools(context: ToolContext): AgentTool<any, ToolDetails>[] {
  return [
    {
      label: "Record expense",
      name: "record_expense",
      description: "Save an expense into the ledger, inferring accounts when possible.",
      parameters: recordExpenseSchema,
      execute: async (_toolCallId: string, args: RecordExpenseArgs) => {
        const accounts = await context.ledgerService.listAccounts();
        const recentTransactions = await context.ledgerService.listTransactions({ limit: 20 });
        const memory = await context.stateStore.findPayeeMemory(args.payee);
        const expenseAccount =
          args.expenseAccount ?? memory?.expenseAccount ?? suggestExpenseAccount(args.payee, args.amount);
        const paymentAccount =
          args.paymentAccount ??
          memory?.paymentAccount ??
          suggestPaymentAccount(accounts, recentTransactions, args.amount);

        const transaction = await context.ledgerService.appendExpense({
          date: resolveDate(args.date, context.config.timezone),
          payee: args.payee,
          amount: args.amount,
          expenseAccount,
          paymentAccount,
          currency: args.currency ?? context.config.defaultCurrency,
          note: args.note,
          source: context.source,
          sourceUser: context.sourceUser,
        });

        await context.stateStore.rememberPayee(args.payee, expenseAccount, paymentAccount);
        await context.stateStore.setLastTransactionId(context.threadId, transaction.id);

        return {
          content: [
            {
              type: "text",
              text: `Saved ${formatAmount(transaction.amount)} ${transaction.currency} for ${transaction.payee}.`,
            },
          ],
          details: {
            action: "record_expense",
            transaction,
          },
        };
      },
    },
    {
      label: "Record income",
      name: "record_income",
      description: "Save an income transaction into the ledger.",
      parameters: recordIncomeSchema,
      execute: async (_toolCallId: string, args: RecordIncomeArgs) => {
        const accounts = await context.ledgerService.listAccounts();
        const recentTransactions = await context.ledgerService.listTransactions({ limit: 20 });
        const transaction = await context.ledgerService.appendIncome({
          date: resolveDate(args.date, context.config.timezone),
          payee: args.payee,
          amount: args.amount,
          incomeAccount: args.incomeAccount ?? suggestIncomeAccount(args.payee),
          depositAccount: args.depositAccount ?? suggestDepositAccount(accounts, recentTransactions),
          currency: args.currency ?? context.config.defaultCurrency,
          note: args.note,
          source: context.source,
          sourceUser: context.sourceUser,
        });

        await context.stateStore.setLastTransactionId(context.threadId, transaction.id);

        return {
          content: [
            {
              type: "text",
              text: `Saved income of ${formatAmount(transaction.amount)} ${transaction.currency} from ${transaction.payee}.`,
            },
          ],
          details: {
            action: "record_income",
            transaction,
          },
        };
      },
    },
    {
      label: "Edit last transaction",
      name: "edit_last_transaction",
      description: "Edit the most recent transaction saved in this conversation thread.",
      parameters: editLastSchema,
      execute: async (_toolCallId: string, args: EditLastArgs) => {
        const lastTransactionId = await context.stateStore.getLastTransactionId(context.threadId);
        if (!lastTransactionId) {
          throw new Error("No recent transaction found in this conversation thread.");
        }

        const updated = await context.ledgerService.updateTransaction(lastTransactionId, args);
        if (!updated) {
          throw new Error(`Transaction ${lastTransactionId} was not found.`);
        }

        await context.stateStore.setLastTransactionId(context.threadId, updated.id);
        if (updated.expenseAccount) {
          await context.stateStore.rememberPayee(
            updated.payee,
            updated.expenseAccount,
            updated.paymentAccount,
          );
        }

        return {
          content: [{ type: "text", text: `Updated ${updated.payee} (${updated.id}).` }],
          details: {
            action: "edit_last_transaction",
            transaction: updated,
          },
        };
      },
    },
    {
      label: "Delete transaction",
      name: "delete_transaction",
      description: "Delete a transaction by explicit id or the last transaction in the current thread.",
      parameters: deleteTransactionSchema,
      execute: async (_toolCallId: string, args: DeleteArgs) => {
        const transactionId =
          args.transactionId ?? (await context.stateStore.getLastTransactionId(context.threadId));
        if (!transactionId) {
          throw new Error("No transaction id is available to delete.");
        }

        const deleted = await context.ledgerService.deleteTransaction(transactionId);
        if (!deleted) {
          throw new Error(`Transaction ${transactionId} was not found.`);
        }

        await context.stateStore.setLastTransactionId(context.threadId, undefined);

        return {
          content: [{ type: "text", text: `Deleted transaction ${transactionId}.` }],
          details: {
            action: "delete_transaction",
            deletedId: transactionId,
          },
        };
      },
    },
    {
      label: "List recent transactions",
      name: "list_recent_transactions",
      description: "List recent transactions for reference or corrections.",
      parameters: listRecentSchema,
      execute: async (_toolCallId: string, args: ListRecentArgs) => {
        const transactions = await context.ledgerService.listTransactions({
          limit: args.limit ?? 10,
          payee: args.payee,
          account: args.account,
          startDate: args.startDate,
          endDate: args.endDate,
        });

        return {
          content: [
            {
              type: "text",
              text: transactions.length > 0 ? formatTransactions(transactions) : "No matching transactions found.",
            },
          ],
          details: {
            action: "list_recent_transactions",
            transactions,
          },
        };
      },
    },
    {
      label: "Get accounts",
      name: "get_accounts",
      description: "List accounts from the ledger, optionally filtered by prefix.",
      parameters: getAccountsSchema,
      execute: async (_toolCallId: string, args: GetAccountsArgs) => {
        const accounts = await context.ledgerService.listAccounts();
        const filtered = args.prefix
          ? accounts.filter((account) => account.toLowerCase().startsWith(args.prefix!.toLowerCase()))
          : accounts;

        return {
          content: [{ type: "text", text: filtered.join("\n") || "No accounts found." }],
          details: {
            action: "get_accounts",
            accounts: filtered,
          },
        };
      },
    },
    {
      label: "Get summary",
      name: "get_summary",
      description: "Get a spending summary for a named period or explicit date range.",
      parameters: getSummarySchema,
      execute: async (_toolCallId: string, args: GetSummaryArgs) => {
        const summary = await context.ledgerService.getSummary({
          period: args.period,
          startDate: args.startDate,
          endDate: args.endDate,
        });

        return {
          content: [{ type: "text", text: formatSummary(summary) }],
          details: {
            action: "get_summary",
            summary,
          },
        };
      },
    },
  ];
}

function resolveDate(input: string | undefined, timezone: string): string {
  if (input) {
    const parsed = DateTime.fromISO(input, { zone: timezone });
    if (parsed.isValid) {
      return parsed.toISODate() ?? input;
    }
  }

  return DateTime.now().setZone(timezone).toISODate() ?? DateTime.now().toISODate() ?? "1970-01-01";
}

function formatTransactions(transactions: SimpleTransaction[]): string {
  return transactions
    .map(
      (transaction) =>
        `${transaction.date} ${transaction.id} ${transaction.payee} ${formatAmount(transaction.amount)} ${transaction.currency}`,
    )
    .join("\n");
}

function formatSummary(summary: LedgerSummary): string {
  const accountLines = summary.topAccounts
    .map((entry) => `- ${entry.name}: ${formatAmount(entry.total)}`)
    .join("\n");
  const payeeLines = summary.topPayees
    .map((entry) => `- ${entry.name}: ${formatAmount(entry.total)}`)
    .join("\n");

  return [
    `Expense: ${formatAmount(summary.totalExpense)}`,
    `Income: ${formatAmount(summary.totalIncome)}`,
    `Net: ${formatAmount(summary.net)}`,
    accountLines ? `Top accounts:\n${accountLines}` : undefined,
    payeeLines ? `Top payees:\n${payeeLines}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}
