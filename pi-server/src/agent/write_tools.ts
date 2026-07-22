import { eq, like, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import type { NewTransaction, Transaction } from "../db/schema.ts";
import { accounts, categories, transactions } from "../db/schema.ts";
import {
  newId,
  nowMs,
  recordChange,
  recordCommand,
} from "../repos/changelog.ts";
import { learnCategory } from "../rules/learn.ts";
import {
  deleteTransactionCore,
  patchTransaction,
  type TransactionPatch,
} from "../transactions/mutations.ts";
import type { OpenAiToolSchema } from "./ask_tools.ts";

/// WRITE tools — the agent's mutation registry, deliberately kept SEPARATE from
/// the read-only ask_tools registry. Ask tools ANSWER questions; write tools
/// CHANGE financial data and must only be called when the user's message
/// clearly asks to change/add/delete something. Every write here: integer minor
/// units, ONE db.transaction per tool call, a recordChange for every mutated
/// row so all sync clients converge, and (for destructive/edit tools) a captured
/// undo payload the UI can replay.

export type WriteToolName =
  | "categorize_transactions"
  | "edit_transaction"
  | "delete_transactions"
  | "log_transaction"
  | "restore_categories"
  | "restore_transactions";

export interface WriteToolCall {
  tool: WriteToolName;
  params?: {
    transactionIds?: string[];
    id?: string;
    categoryId?: string | null;
    categoryName?: string;
    amountCents?: number;
    payeeName?: string;
    date?: string;
    notes?: string;
    accountId?: string;
    accountName?: string;
    isIncome?: boolean;
    // Undo payloads (authored by the server, replayed by the UI — never by the
    // model).
    previous?: { id: string; categoryId: string | null }[];
    payloads?: Transaction[];
  };
}

/// Structured result of a write. `formatted` is fed back to the model loop;
/// `action` is the UI sidecar (result card + Undo); `data` is the raw
/// tool-specific result the response/tests inspect.
export interface WriteToolResult {
  formatted: string;
  action?: WriteAction;
  data: WriteToolData;
}

export interface WriteAction {
  kind: "write_result";
  tool: WriteToolName;
  summary: string;
  affectedIds: string[];
  undo?: { tool: WriteToolName; args: unknown };
}

export type WriteToolData =
  | {
      kind: "categorize";
      updated: string[];
      skippedLocked: string[];
      previous: { id: string; categoryId: string | null }[];
    }
  | {
      kind: "edit";
      id: string;
      before: Transaction | null;
      after: Transaction | null;
      error?: string;
    }
  | {
      kind: "delete";
      deleted: string[];
      skippedLocked: string[];
      payloads: Transaction[];
    }
  | { kind: "log"; id: string | null; row: Transaction | null }
  | { kind: "restore_categories"; restored: string[] }
  | { kind: "restore_transactions"; restored: string[] }
  | { kind: "error"; error: string };

const MAX_IDS = 200;

/// Model-facing write tool schemas. The undo tools (restore_*) are intentionally
/// NOT offered to the model — their args (previous categories / full row
/// payloads) are server-authored and replayed only by the UI's Undo button.
export const WRITE_TOOL_SCHEMAS: OpenAiToolSchema[] = [
  {
    name: "categorize_transactions",
    description:
      "Set the category on one or more EXISTING transactions the user pointed at (usually the selected rows). Use for 'recategorize these to Food', 'mark these as Groceries', 'move the selected ones to Rent'. Pass the transaction ids and either categoryName (preferred) or categoryId; pass categoryId=null to clear the category. Reconciled (locked) rows are skipped.",
    parameters: {
      type: "object",
      properties: {
        transactionIds: {
          type: "array",
          items: { type: "string" },
          description: "Ids of the transactions to recategorize.",
        },
        categoryName: {
          type: "string",
          description: "Target category by name, e.g. 'Food'.",
        },
        categoryId: {
          type: ["string", "null"],
          description: "Target category id, or null to clear the category.",
        },
      },
      required: ["transactionIds"],
    },
  },
  {
    name: "edit_transaction",
    description:
      "Change fields of ONE existing transaction. Use for 'change the Amazon one to 1560', 'rename this to Swiggy', 'move it to Dining', 'change the date to 2026-07-01'. Provide the transaction id and only the fields to change (amountCents as a positive magnitude — the expense/income sign is preserved; payeeName; categoryName/categoryId; date YYYY-MM-DD; notes). Refuses reconciled (locked) rows; keeps transfer legs in sync.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The transaction id to edit." },
        amountCents: {
          type: "integer",
          description: "New amount magnitude in paise (sign preserved).",
        },
        payeeName: { type: "string" },
        categoryName: { type: "string", description: "New category by name." },
        categoryId: {
          type: ["string", "null"],
          description: "New category id, or null to clear.",
        },
        date: { type: "string", description: "YYYY-MM-DD." },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_transactions",
    description:
      "Delete one or more EXISTING transactions the user pointed at. Use for 'delete the duplicate', 'remove these two', 'delete the selected ones'. Pass the transaction ids. Reconciled (locked) rows are skipped; split parents cascade their children; group parents are ungrouped; transfer legs delete both sides.",
    parameters: {
      type: "object",
      properties: {
        transactionIds: {
          type: "array",
          items: { type: "string" },
          description: "Ids of the transactions to delete.",
        },
      },
      required: ["transactionIds"],
    },
  },
  {
    name: "log_transaction",
    description:
      "Book a brand-new expense or income. Use for 'add a 450 groceries expense', 'log 2000 salary income on HDFC'. Provide amountCents (positive magnitude), isIncome (false = expense, the default), accountName or accountId, and optionally payeeName, categoryName/categoryId, date (YYYY-MM-DD, defaults today), notes.",
    parameters: {
      type: "object",
      properties: {
        amountCents: {
          type: "integer",
          description: "Amount magnitude in paise.",
        },
        isIncome: {
          type: "boolean",
          description:
            "true for income/refund/salary; false (default) for an expense.",
        },
        accountName: { type: "string" },
        accountId: { type: "string" },
        payeeName: { type: "string" },
        categoryName: { type: "string" },
        categoryId: { type: ["string", "null"] },
        date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
        notes: { type: "string" },
      },
      required: ["amountCents"],
    },
  },
];

