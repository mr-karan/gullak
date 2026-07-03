import 'package:drift/drift.dart';

/// Asset / liability accounts.
///
/// Types map to UX (icons, default categorisation hints) and to the
/// budgeting model: `kind = 'tracking'` means off-budget (investments,
/// loans). All other kinds are on-budget.
@DataClassName('AccountRow')
class Accounts extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get kind => text().withDefault(const Constant('checking'))();
  // Opening balance lets us seed an account without inventing a
  // synthetic transaction. Stored in minor units, signed.
  IntColumn get openingBalanceCents =>
      integer().withDefault(const Constant(0))();
  IntColumn get reconciledBalanceCents => integer().nullable()();
  IntColumn get reconciledAt => integer().nullable()();
  BoolColumn get onBudget => boolean().withDefault(const Constant(true))();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('CategoryGroupRow')
class CategoryGroups extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  BoolColumn get isIncome => boolean().withDefault(const Constant(false))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('CategoryRow')
class Categories extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get groupId => text()();
  // Optional parent category id. One level only — a category whose
  // parentId is set is a "subcategory"; its parent must itself be a
  // top-level category (parentId IS NULL). Enforced at the repo layer.
  TextColumn get parentId => text().nullable()();
  // Color is an ARGB int; nullable so the UI can derive one.
  IntColumn get color => integer().nullable()();
  TextColumn get icon => text().nullable()();
  BoolColumn get hidden => boolean().withDefault(const Constant(false))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('PayeeRow')
class Payees extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  IntColumn get useCount => integer().withDefault(const Constant(0))();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Transactions, including transfers and split children.
///
/// - A normal expense/income has [transferAccountId] = null and
///   [parentId] = null.
/// - A transfer is two rows: one in each account, with the same
///   [transferGroupId] and `transferAccountId` pointing at the other
///   account. The amount on the source side is negative; on the
///   destination side, positive.
/// - A split parent has [splitTotalCents] = sum of children's
///   amounts; the parent itself has `categoryId = null` and is the
///   "header" row that lists shows. Children have [parentId] set.
@DataClassName('TransactionRow')
class Transactions extends Table {
  TextColumn get id => text()();
  TextColumn get accountId => text()();
  TextColumn get categoryId => text().nullable()();
  TextColumn get payeeId => text().nullable()();
  TextColumn get payeeName => text().nullable()();
  IntColumn get amountCents => integer()();
  TextColumn get date => text()(); // YYYY-MM-DD
  TextColumn get notes => text().nullable()();
  RealColumn get latitude => real().nullable()();
  RealColumn get longitude => real().nullable()();
  TextColumn get locationName => text().nullable()();
  BoolColumn get cleared => boolean().withDefault(const Constant(false))();
  TextColumn get origin => text().withDefault(const Constant('manual'))();
  TextColumn get originRef => text().nullable()();

  // Transfer linkage.
  TextColumn get transferAccountId => text().nullable()();
  TextColumn get transferGroupId => text().nullable()();

  // Split linkage.
  TextColumn get parentId => text().nullable()();
  IntColumn get splitTotalCents => integer().nullable()();

