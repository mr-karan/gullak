import { sql } from "drizzle-orm";
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Mirrors the Flutter app's Drift tables. Money is stored as integer
// minor units throughout, dates as YYYY-MM-DD text, timestamps as ms
// since epoch (sqlite int).

const now = sql`(unixepoch() * 1000)`;

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("checking"),
  openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
  reconciledBalanceCents: integer("reconciled_balance_cents"),
  reconciledAt: integer("reconciled_at"),
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
  // Optional one-level parent. NULL means the category is top-level.
  parentId: text("parent_id"),
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
  // #39 opt-out: when false, the server stops auto-learning a payee→category
  // rule from this payee's history (mirrors Actual's learn_categories).
  learnCategories: integer("learn_categories", { mode: "boolean" })
    .notNull()
    .default(true),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    categoryId: text("category_id"),
    payeeId: text("payee_id"),
    payeeName: text("payee_name"),
    amountCents: integer("amount_cents").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    notes: text("notes"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    locationName: text("location_name"),
    cleared: integer("cleared", { mode: "boolean" }).notNull().default(false),
    // Reconciliation lock (#42). Set when an account reconcile confirms this
    // cleared row against the bank balance; reconciled rows are frozen
    // (PATCH/DELETE 409 unless force) and import matching skips them.
    reconciled: integer("reconciled", { mode: "boolean" })
      .notNull()
      .default(false),
    origin: text("origin").notNull().default("manual"),
    originRef: text("origin_ref"),
    // Import-dedupe key (#38). Stable per-source id: SMS stableSmsId, future
    // CSV FITID. The 3-pass matcher claims by (accountId, importedId) first.
    importedId: text("imported_id"),
    // Transfer linkage
    transferAccountId: text("transfer_account_id"),
    transferGroupId: text("transfer_group_id"),
    // Split linkage
    parentId: text("parent_id"),
    splitTotalCents: integer("split_total_cents"),
    // Grouping (#46): N independent txns collapsed under one virtual parent.
    // Distinct from splits (one txn → children). A group parent has
    // isGroupParent=1 and amountCents = sum of its children; each child points
    // back via groupParentId. Both children and parent keep their own rows.
    groupParentId: text("group_parent_id"),
    isGroupParent: integer("is_group_parent", { mode: "boolean" })
      .notNull()
      .default(false),
    // Foreign-currency metadata (display-only; amountCents stays in base currency)
    originalAmountCents: integer("original_amount_cents"),
    originalCurrency: text("original_currency"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    // /v1/summary, the agent ask-tools, and collectExpenses all filter by date
    // and/or account; index those so large histories don't table-scan.
    byDate: index("idx_tx_date").on(t.date),
    byAccountDate: index("idx_tx_account_date").on(t.accountId, t.date),
    byCategory: index("idx_tx_category").on(t.categoryId),
    // #38 dedupe: exact-match pass looks up by (account, importedId).
    byImported: index("idx_tx_imported").on(t.accountId, t.importedId),
    // #46 grouping: fetch a parent's children.
    byGroupParent: index("idx_tx_group_parent").on(t.groupParentId),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: integer("color"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    uniqName: uniqueIndex("idx_tag_name").on(t.name),
  }),
);

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id").notNull(),
    tagId: text("tag_id").notNull(),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    uniqPair: uniqueIndex("idx_transaction_tag_pair").on(
      t.transactionId,
      t.tagId,
    ),
  }),
);