/// Every name runWriteTool can execute — the model-facing tools PLUS the
/// server-only undo tools. Used by the agent loop to route a call to the write
/// registry.
export const WRITE_TOOL_NAMES = new Set<WriteToolName>([
  ...WRITE_TOOL_SCHEMAS.map((s) => s.name as WriteToolName),
  "restore_categories",
  "restore_transactions",
]);

export function runWriteTool(db: Db, call: WriteToolCall): WriteToolResult {
  const p = call.params ?? {};
  // A categoryName that doesn't resolve must NOT fall through to null — null is
  // the explicit "clear the category" contract (categoryId === null), and a
  // model typo ("Grocery" vs "Groceries") would otherwise silently WIPE the
  // category off every targeted row. Refuse instead so the model can correct.
  if (
    (call.tool === "categorize_transactions" ||
      call.tool === "edit_transaction") &&
    p.categoryName != null &&
    resolveCategoryId(db, p.categoryName) === null
  ) {
    return {
      formatted: `I couldn't find a category called "${p.categoryName}" — nothing was changed. Use one of the existing categories, or pass categoryId null to clear.`,
      data: { kind: "error", error: "unresolved category name" },
    };
  }
  switch (call.tool) {
    case "categorize_transactions": {
      const categoryId =
        p.categoryName != null
          ? resolveCategoryId(db, p.categoryName)
          : (p.categoryId ?? null);
      return categorizeTransactions(db, p.transactionIds ?? [], categoryId);
    }
    case "edit_transaction":
      return editTransaction(db, p);
    case "delete_transactions":
      return deleteTransactions(db, p.transactionIds ?? []);
    case "log_transaction":
      return logTransaction(db, p);
    case "restore_categories":
      return restoreCategories(db, p.previous ?? []);
    case "restore_transactions":
      return restoreTransactions(db, p.payloads ?? []);
    default:
      return {
        formatted: "I don't know how to make that change.",
        data: { kind: "error", error: "unknown write tool" },
      };
  }
}