  // Foreign-currency metadata. Display-only: [amountCents] stays in the base
  // (home) currency; these record what the expense was in its original
  // currency (e.g. USD 20) so a trip abroad shows the real figure. No
  // conversion is performed. [originalAmountCents] is integer minor units of
  // [originalCurrency] (an ISO 4217 code like "USD").
  IntColumn get originalAmountCents => integer().nullable()();
  TextColumn get originalCurrency => text().nullable()();

  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('TagRow')
class Tags extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  IntColumn get color => integer().nullable()();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('TransactionTagRow')
class TransactionTags extends Table {
  TextColumn get id => text()();
  TextColumn get transactionId => text()();
  TextColumn get tagId => text()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('RuleRow')
class Rules extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  BoolColumn get enabled => boolean().withDefault(const Constant(true))();
  IntColumn get priority => integer().withDefault(const Constant(100))();
  TextColumn get triggerType => text()();
  TextColumn get triggerPayload => text()();
  TextColumn get actionPayload => text()();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('RuleMatchRow')
class RuleMatches extends Table {
  TextColumn get id => text()();
  TextColumn get ruleId => text()();
  TextColumn get sourceType => text()();
  TextColumn get sourceId => text()();
  TextColumn get transactionId => text().nullable()();
  IntColumn get matchedAt => integer()();
  TextColumn get outcome => text()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Envelope budget. One row per (category, month).
@DataClassName('BudgetRow')
class Budgets extends Table {
  TextColumn get id => text()();
  TextColumn get categoryId => text()();
  TextColumn get month => text()(); // YYYY-MM
  IntColumn get targetCents => integer()();
  IntColumn get rolloverCents => integer().withDefault(const Constant(0))();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Recurring transaction templates.
@DataClassName('RecurrenceRow')
class Recurrences extends Table {
  TextColumn get id => text()();
  TextColumn get accountId => text()();
  TextColumn get categoryId => text().nullable()();
  TextColumn get payeeId => text().nullable()();
  TextColumn get payeeName => text().nullable()();
  IntColumn get amountCents => integer()();
  TextColumn get notes => text().nullable()();
  // ISO 8601 duration-ish: 'monthly', 'weekly', 'daily', 'yearly'.
  TextColumn get cadence => text()();
  TextColumn get nextDate => text()(); // YYYY-MM-DD
  // Day-of-month the schedule is anchored to (1–31) for monthly/yearly
  // cadences. Kept separate from [nextDate] so a month-end schedule (e.g. the
  // 31st) clamps per short month WITHOUT permanently drifting: Jan 31 → Feb 28
  // → Mar 31, not → Mar 28. Null for legacy rows / daily-weekly (ignored).
  IntColumn get anchorDay => integer().nullable()();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('SmsRow')
class SmsMessages extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get androidId => text().nullable()();
  TextColumn get address => text()();
  TextColumn get body => text()();
  IntColumn get receivedAt => integer()();
  TextColumn get classifiedAs =>
      text().withDefault(const Constant('pending'))();
  IntColumn get parserVersion => integer().nullable()();
  TextColumn get candidateJson => text().nullable()();
  TextColumn get candidateStatus =>
      text().withDefault(const Constant('none'))();
  TextColumn get linkedTransactionId => text().nullable()();
  // User-supplied note captured via the notification reply UI. High
  // signal at SMS-time because the user still remembers the merchant
  // and reason ("decathlon hiking shoes", "tea with priya"). Stored as
  // a discrete column rather than buried in candidateJson so we can
  // index by 'needs note' and apply LWW updates by [noteCapturedAt].
  TextColumn get userNote => text().nullable()();
  IntColumn get noteCapturedAt => integer().nullable()();
  // Best-effort location at the moment of capture. Source: cached
  // last-known position; we don't wake GPS in the background.
  RealColumn get locationLat => real().nullable()();
  RealColumn get locationLng => real().nullable()();
  IntColumn get locationAccuracyM => integer().nullable()();
  IntColumn get locationCapturedAt => integer().nullable()();
  TextColumn get locationPlaceName => text().nullable()();
  // Enrichment lifecycle: 'none' | 'pending' | 'enriched' | 'error'.
  // Pending = note captured, awaiting server-side LLM enrichment.
  TextColumn get enrichmentStatus =>
      text().withDefault(const Constant('none'))();
  TextColumn get enrichedCandidateJson => text().nullable()();
  IntColumn get enrichedAt => integer().nullable()();
  // Server-parse queue (v10). Every captured SMS is parsed by the pi-server —
  // there is no on-device parsing. [stableSmsId] is the idempotency key
  // ('android:<id>' when the platform gives one, else a body hash) and is also
  // used as the created transaction's originRef so retries never double-create.
  // [candidateStatus] doubles as the queue state: pending_parse → parsing →
  // parsed | not_a_txn | parse_failed, then parsed → accepted | duplicate |
  // dismissed. Backoff metadata governs retries when the server is unreachable.
  TextColumn get stableSmsId => text().nullable()();
  IntColumn get parseAttemptCount => integer().withDefault(const Constant(0))();
  IntColumn get nextParseAfter => integer().nullable()();
  TextColumn get lastParseError => text().nullable()();
  IntColumn get parsedAt => integer().nullable()();
}

@DataClassName('AppKvRow')
class AppKv extends Table {
  TextColumn get key => text()();
  TextColumn get value => text().nullable()();

  @override
  Set<Column> get primaryKey => {key};
}

@DataClassName('AuditLogRow')
class AuditLog extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get at => integer()();
  TextColumn get level => text()();
  TextColumn get event => text()();
  TextColumn get payload => text().nullable()();
}

/// LLM-driven SMS parses are cached by hash(sender + body template).
/// The template masks digits + dates so two messages from the same
/// sender with the same shape collapse to one cache entry — first
/// SMS pays the LLM cost, every subsequent same-format SMS is free.
@DataClassName('SmsParseCacheRow')
class SmsParseCache extends Table {
  TextColumn get key => text()();
  TextColumn get senderSample => text().nullable()();
  TextColumn get bodyTemplate => text()();
  TextColumn get payloadJson => text()();
  IntColumn get hits => integer().withDefault(const Constant(1))();
  IntColumn get createdAt => integer()();
  IntColumn get lastSeenAt => integer()();

  @override
  Set<Column> get primaryKey => {key};
}

/// Local mutation log used by the sync layer. Every repository write
/// inserts a row here; SyncService batch-pushes unsynced entries to
/// the server's /v1/sync/push and marks them synced.
///
/// `clientChangeId` is a UUID generated when the row is logged. The
/// server uses (clientId, clientChangeId) as a per-row idempotency
/// key so a retried batch after a transient network failure doesn't
/// produce duplicate change-log entries on the server.
@DataClassName('ChangeLogRow')
class ChangeLog extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get at => integer()();
  // Default empty so the v2→v3 ALTER TABLE on existing installs
  // doesn't blow up on populated rows. SyncService skips empty
  // values so they don't reach the server.
  TextColumn get clientChangeId => text().withDefault(const Constant(''))();
  TextColumn get resource => text()();
  TextColumn get resourceId => text()();
  TextColumn get op => text()(); // 'upsert' | 'delete'
  TextColumn get payload => text().nullable()(); // JSON snapshot
  BoolColumn get synced => boolean().withDefault(const Constant(false))();
}