// Categorization/normalization rules engine (#40). SERVER-ONLY config — like
// the M5 tables, rules never get a recordChange() row and are not in the Drift
// mirror; the webapp is their only client and the server is where they run.
// triggerPayload holds the conditions JSON (array of {field, op, value});
// actionPayload holds the actions JSON (array of {type, value}). triggerType is
// the rule kind: 'user' (hand-authored) | 'learned' (auto-learned per #39).
// stage orders execution: 'pre' (payee normalization) → 'main' (categorization)
// → 'post'. priority orders within a stage (lower runs first).
export const rules = sqliteTable("rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  stage: text("stage").notNull().default("main"), // 'pre' | 'main' | 'post'
  priority: integer("priority").notNull().default(100),
  triggerType: text("trigger_type").notNull(), // 'user' | 'learned'
  triggerPayload: text("trigger_payload").notNull(), // conditions JSON
  actionPayload: text("action_payload").notNull(), // actions JSON
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const ruleMatches = sqliteTable("rule_matches", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  transactionId: text("transaction_id"),
  matchedAt: integer("matched_at").notNull().default(now),
  outcome: text("outcome").notNull(),
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
  anchorDay: integer("anchor_day"), // day-of-month anchor for monthly/yearly
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

// WhatsApp inbox candidates queued for the phone to import. The bridge
// posts incoming messages to /v1/whatsapp/webhook; the agent parses each
// message into N expense candidates and writes them here. The Flutter app
// pulls + acks during sync and inserts each row into its local
// `sms_messages` so the existing Inbox review flow applies. This is a
// one-way delivery queue, intentionally outside causal financial sync because the
// review lifecycle (accepted/dismissed/duplicate) lives on the phone, not
// on the server.
// Delivery queue for inbound message candidates the phone can't capture
// natively: WhatsApp messages, and — on iOS, which has no SMS-read API — bank
// SMS forwarded by a Shortcuts automation to POST /v1/sms/ingest. The server
// parses them and queues a candidate here; the phone polls, imports into its
// local Inbox, and acks. (Table name is historical; `source` disambiguates.)
export const whatsappInboxCandidates = sqliteTable(
  "whatsapp_inbox_candidates",
  {
    id: text("id").primaryKey(),
    // 'whatsapp' | 'sms' — drives how the phone labels the Inbox row.
    source: text("source").notNull().default("whatsapp"),
    sourceUser: text("source_user"), // phone number / chat id / SMS sender id
    pushName: text("push_name"),
    chatId: text("chat_id"),
    messageId: text("message_id"), // WhatsApp message id; same across items
    itemIndex: integer("item_index").notNull().default(0),
    body: text("body").notNull(), // the slice of message text this candidate represents
    receivedAt: integer("received_at").notNull(),
    candidateJson: text("candidate_json").notNull(), // parsed candidate fields
    status: text("status").notNull().default("pending"), // 'pending' | 'delivered'
    deliveredAt: integer("delivered_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
);

// User-submitted diagnostics from the mobile app. These are intentionally
// append-only and outside the sync changelog: feedback is for debugging the
// parser/app, not part of the user's financial dataset.
export const feedbackEvents = sqliteTable("feedback_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // 'sms_parse_failure' | future feedback types
  message: text("message"),
  payload: text("payload").notNull(), // JSON blob from the client
  clientId: text("client_id"),
  createdAt: integer("created_at").notNull().default(now),
});

// Single-row durable state for the Apps Script sheet push. Server-only — NOT
// part of financial sync (no causal events). `cursor` is the high-water
// transactions.updatedAt that has been confirmed pushed to the sheet, so each
// run only re-sends rows changed since then (incremental). It only advances on
// a successful POST, so a failed push is retried on the next push/interval —
// nothing is dropped on restart. The error/attempt fields give visibility via
// GET /v1/sheets/status.
export const sheetsSyncState = sqliteTable("sheets_sync_state", {
  id: integer("id").primaryKey(), // always 1; single-row table
  cursor: integer("cursor").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at"),
  lastSuccessAt: integer("last_success_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(now),
});

// Per-destination export cursor + health (one row per destination: "sheets",
// "actual", …). Generalises sheets_sync_state so each destination advances its
// own high-water mark independently.
export const exportState = sqliteTable("export_state", {
  destination: text("destination").primaryKey(),
  cursor: integer("cursor").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at"),
  lastSuccessAt: integer("last_success_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(now),
});

// ── M5 money-manager tables (server-only) ────────────────────────────────
// Holdings, goals, and desires are NOT part of the phone sync changelog:
// they live on the server only and never get a recordChange() row. The web
// app is their only client. See the M5 epic.

// Per-category budget TARGETS (YNAB "targets"): a funding goal for a category —
// fund `amountCents` every month ('monthly'), or reach `amountCents` by `byDate`
// ('by_date'). Server-only config (like goals/holdings): no causal event, not
// in the Drift mirror; the web Budget view is the only client. One target per
// category, so categoryId is the primary key.
export const categoryTargets = sqliteTable("category_targets", {
  categoryId: text("category_id").primaryKey(),
  type: text("type").notNull().default("monthly"), // 'monthly' | 'by_date'
  amountCents: integer("amount_cents").notNull(),
  byDate: text("by_date"), // YYYY-MM-DD, for type='by_date'
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

// Named wealth targets ("Kids' education", "BMW", "Retire early"). Holdings
// map to a goal via holdings.goalId; progress = current value of mapped,
// non-stale holdings vs targetCents.
export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji"),
  targetCents: integer("target_cents").notNull(),
  targetDate: text("target_date"), // YYYY-MM-DD, optional
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

// Portfolio holdings imported from the Zerodha Kite/Coin console XLSX export,
// keyed by ISIN. A re-import upserts by isin; goalId (the manual mapping) is
// never touched by import. Per-unit prices are REAL (MF NAVs carry 4dp);
// aggregation happens only over the derived integer cents columns.
export const holdings = sqliteTable(
  "holdings",
  {
    id: text("id").primaryKey(),
    isin: text("isin").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name"),
    kind: text("kind").notNull(), // 'equity' | 'mutual_fund'
    sector: text("sector"),
    quantity: real("quantity").notNull(),
    avgPrice: real("avg_price").notNull(),
    lastPrice: real("last_price").notNull(),
    investedCents: integer("invested_cents").notNull(),
    currentCents: integer("current_cents").notNull(),
    goalId: text("goal_id").references(() => goals.id),
    // Set to 1 when an import omits this ISIN (sold/left the portfolio);
    // cleared when it reappears. Stale rows are excluded from goal progress,
    // net-worth, and portfolio tools.
    stale: integer("stale", { mode: "boolean" }).notNull().default(false),
    importedAt: integer("imported_at").notNull(),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    uniqIsin: uniqueIndex("uniq_holding_isin").on(t.isin),
    byGoal: index("idx_holding_goal").on(t.goalId),
  }),
);

// A shared wishlist with brakes: title, estimated cost, "why do I want this",
// photos, comments, and an honest verdict. Person is attribution, not
// identity — validated against the profile enum at the route layer.
export const desires = sqliteTable(
  "desires",
  {
    id: text("id").primaryKey(),
    person: text("person").notNull(), // 'karan' | 'wife'
    title: text("title").notNull(),
    estCostCents: integer("est_cost_cents").notNull(),
    why: text("why"),
    // 'dreaming' | 'yes' | 'nah' | 'bought'
    status: text("status").notNull().default("dreaming"),
    decidedAt: integer("decided_at"),
    boughtTransactionId: text("bought_transaction_id"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    byPerson: index("idx_desire_person").on(t.person),
    byStatus: index("idx_desire_status").on(t.status),
  }),
);

// Photo attached to a desire. Bytes live on disk under
// <dataDir>/uploads/desires/<desireId>/<id>.<ext>; only the path is stored.
export const desirePhotos = sqliteTable(
  "desire_photos",
  {
    id: text("id").primaryKey(),
    desireId: text("desire_id").notNull(),
    path: text("path").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byDesire: index("idx_desire_photo_desire").on(t.desireId),
  }),
);

// A comment from either person on a desire ("worth it?", "wait for the sale").
export const desireComments = sqliteTable(
  "desire_comments",
  {
    id: text("id").primaryKey(),
    desireId: text("desire_id").notNull(),
    person: text("person").notNull(), // 'karan' | 'wife'
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byDesire: index("idx_desire_comment_desire").on(t.desireId),
  }),
);

// ── Immutable causal CRDT persistence ─────────────────────────────────────

/** A sync epoch bounds one compatible CRDT history and its checkpoints. */
export const syncEpochs = sqliteTable(
  "sync_epochs",
  {
    id: text("id").primaryKey(),
    protocol: integer("protocol").notNull().default(2),
    schemaVersion: integer("schema_version").notNull(),
    status: text("status").notNull().default("preparing"),
    createdAt: integer("created_at").notNull().default(now),
    activatedAt: integer("activated_at"),
    retiredAt: integer("retired_at"),
  },
  (t) => ({
    byStatus: index("idx_sync_epochs_status").on(t.status),
    protocolV2: check("sync_epochs_protocol_v2", sql`${t.protocol} = 2`),
    positiveSchema: check(
      "sync_epochs_positive_schema",
      sql`${t.schemaVersion} > 0`,
    ),
  }),
);

/**
 * Immutable accepted change envelopes. `transport_cursor` is only a paging
 * order; conflict semantics come exclusively from dot/context/Lamport data in
 * the canonical envelope. `content_hash` distinguishes an exact idempotent
 * retry from illegal reuse of a change id or actor sequence with other bytes.
 */
export const syncChanges = sqliteTable(
  "sync_changes",
  {
    transportCursor: integer("transport_cursor").primaryKey({
      autoIncrement: true,
    }),
    changeId: text("change_id").notNull(),
    epoch: text("epoch").notNull(),
    actorId: text("actor_id").notNull(),
    sequence: integer("sequence").notNull(),
    lamport: integer("lamport").notNull(),
    wallTimeMs: integer("wall_time_ms").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    contextJson: text("context_json").notNull(),
    opsJson: text("ops_json").notNull(),
    envelopeJson: text("envelope_json").notNull(),
    contentHash: text("content_hash").notNull(),
    source: text("source").notNull(),
    acceptedAt: integer("accepted_at").notNull().default(now),
  },
  (t) => ({
    uniqChangeId: uniqueIndex("uniq_sync_change_id").on(t.changeId),
    uniqActorSequence: uniqueIndex("uniq_sync_actor_sequence").on(
      t.actorId,
      t.sequence,
    ),
    byEpochCursor: index("idx_sync_changes_epoch_cursor").on(
      t.epoch,
      t.transportCursor,
    ),
    byAcceptedAt: index("idx_sync_changes_accepted_at").on(t.acceptedAt),
    positiveSequence: check(
      "sync_changes_positive_sequence",
      sql`${t.sequence} > 0`,
    ),
    positiveLamport: check(
      "sync_changes_positive_lamport",
      sql`${t.lamport} > 0`,
    ),
    positiveSchema: check(
      "sync_changes_positive_schema",
      sql`${t.schemaVersion} > 0`,
    ),
    validContext: check(
      "sync_changes_valid_context_json",
      sql`json_valid(${t.contextJson})`,
    ),
    validOps: check(
      "sync_changes_valid_ops_json",
      sql`json_valid(${t.opsJson})`,
    ),
    validEnvelope: check(
      "sync_changes_valid_envelope_json",
      sql`json_valid(${t.envelopeJson})`,
    ),
  }),
);

/**
 * Causally maximal candidate antichain for one entity field. Candidate JSON is
 * canonical and losslessly retains unknown fields. `policy` selects the
 * projection rule (for example mvr, remove_wins, add_wins, or pn_counter).
 */
export const syncRegisters = sqliteTable(
  "sync_registers",
  {
    epoch: text("epoch").notNull(),
    resource: text("resource").notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    policy: text("policy").notNull(),
    candidatesJson: text("candidates_json").notNull(),
    visibleValueJson: text("visible_value_json"),
    updatedCursor: integer("updated_cursor").notNull(),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    pk: primaryKey({
      name: "pk_sync_registers",
      columns: [t.epoch, t.resource, t.entityId, t.field],
    }),
    byEntity: index("idx_sync_registers_entity").on(
      t.epoch,
      t.resource,
      t.entityId,
    ),
    byCursor: index("idx_sync_registers_cursor").on(t.epoch, t.updatedCursor),
    validCandidates: check(
      "sync_registers_valid_candidates_json",
      sql`json_valid(${t.candidatesJson})`,
    ),
    validVisibleValue: check(
      "sync_registers_valid_visible_value_json",
      sql`${t.visibleValueJson} IS NULL OR json_valid(${t.visibleValueJson})`,
    ),
  }),
);

/** Contiguous accepted sequence integrated for each actor in an epoch. */
export const syncFrontiers = sqliteTable(
  "sync_frontiers",
  {
    epoch: text("epoch").notNull(),
    actorId: text("actor_id").notNull(),
    contiguousSequence: integer("contiguous_sequence").notNull().default(0),
    integratedCursor: integer("integrated_cursor").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    pk: primaryKey({
      name: "pk_sync_frontiers",
      columns: [t.epoch, t.actorId],
    }),
    nonNegativeSequence: check(
      "sync_frontiers_nonnegative_sequence",
      sql`${t.contiguousSequence} >= 0`,
    ),
    nonNegativeCursor: check(
      "sync_frontiers_nonnegative_cursor",
      sql`${t.integratedCursor} >= 0`,
    ),
  }),
);

/** Durable allocator and Lamport clock for the server's own CRDT actor. */
export const syncLocalClocks = sqliteTable(
  "sync_local_clocks",
  {
    epoch: text("epoch").primaryKey(),
    actorId: text("actor_id").notNull(),
    nextSequence: integer("next_sequence").notNull().default(1),
    lamport: integer("lamport").notNull().default(0),
    integratedCursor: integer("integrated_cursor").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    positiveNextSequence: check(
      "sync_local_clocks_positive_next_sequence",
      sql`${t.nextSequence} > 0`,
    ),
    nonNegativeLamport: check(
      "sync_local_clocks_nonnegative_lamport",
      sql`${t.lamport} >= 0`,
    ),
    nonNegativeCursor: check(
      "sync_local_clocks_nonnegative_cursor",
      sql`${t.integratedCursor} >= 0`,
    ),
  }),
);

/** Protocol negotiation, bootstrap state, and durable client acknowledgements. */
export const syncClients = sqliteTable(
  "sync_clients",
  {
    actorId: text("actor_id").primaryKey(),
    /** SHA-256 of the 256-bit bearer credential returned once at registration. */
    actorTokenHash: text("actor_token_hash").notNull(),
    protocolVersion: integer("protocol_version").notNull(),
    epoch: text("epoch"),
    status: text("status").notNull().default("active"),
    appVersion: text("app_version"),
    platform: text("platform"),
    acknowledgedCursor: integer("acknowledged_cursor").notNull().default(0),
    acknowledgedFrontierJson: text("acknowledged_frontier_json")
      .notNull()
      .default("{}"),
    bootstrapCheckpointId: text("bootstrap_checkpoint_id"),
    lastSeenAt: integer("last_seen_at").notNull().default(now),
    activatedAt: integer("activated_at"),
    retiredAt: integer("retired_at"),
  },
  (t) => ({
    byEpochStatus: index("idx_sync_clients_epoch_status").on(t.epoch, t.status),
    byLastSeen: index("idx_sync_clients_last_seen").on(t.lastSeenAt),
    positiveProtocol: check(
      "sync_clients_positive_protocol",
      sql`${t.protocolVersion} > 0`,
    ),
    validActorTokenHash: check(
      "sync_clients_valid_actor_token_hash",
      sql`length(${t.actorTokenHash}) = 64`,
    ),
    nonNegativeCursor: check(
      "sync_clients_nonnegative_cursor",
      sql`${t.acknowledgedCursor} >= 0`,
    ),
    validFrontier: check(
      "sync_clients_valid_frontier_json",
      sql`json_valid(${t.acknowledgedFrontierJson})`,
    ),
  }),
);

/** Invalid or unsupported changes retained for diagnosis and explicit rescue. */
export const syncQuarantine = sqliteTable(
  "sync_quarantine",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    epoch: text("epoch"),
    changeId: text("change_id"),
    actorId: text("actor_id"),
    sequence: integer("sequence"),
    source: text("source").notNull(),
    reasonCode: text("reason_code").notNull(),
    reason: text("reason").notNull(),
    contentHash: text("content_hash"),
    envelopeJson: text("envelope_json"),
    originalBytes: blob("original_bytes", { mode: "buffer" }),
    receivedAt: integer("received_at").notNull().default(now),
    resolvedAt: integer("resolved_at"),
    resolution: text("resolution"),
  },
  (t) => ({
    byUnresolved: index("idx_sync_quarantine_unresolved").on(
      t.resolvedAt,
      t.receivedAt,
    ),
    byChange: index("idx_sync_quarantine_change").on(t.changeId),
    byActorSequence: index("idx_sync_quarantine_actor_sequence").on(
      t.actorId,
      t.sequence,
    ),
  }),
);