// ── categorize ───────────────────────────────────────────────────────────────

function categorizeTransactions(
  db: Db,
  ids: string[],
  categoryId: string | null,
): WriteToolResult {
  const unique = boundedIds(ids);
  const updated: string[] = [];
  const skippedLocked: string[] = [];
  const previous: { id: string; categoryId: string | null }[] = [];
  const toLearn: {
    payeeId: string | null;
    payeeName: string | null;
    categoryId: string;
  }[] = [];

  recordCommand(db, (tx) => {
    for (const id of unique) {
      const row = tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .get();
      if (!row) continue;
      if (row.reconciled) {
        skippedLocked.push(id);
        continue;
      }
      previous.push({ id, categoryId: row.categoryId });
      const next = { ...row, categoryId, updatedAt: nowMs() };
      tx.update(transactions).set(next).where(eq(transactions.id, id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: id,
        op: "upsert",
        payload: next,
      });
      updated.push(id);
      if (categoryId) {
        toLearn.push({
          payeeId: row.payeeId,
          payeeName: row.payeeName,
          categoryId,
        });
      }
    }
  });

  // Best-effort auto-learn AFTER commit so the just-categorized rows count.
  for (const l of toLearn) learnCategory(db, l);

  const catLabel = categoryId
    ? categoryNameOf(db, categoryId)
    : "Uncategorised";
  let summary: string;
  if (updated.length > 0) {
    summary = `Recategorized ${updated.length} to ${catLabel}`;
    if (skippedLocked.length > 0) {
      summary += ` (${skippedLocked.length} locked, skipped)`;
    }
  } else if (skippedLocked.length > 0) {
    summary = `Nothing changed — ${skippedLocked.length} locked and skipped`;
  } else {
    summary = "No matching transactions to recategorize";
  }

  const action: WriteAction | undefined =
    updated.length > 0
      ? {
          kind: "write_result",
          tool: "categorize_transactions",
          summary,
          affectedIds: updated,
          undo: { tool: "restore_categories", args: { previous } },
        }
      : undefined;

  return {
    formatted: `${summary}. updated=${updated.length}, skippedLocked=${skippedLocked.length}.`,
    action,
    data: { kind: "categorize", updated, skippedLocked, previous },
  };
}

// ── edit ─────────────────────────────────────────────────────────────────────

function editTransaction(
  db: Db,
  p: NonNullable<WriteToolCall["params"]>,
): WriteToolResult {
  const id = p.id;
  if (!id) {
    return {
      formatted: "Tell me which transaction to edit (an id).",
      data: {
        kind: "edit",
        id: "",
        before: null,
        after: null,
        error: "missing id",
      },
    };
  }
  const existing = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (!existing) {
    return {
      formatted: `No transaction ${id} to edit.`,
      data: { kind: "edit", id, before: null, after: null, error: "not found" },
    };
  }

  const partial: TransactionPatch = {};
  if (p.amountCents != null) {
    // Preserve the row's expense/income sign; the model passes a magnitude.
    const sign = existing.amountCents < 0 ? -1 : 1;
    partial.amountCents = sign * Math.abs(p.amountCents);
  }
  if (p.payeeName != null) partial.payeeName = p.payeeName;
  if (p.date != null) partial.date = p.date;
  if (p.notes != null) partial.notes = p.notes;
  if (p.categoryName != null) {
    partial.categoryId = resolveCategoryId(db, p.categoryName);
  } else if (p.categoryId !== undefined) {
    partial.categoryId = p.categoryId;
  }

  const outcome = patchTransaction(db, id, partial);
  if (!outcome.ok) {
    return {
      formatted: outcome.error,
      data: {
        kind: "edit",
        id,
        before: existing,
        after: null,
        error: outcome.error,
      },
    };
  }

  const { before, transaction: after } = outcome;
  const summary = editSummary(before, after);
  return {
    formatted: summary,
    action: {
      kind: "write_result",
      tool: "edit_transaction",
      summary,
      affectedIds: [id],
      // Undo = re-apply the BEFORE values through the same tool.
      undo: {
        tool: "edit_transaction",
        args: {
          id,
          amountCents: Math.abs(before.amountCents),
          payeeName: before.payeeName,
          categoryId: before.categoryId,
          date: before.date,
          notes: before.notes,
        },
      },
    },
    data: { kind: "edit", id, before, after },
  };
}

