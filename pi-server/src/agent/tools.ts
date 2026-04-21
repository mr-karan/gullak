import { DateTime } from "luxon";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { AppConfig } from "../config.js";
import { formatAmount, type SimpleTransaction, type TransactionSource } from "../ledger/models.js";
import {
  resolveDepositAccountHint,
  resolveExpenseAccountHint,
  resolveIncomeAccountHint,
  resolvePaymentAccountHint,
  suggestDepositAccount,
  suggestExpenseAccount,
  suggestIncomeAccount,
  suggestPaymentAccount,
} from "../ledger/inference.js";
import type { LedgerSummary, LedgerService } from "../ledger/service.js";
import type { StateStore } from "../state/store.js";

export interface ToolDetails {
  action:
    | "record_expense"
    | "record_expense_batch"
    | "record_income"
    | "edit_transaction"
    | "edit_last_transaction"
    | "edit_recent_transactions"
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

const recordExpenseBatchSchema = Type.Object({
  items: Type.Array(recordExpenseSchema, { minItems: 2, maxItems: 20 }),
});

const editLastSchema = Type.Object({
  transactionId: Type.Optional(Type.String()),
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

const editRecentSchema = Type.Object({
  count: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
  transactionIds: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: 5 })),
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
type RecordExpenseBatchArgs = Static<typeof recordExpenseBatchSchema>;
type RecordIncomeArgs = Static<typeof recordIncomeSchema>;
type EditLastArgs = Static<typeof editLastSchema>;
type EditRecentArgs = Static<typeof editRecentSchema>;
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
        const transaction = await recordExpenseWithInference(context, args);

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
      label: "Record expense batch",
      name: "record_expense_batch",
      description: "Save multiple expense transactions from a single user message. Use this when the user sent multiple separate expenses.",
      parameters: recordExpenseBatchSchema,
      execute: async (_toolCallId: string, args: RecordExpenseBatchArgs) => {
        const transactions: SimpleTransaction[] = [];

        for (const item of args.items) {
          transactions.push(await recordExpenseWithInference(context, item));
        }

        return {
          content: [{ type: "text", text: `Saved ${transactions.length} expense transaction(s).` }],
          details: {
            action: "record_expense_batch",
            transactions,
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
          incomeAccount: requireResolvedAccountHint(
            "incomeAccount",
            args.incomeAccount,
            accounts,
            resolveIncomeAccountHint,
          ) ?? suggestIncomeAccount(args.payee),
          depositAccount: requireResolvedAccountHint(
            "depositAccount",
            args.depositAccount,
            accounts,
            resolveDepositAccountHint,
          ) ?? suggestDepositAccount(accounts, recentTransactions),
          currency: args.currency ?? context.config.defaultCurrency,
          note: args.note,
          source: context.source,
          sourceUser: context.sourceUser,
        });

        await context.stateStore.pushRecentTransactionId(context.threadId, transaction.id);

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
      label: "Edit transaction by id",
      name: "edit_transaction",
      description: "Edit a specific transaction by explicit transaction id.",
      parameters: editLastSchema,
      execute: async (_toolCallId: string, args: EditLastArgs) => {
        if (!args.transactionId) {
          throw new Error("transactionId is required when editing a specific transaction.");
        }

        const updated = await context.ledgerService.updateTransaction(
          args.transactionId,
          await normalizeUpdateArgs(context, args),
        );
        if (!updated) {
          throw new Error(`Transaction ${args.transactionId} was not found.`);
        }

        await rememberUpdatedTransaction(context, updated);

        return {
          content: [{ type: "text", text: `Updated ${updated.payee} (${updated.id}).` }],
          details: {
            action: "edit_transaction",
            transaction: updated,
          },
        };
      },
    },
    {
      label: "Edit last transaction",
      name: "edit_last_transaction",
      description: "Edit the most recent transaction saved in this conversation thread, or an explicit transaction id if provided.",
      parameters: editLastSchema,
      execute: async (_toolCallId: string, args: EditLastArgs) => {
        const targetTransactionId = args.transactionId
          ?? await context.stateStore.getLastTransactionId(context.threadId);
        if (!targetTransactionId) {
          throw new Error("No recent transaction found in this conversation thread.");
        }

        const updated = await context.ledgerService.updateTransaction(
          targetTransactionId,
          await normalizeUpdateArgs(context, args),
        );
        if (!updated) {
          throw new Error(`Transaction ${targetTransactionId} was not found.`);
        }

        await rememberUpdatedTransaction(context, updated);

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
      label: "Edit recent transactions",
      name: "edit_recent_transactions",
      description: "Edit multiple transactions with the same updates, using explicit ids when provided or recent thread transactions otherwise.",
      parameters: editRecentSchema,
      execute: async (_toolCallId: string, args: EditRecentArgs) => {
        const targetIds = args.transactionIds?.length
          ? [...new Set(args.transactionIds)]
          : await context.stateStore.getRecentTransactionIds(context.threadId, args.count ?? 2);
        if (targetIds.length === 0) {
          throw new Error("No recent transactions found in this conversation thread.");
        }

        const updates = await normalizeUpdateArgs(context, args);
        const transactions: SimpleTransaction[] = [];

        for (const transactionId of targetIds) {
          const updated = await context.ledgerService.updateTransaction(transactionId, updates);
          if (!updated) {
            continue;
          }

          transactions.push(updated);
          await rememberUpdatedTransaction(context, updated);
        }

        if (transactions.length === 0) {
          throw new Error("Recent transactions could not be updated.");
        }

        await context.stateStore.pushRecentTransactionId(context.threadId, transactions[0].id);

        return {
          content: [{ type: "text", text: `Updated ${transactions.length} recent transaction(s): ${transactions.map((transaction) => transaction.payee).join(", ")}.` }],
          details: {
            action: "edit_recent_transactions",
            transactions,
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

        await context.stateStore.forgetTransactionId(context.threadId, transactionId);

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

async function normalizeUpdateArgs(
  context: ToolContext,
  args: EditLastArgs | EditRecentArgs,
) {
  const accounts = await context.ledgerService.listAccounts();

  return {
    payee: args.payee,
    amount: args.amount,
    date: args.date,
    currency: args.currency,
    note: args.note,
    expenseAccount: requireResolvedAccountHint("expenseAccount", args.expenseAccount, accounts, resolveExpenseAccountHint),
    paymentAccount: requireResolvedAccountHint("paymentAccount", args.paymentAccount, accounts, resolvePaymentAccountHint),
    incomeAccount: requireResolvedAccountHint("incomeAccount", args.incomeAccount, accounts, resolveIncomeAccountHint),
    depositAccount: requireResolvedAccountHint("depositAccount", args.depositAccount, accounts, resolveDepositAccountHint),
  };
}

async function recordExpenseWithInference(
  context: ToolContext,
  args: RecordExpenseArgs,
): Promise<SimpleTransaction> {
  const accounts = await context.ledgerService.listAccounts();
  const recentTransactions = await context.ledgerService.listTransactions({ limit: 20 });
  const memory = await context.stateStore.findPayeeMemory(args.payee);
  const expenseAccount =
    requireResolvedAccountHint("expenseAccount", args.expenseAccount, accounts, resolveExpenseAccountHint)
    ?? memory?.expenseAccount
    ?? suggestExpenseAccount(args.payee, args.amount, args.note);
  const paymentAccount =
    requireResolvedAccountHint("paymentAccount", args.paymentAccount, accounts, resolvePaymentAccountHint)
    ?? memory?.paymentAccount
    ?? suggestPaymentAccount(accounts, recentTransactions, args.amount);

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
  await context.stateStore.pushRecentTransactionId(context.threadId, transaction.id);

  return transaction;
}

function requireResolvedAccountHint(
  field: string,
  hint: string | undefined,
  knownAccounts: string[],
  resolver: (hint: string | undefined, knownAccounts: string[]) => string | undefined,
): string | undefined {
  if (!hint) {
    return undefined;
  }

  const resolved = resolver(hint, knownAccounts);
  if (!resolved) {
    throw new Error(`Unknown ${field} '${hint}'. Use an existing ledger account name.`);
  }

  return resolved;
}

async function rememberUpdatedTransaction(context: ToolContext, updated: SimpleTransaction): Promise<void> {
  await context.stateStore.pushRecentTransactionId(context.threadId, updated.id);
  if (updated.expenseAccount) {
    await context.stateStore.rememberPayee(
      updated.payee,
      updated.expenseAccount,
      updated.paymentAccount,
    );
  }
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
