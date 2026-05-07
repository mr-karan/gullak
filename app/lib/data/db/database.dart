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
    Tags,
    TransactionTags,
    Rules,
    RuleMatches,
    Budgets,
    Recurrences,
    SmsMessages,
    SmsParseCache,
    AppKv,
    AuditLog,
    ChangeLog,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 8;

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
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_name '
        'ON tags(name)',
      );
      await customStatement(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_tag_pair '
        'ON transaction_tags(transaction_id, tag_id)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_transaction_tag_tag '
        'ON transaction_tags(tag_id)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_rules_enabled_priority '
        'ON rules(enabled, priority)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_rule_matches_rule '
        'ON rule_matches(rule_id)',
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
      if (from < 3) {
        // Schema v3 adds clientChangeId so server-side dedupe works.
        // The column has DEFAULT '' so the ALTER TABLE on populated
        // installs doesn't fail. Pre-existing rows predate sync; mark
        // them synced=true so they never reach the push path with an
        // empty client_change_id (the server requires non-empty).
        await m.addColumn(changeLog, changeLog.clientChangeId);
        await customStatement(
          'UPDATE change_log SET synced = 1 WHERE client_change_id = ""',
        );
      }
      if (from < 4) {
        // Schema v4 introduces the SMS LLM-parse cache. The bank
        // regex parsers are gone; this table amortises the LLM cost
        // by collapsing same-format SMS to one cache entry.
        await m.createTable(smsParseCache);
      }
      if (from < 5) {
        await m.addColumn(transactions, transactions.latitude);
        await m.addColumn(transactions, transactions.longitude);
        await m.addColumn(transactions, transactions.locationName);
        await m.createTable(tags);
        await m.createTable(transactionTags);
        await customStatement(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_name '
          'ON tags(name)',
        );
        await customStatement(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_tag_pair '
          'ON transaction_tags(transaction_id, tag_id)',
        );
        await customStatement(
          'CREATE INDEX IF NOT EXISTS idx_transaction_tag_tag '
          'ON transaction_tags(tag_id)',
        );
      }
      if (from < 6) {
        await m.createTable(rules);
        await m.createTable(ruleMatches);
        await customStatement(
          'CREATE INDEX IF NOT EXISTS idx_rules_enabled_priority '
          'ON rules(enabled, priority)',
        );
        await customStatement(
          'CREATE INDEX IF NOT EXISTS idx_rule_matches_rule '
          'ON rule_matches(rule_id)',
        );
      }
      if (from < 7) {
        // Schema v7 adds one-level subcategories. Existing rows have
        // no parent, so the column starts NULL everywhere.
        await m.addColumn(categories, categories.parentId);
      }
      if (from < 8) {
        await m.addColumn(accounts, accounts.reconciledBalanceCents);
        await m.addColumn(accounts, accounts.reconciledAt);
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
