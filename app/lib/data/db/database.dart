import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
// sqlite3_flutter_libs is required at link time so Drift can find
// sqlite3 on Android; we don't import any symbols from it directly.
// ignore: unused_import
import 'package:sqlite3_flutter_libs/sqlite3_flutter_libs.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'tables.dart';

part 'database.g.dart';

@DriftDatabase(
  tables: [
    Accounts,
    CategoryGroups,
    Categories,
    Payees,
    Transactions,
    Budgets,
    Recurrences,
    SmsMessages,
    AppKv,
    AuditLog,
    ChangeLog,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_tx_account_date '
        'ON transactions(account_id, date)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_tx_parent '
        'ON transactions(parent_id)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_tx_transfer_group '
        'ON transactions(transfer_group_id)',
      );
      await customStatement(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_cat_month '
        'ON budgets(category_id, month)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_sms_status '
        'ON sms_messages(candidate_status)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_change_log_synced '
        'ON change_log(synced, id)',
      );
    },
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.createTable(changeLog);
        await customStatement(
          'CREATE INDEX IF NOT EXISTS idx_change_log_synced '
          'ON change_log(synced, id)',
        );
      }
    },
  );

  Future<String?> kvGet(String key) async {
    final r = await (select(
      appKv,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    return r?.value;
  }

  Future<void> kvSet(String key, String? value) async {
    await into(appKv).insertOnConflictUpdate(
      AppKvCompanion.insert(key: key, value: Value(value)),
    );
  }
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'gullak.db'));
    return NativeDatabase.createInBackground(file, logStatements: false);
  });
}
