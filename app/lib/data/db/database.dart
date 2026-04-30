import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3_flutter_libs/sqlite3_flutter_libs.dart';

import 'tables.dart';

part 'database.g.dart';

@DriftDatabase(tables: [
  Accounts,
  CategoryGroups,
  Categories,
  Payees,
  Transactions,
  SmsMessages,
  AppKv,
  AuditLog,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_tx_account_date '
            'ON transactions(account_id, date)',
          );
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_tx_sync_status '
            'ON transactions(sync_status)',
          );
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_tx_actual_id '
            'ON transactions(actual_id)',
          );
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_sms_status '
            'ON sms_messages(candidate_status)',
          );
        },
      );

  Future<String?> kvGet(String key) async {
    final r = await (select(appKv)..where((t) => t.key.equals(key))).getSingleOrNull();
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

    if (Platform.isAndroid) {
      await applyWorkaroundToOpenSqlite3OnOldAndroidVersions();
    }

    return NativeDatabase.createInBackground(
      file,
      logStatements: false,
    );
  });
}