/** Verified bootstrap/compaction state: registers plus causal frontier. */
export const syncCheckpoints = sqliteTable(
  "sync_checkpoints",
  {
    id: text("id").primaryKey(),
    epoch: text("epoch").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    frontierJson: text("frontier_json").notNull(),
    registersJson: text("registers_json").notNull(),
    projectionHash: text("projection_hash").notNull(),
    contentHash: text("content_hash").notNull(),
    creationCursor: integer("creation_cursor").notNull(),
    eventCount: integer("event_count").notNull(),
    isGenesis: integer("is_genesis", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at").notNull().default(now),
    verifiedAt: integer("verified_at"),
  },
  (t) => ({
    uniqEpochCursor: uniqueIndex("uniq_sync_checkpoint_epoch_cursor").on(
      t.epoch,
      t.creationCursor,
    ),
    byEpochCreated: index("idx_sync_checkpoints_epoch_created").on(
      t.epoch,
      t.createdAt,
    ),
    positiveSchema: check(
      "sync_checkpoints_positive_schema",
      sql`${t.schemaVersion} > 0`,
    ),
    nonNegativeCursor: check(
      "sync_checkpoints_nonnegative_cursor",
      sql`${t.creationCursor} >= 0`,
    ),
    nonNegativeEventCount: check(
      "sync_checkpoints_nonnegative_event_count",
      sql`${t.eventCount} >= 0`,
    ),
    validFrontier: check(
      "sync_checkpoints_valid_frontier_json",
      sql`json_valid(${t.frontierJson})`,
    ),
    validRegisters: check(
      "sync_checkpoints_valid_registers_json",
      sql`json_valid(${t.registersJson})`,
    ),
  }),
);

// Server-side mirror of SMS bodies for the transactions the user has
// confirmed. Lets the pi-server re-run the LLM parser against the raw
// body whenever the prompt or model improves, and propagate fixes back
// to replicas through the transaction's causal operations.
//
// Stored separately from `transactions` because the SMS body is bulky,
// privacy-sensitive, and not part of the financial dataset; it's
// operational data for the parser, similar in spirit to
// `whatsapp_inbox_candidates`. Goes outside financial sync for the same
// reason — bodies are never edited on the phone.
//
// Bodies are only written for transactional SMS the user actually
// confirmed; rejected/ignored inbox rows never reach the server.
export const smsMessages = sqliteTable(
  "sms_messages",
  {
    // Same id the phone uses for its local `sms_messages` row, so an
    // upsert from the device is idempotent across retries.
    id: text("id").primaryKey(),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    receivedAt: integer("received_at").notNull(),
    // The transaction this SMS produced when the user confirmed it.
    // Nullable so re-uploads from older app builds (which may have
    // dropped the link) still land.
    linkedTransactionId: text("linked_transaction_id"),
    // Snapshot of `transactions.updated_at` at the moment the device
    // confirmed this SMS. The reprocess job refuses to overwrite a txn
    // whose updated_at has moved past this — that's how we respect the
    // user's manual edits between confirm and re-enrichment.
    baseTransactionUpdatedAt: integer("base_transaction_updated_at"),
    // The candidate the phone wrote into the txn at confirm time
    // (initial LLM parse). Useful for debugging "why did the merchant
    // change?" after a reparse.
    candidateJson: text("candidate_json"),
    // The result of the most recent server-side re-enrichment pass.
    enrichedJson: text("enriched_json"),
    // 'pending'        — uploaded, not yet re-enriched
    // 'enriched'       — reparsed, txn PATCH applied
    // 'stale_skipped'  — reparsed, but txn was edited after confirm; PATCH skipped
    // 'failed'         — LLM call or validation kept failing; left as-is
    status: text("status").notNull().default("pending"),
    enrichedAt: integer("enriched_at"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    byStatus: index("sms_messages_status_idx").on(t.status),
    byLinkedTxn: index("sms_messages_linked_txn_idx").on(t.linkedTransactionId),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type CategoryGroup = typeof categoryGroups.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Payee = typeof payees.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type TransactionTag = typeof transactionTags.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type RuleMatch = typeof ruleMatches.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Recurrence = typeof recurrences.$inferSelect;
export type SyncEpoch = typeof syncEpochs.$inferSelect;
export type SyncChange = typeof syncChanges.$inferSelect;
export type SyncRegister = typeof syncRegisters.$inferSelect;
export type SyncFrontier = typeof syncFrontiers.$inferSelect;
export type SyncLocalClock = typeof syncLocalClocks.$inferSelect;
export type SyncClient = typeof syncClients.$inferSelect;
export type SyncQuarantineEntry = typeof syncQuarantine.$inferSelect;
export type SyncCheckpoint = typeof syncCheckpoints.$inferSelect;
export type FeedbackEvent = typeof feedbackEvents.$inferSelect;
export type SheetsSyncState = typeof sheetsSyncState.$inferSelect;
export type WhatsappInboxCandidate =
  typeof whatsappInboxCandidates.$inferSelect;
export type NewWhatsappInboxCandidate =
  typeof whatsappInboxCandidates.$inferInsert;
export type SmsMessage = typeof smsMessages.$inferSelect;
export type NewSmsMessage = typeof smsMessages.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type CategoryTarget = typeof categoryTargets.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type NewHolding = typeof holdings.$inferInsert;
export type Desire = typeof desires.$inferSelect;
export type NewDesire = typeof desires.$inferInsert;
export type DesirePhoto = typeof desirePhotos.$inferSelect;
export type DesireComment = typeof desireComments.$inferSelect;
