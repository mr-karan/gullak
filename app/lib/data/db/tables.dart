import 'package:drift/drift.dart';

@DataClassName('AccountRow')
class Accounts extends Table {
  TextColumn get id => text()();
  TextColumn get actualId => text().nullable()();
  TextColumn get name => text()();
  BoolColumn get offbudget => boolean().withDefault(const Constant(false))();
  BoolColumn get closed => boolean().withDefault(const Constant(false))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  IntColumn get balanceCents => integer().nullable()();
  IntColumn get updatedAt => integer()();
  TextColumn get syncStatus =>
      text().withDefault(const Constant('synced'))();
  TextColumn get syncError => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('CategoryGroupRow')
class CategoryGroups extends Table {
  TextColumn get id => text()();
  TextColumn get actualId => text().nullable()();
  TextColumn get name => text()();
  BoolColumn get isIncome => boolean().withDefault(const Constant(false))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('CategoryRow')
class Categories extends Table {
  TextColumn get id => text()();
  TextColumn get actualId => text().nullable()();
  TextColumn get name => text()();
  TextColumn get groupId => text()();
  BoolColumn get isIncome => boolean().withDefault(const Constant(false))();
  BoolColumn get hidden => boolean().withDefault(const Constant(false))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  IntColumn get updatedAt => integer()();
  TextColumn get syncStatus => text().withDefault(const Constant('synced'))();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('PayeeRow')
class Payees extends Table {
  TextColumn get id => text()();
  TextColumn get actualId => text().nullable()();
  TextColumn get name => text()();
  TextColumn get transferAcct => text().nullable()();
  IntColumn get useCount => integer().withDefault(const Constant(0))();
  IntColumn get updatedAt => integer()();
  TextColumn get syncStatus => text().withDefault(const Constant('synced'))();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('TransactionRow')
class Transactions extends Table {
  TextColumn get id => text()();
  TextColumn get actualId => text().nullable()();
  TextColumn get accountId => text()();
  TextColumn get categoryId => text().nullable()();
  TextColumn get payeeId => text().nullable()();
  TextColumn get payeeName => text().nullable()();
  IntColumn get amountCents => integer()();
  TextColumn get date => text()();
  TextColumn get notes => text().nullable()();
  BoolColumn get cleared => boolean().withDefault(const Constant(false))();
  TextColumn get origin =>
      text().withDefault(const Constant('manual'))();
  TextColumn get originRef => text().nullable()();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();
  IntColumn get deletedAt => integer().nullable()();
  TextColumn get syncStatus =>
      text().withDefault(const Constant('pending_push'))();
  TextColumn get syncError => text().nullable()();

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
