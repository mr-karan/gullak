import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Mirrors the Flutter app's Drift tables. Money is stored as integer
// minor units throughout, dates as YYYY-MM-DD text, timestamps as ms
// since epoch (sqlite int).

const now = sql`(unixepoch() * 1000)`;

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("checking"),
  openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
  onBudget: integer("on_budget", { mode: "boolean" }).notNull().default(true),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const categoryGroups = sqliteTable("category_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isIncome: integer("is_income", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  groupId: text("group_id").notNull(),
  color: integer("color"),
  icon: text("icon"),
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const payees = sqliteTable("payees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  useCount: integer("use_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  categoryId: text("category_id"),
  payeeId: text("payee_id"),
  payeeName: text("payee_name"),
  amountCents: integer("amount_cents").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  notes: text("notes"),
  cleared: integer("cleared", { mode: "boolean" }).notNull().default(false),
  origin: text("origin").notNull().default("manual"),
  originRef: text("origin_ref"),
  // Transfer linkage
  transferAccountId: text("transfer_account_id"),
  transferGroupId: text("transfer_group_id"),
  // Split linkage
  parentId: text("parent_id"),
  splitTotalCents: integer("split_total_cents"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull(),
  month: text("month").notNull(), // YYYY-MM
  targetCents: integer("target_cents").notNull(),
  rolloverCents: integer("rollover_cents").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const recurrences = sqliteTable("recurrences", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  categoryId: text("category_id"),
  payeeId: text("payee_id"),
  payeeName: text("payee_name"),
  amountCents: integer("amount_cents").notNull(),
  notes: text("notes"),
  cadence: text("cadence").notNull(), // 'monthly' | 'weekly' | 'daily' | 'yearly'
  nextDate: text("next_date").notNull(), // YYYY-MM-DD
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const appKv = sqliteTable("app_kv", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// Agent conversation history. One row per turn; the agent reads the
// last N rows for a threadId so the LLM has context for follow-ups
// like "Yes do that" or "no, the HDFC one".
export const agentTurns = sqliteTable("agent_turns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  // Set on assistant turns when the model dispatched a structured
  // action; lets the agent see "I just recorded txn X" if the next
  // turn says "delete that one".
  transactionId: text("transaction_id"),
  at: integer("at").notNull().default(now),
});

// Append-only mutation log for sync clients. Each row is a single
// row-level upsert/delete from any client. Clients pull rows after a
// cursor (id) and apply LWW per-row by updatedAt.
//
// `clientChangeId` is a UUID assigned by the originating client at the
// moment the mutation was logged locally; combined with `clientId` it
// gives us a per-row idempotency key so retried push batches don't
// duplicate. Server-side mutations leave it null.
//
// NB: cursor-via-id assumes a single Bun writer. Multi-process workers
// would need a "safely-committed cursor" abstraction.
export const changeLog = sqliteTable(
  "change_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: integer("at").notNull().default(now),
    clientId: text("client_id"),
    clientChangeId: text("client_change_id"),
    resource: text("resource").notNull(), // 'accounts' | 'categories' | …
    resourceId: text("resource_id").notNull(),
    op: text("op").notNull(), // 'upsert' | 'delete'
    payload: text("payload"), // JSON snapshot at the time of change
  },
  (t) => ({
    // Partial unique index: dedupes retried client pushes without
    // affecting server-originated rows where both columns are null.
    uniqClientChange: uniqueIndex("uniq_client_change")
      .on(t.clientId, t.clientChangeId)
      .where(sql`${t.clientId} IS NOT NULL AND ${t.clientChangeId} IS NOT NULL`),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type CategoryGroup = typeof categoryGroups.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Payee = typeof payees.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type Recurrence = typeof recurrences.$inferSelect;
export type ChangeLogEntry = typeof changeLog.$inferSelect;
