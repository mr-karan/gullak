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
  BoolColumn get cleared => boolean().withDefault(const Constant(false))();
  TextColumn get origin => text().withDefault(const Constant('manual'))();
  TextColumn get originRef => text().nullable()();

  // Transfer linkage.
  TextColumn get transferAccountId => text().nullable()();
  TextColumn get transferGroupId => text().nullable()();

  // Split linkage.
  TextColumn get parentId => text().nullable()();
  IntColumn get splitTotalCents => integer().nullable()();

  IntColumn get createdAt => integer()();
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