function editSummary(before: Transaction, after: Transaction): string {
  const label = after.payeeName ?? before.payeeName ?? "transaction";
  if (before.amountCents !== after.amountCents) {
    return `Changed ${label} to ${formatMoney(Math.abs(after.amountCents))}`;
  }
  if (before.categoryId !== after.categoryId) {
    return `Recategorized ${label}`;
  }
  if (before.date !== after.date) {
    return `Moved ${label} to ${after.date}`;
  }
  return `Updated ${label}`;
}

// ── delete ───────────────────────────────────────────────────────────────────

// Deletes are capped tighter than other batch writes, and HERE (not only in the
// pi engine's beforeToolCall) so every caller shares the guard: the legacy write
// loop and the /v1/messages/action undo endpoint included.
const MAX_DELETE_IDS = 50;

function deleteTransactions(db: Db, ids: string[]): WriteToolResult {
  const unique = boundedIds(ids);
  if (unique.length > MAX_DELETE_IDS) {
    return {
      formatted: `Refusing to delete ${unique.length} transactions in one call (max ${MAX_DELETE_IDS}). Split the request, or narrow it.`,
      data: { kind: "error", error: "delete cap exceeded" },
    };
  }
  const deleted: string[] = [];
  const skippedLocked: string[] = [];
  const payloads: Transaction[] = [];

  // ONE transaction for the whole batch.
  recordCommand(db, (tx) => {
    for (const id of unique) {
      const res = deleteTransactionCore(tx, id);
      if (res.status === "deleted") {
        deleted.push(id);
        payloads.push(...res.payloads);
      } else if (res.status === "locked") {
        skippedLocked.push(id);
      }
      // not_found → silently ignored.
    }
  });

  let summary: string;
  if (deleted.length > 0) {
    summary = `Deleted ${deleted.length} transaction${deleted.length === 1 ? "" : "s"}`;
    if (skippedLocked.length > 0)
      summary += ` (${skippedLocked.length} locked, skipped)`;
  } else if (skippedLocked.length > 0) {
    summary = `Nothing deleted — ${skippedLocked.length} locked and skipped`;
  } else {
    summary = "No matching transactions to delete";
  }

  const action: WriteAction | undefined =
    deleted.length > 0
      ? {
          kind: "write_result",
          tool: "delete_transactions",
          summary,
          affectedIds: deleted,
          undo: { tool: "restore_transactions", args: { payloads } },
        }
      : undefined;

  return {
    formatted: `${summary}. deleted=${deleted.length}, skippedLocked=${skippedLocked.length}.`,
    action,
    data: { kind: "delete", deleted, skippedLocked, payloads },
  };
}

// ── log (book a new transaction) ─────────────────────────────────────────────

function logTransaction(
  db: Db,
  p: NonNullable<WriteToolCall["params"]>,
): WriteToolResult {
  const accountId = p.accountId ?? resolveAccountId(db, p.accountName);
  if (!accountId) {
    return {
      formatted: "Which account should I log this against?",
      data: { kind: "log", id: null, row: null },
    };
  }
  if (p.amountCents == null || !Number.isFinite(p.amountCents)) {
    return {
      formatted: "How much should I log?",
      data: { kind: "log", id: null, row: null },
    };
  }
  const categoryId =
    p.categoryName != null
      ? resolveCategoryId(db, p.categoryName)
      : (p.categoryId ?? null);
  const magnitude = Math.abs(p.amountCents);
  const amountCents = p.isIncome ? magnitude : -magnitude;

  const id = newId();
  const at = nowMs();
  const row: NewTransaction = {
    id,
    accountId,
    categoryId,
    payeeId: null,
    payeeName: p.payeeName ?? null,
    amountCents,
    date: p.date ?? todayIso(),
    notes: p.notes ?? null,
    latitude: null,
    longitude: null,
    locationName: null,
    cleared: false,
    reconciled: false,
    origin: "agent",
    originRef: null,
    importedId: null,
    transferAccountId: null,
    transferGroupId: null,
    parentId: null,
    splitTotalCents: null,
    groupParentId: null,
    isGroupParent: false,
    originalAmountCents: null,
    originalCurrency: null,
    createdAt: at,
    updatedAt: at,
  };

  recordCommand(db, (tx) => {
    tx.insert(transactions).values(row).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });

  if (categoryId) {
    learnCategory(db, { payeeName: row.payeeName, categoryId });
  }

  const what = row.payeeName ? ` — ${row.payeeName}` : "";
  const verb = p.isIncome ? "Logged income" : "Logged";
  const summary = `${verb} ${formatMoney(magnitude)}${what}`;
  return {
    formatted: summary,
    action: {
      kind: "write_result",
      tool: "log_transaction",
      summary,
      affectedIds: [id],
      undo: { tool: "delete_transactions", args: { transactionIds: [id] } },
    },
    data: { kind: "log", id, row: row as Transaction },
  };
}

// ── undo tools (server-authored args, replayed by the UI Undo button) ─────────

function restoreCategories(
  db: Db,
  previous: { id: string; categoryId: string | null }[],
): WriteToolResult {
  const restored: string[] = [];
  recordCommand(db, (tx) => {
    for (const prev of previous) {
      const row = tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, prev.id))
        .get();
      if (!row) continue;
      const next = {
        ...row,
        categoryId: prev.categoryId ?? null,
        updatedAt: nowMs(),
      };
      tx.update(transactions)
        .set(next)
        .where(eq(transactions.id, prev.id))
        .run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: prev.id,
        op: "upsert",
        payload: next,
      });
      restored.push(prev.id);
    }
  });
  return {
    formatted: `Restored categories on ${restored.length} transaction${restored.length === 1 ? "" : "s"}.`,
    data: { kind: "restore_categories", restored },
  };
}

function restoreTransactions(db: Db, payloads: Transaction[]): WriteToolResult {
  const restored: string[] = [];
  recordCommand(db, (tx) => {
    for (const p of payloads) {
      // Bump updatedAt so the re-created row wins LWW over the earlier delete on
      // other clients.
      const row = { ...p, updatedAt: nowMs() };
      tx.insert(transactions)
        .values(row)
        .onConflictDoUpdate({ target: transactions.id, set: row })
        .run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: p.id,
        op: "upsert",
        payload: row,
      });
      restored.push(p.id);
    }
  });
  return {
    formatted: `Restored ${restored.length} transaction${restored.length === 1 ? "" : "s"}.`,
    data: { kind: "restore_transactions", restored },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Dedupe, drop empties, cap at MAX_IDS. */
function boundedIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

function resolveCategoryId(db: Db, name: string | undefined): string | null {
  if (!name || !name.trim()) return null;
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(
      like(sql`LOWER(${categories.name})`, `%${name.trim().toLowerCase()}%`),
    )
    .limit(1)
    .get();
  return row?.id ?? null;
}

function resolveAccountId(db: Db, name: string | undefined): string | null {
  if (!name || !name.trim()) return null;
  const row = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(like(sql`LOWER(${accounts.name})`, `%${name.trim().toLowerCase()}%`))
    .limit(1)
    .get();
  return row?.id ?? null;
}

function categoryNameOf(db: Db, id: string): string {
  const row = db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  return row?.name ?? "that category";
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ₹1,560.00 — always two decimals, en-IN grouping. */
function formatMoney(minorCents: number): string {
  const abs = Math.abs(minorCents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `₹${whole.toLocaleString("en-IN")}.${String(frac).padStart(2, "0")}`;
}
