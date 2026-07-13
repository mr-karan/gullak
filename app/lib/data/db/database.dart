import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
// The native sqlite3 library is provided by the sqlite3 package's build
// hook, compiled from the vendored amalgamation (see vendor/sqlite3/ and
// the `hooks:` section in pubspec.yaml). The old sqlite3_flutter_libs
// link-time shim is EOL and no longer needed.
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
  int get schemaVersion => 12;

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
        'CREATE INDEX IF NOT EXISTS idx_sms_stable '
        'ON sms_messages(stable_sms_id)',
      );
      await customStatement(
        'CREATE INDEX IF NOT EXISTS idx_sms_next_parse '
        'ON sms_messages(candidate_status, next_parse_after)',
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
      if (from < 9) {
        // Notification quick-capture: high-signal user note at SMS-time
        // plus best-effort cached location, plus a second-stage enrichment
        // candidate so the original parse stays untouched for audit.
        await m.addColumn(smsMessages, smsMessages.userNote);
        await m.addColumn(smsMessages, smsMessages.noteCapturedAt);
        await m.addColumn(smsMessages, smsMessages.locationLat);
        await m.addColumn(smsMessages, smsMessages.locationLng);
        await m.addColumn(smsMessages, smsMessages.locationAccuracyM);
        await m.addColumn(smsMessages, smsMessages.locationCapturedAt);
        await m.addColumn(smsMessages, smsMessages.locationPlaceName);
        await m.addColumn(smsMessages, smsMessages.enrichmentStatus);
        await m.addColumn(smsMessages, smsMessages.enrichedCandidateJson);
        await m.addColumn(smsMessages, smsMessages.enrichedAt);
      }
      if (from < 10) {
        // Server-parse queue. Every captured SMS is parsed by the pi-server;
        // these columns hold the queue state + backoff + idempotency key.
        await m.addColumn(smsMessages, smsMessages.stableSmsId);
        await m.addColumn(smsMessages, smsMessages.parseAttemptCount);
        await m.addColumn(smsMessages, smsMessages.nextParseAfter);
        await m.addColumn(smsMessages, smsMessages.lastParseError);
        await m.addColumn(smsMessages, smsMessages.parsedAt);
        // Backfill the idempotency key for existing rows: prefer the Android
        // SMS id, else fall back to the local row id. (Android ids can collide
        // due to the platform dedupe quirk, so the index is intentionally
        // NON-unique; idempotency is enforced in code by lookup-before-insert.)
        await customStatement(
          "UPDATE sms_messages SET stable_sms_id = 'android:' || android_id "
          'WHERE android_id IS NOT NULL AND stable_sms_id IS NULL',
        );
        await customStatement(
          "UPDATE sms_messages SET stable_sms_id = 'row:' || id "
          'WHERE stable_sms_id IS NULL',
        );
        await customStatement(
          'CREATE INDEX IF NOT EXISTS idx_sms_stable '
          'ON sms_messages(stable_sms_id)',
        );
        // Speeds the queue drainer's "due for parse" scan.
        await customStatement(
          'CREATE INDEX IF NOT EXISTS idx_sms_next_parse '
          'ON sms_messages(candidate_status, next_parse_after)',
        );
      }
      if (from < 11) {
        // Optional foreign-currency metadata on transactions (display-only).
        await m.addColumn(transactions, transactions.originalAmountCents);
        await m.addColumn(transactions, transactions.originalCurrency);
      }
      if (from < 12) {
        // Anchor day for monthly/yearly recurrences (fixes month-end drift).
        await m.addColumn(recurrences, recurrences.anchorDay);
        // Backfill from the current nextDate's day-of-month. Already-drifted
        // rows lock to their drifted day; new/undrifted rows are correct.
        await customStatement(
          'UPDATE recurrences '
          'SET anchor_day = CAST(substr(next_date, 9, 2) AS INTEGER) '
          'WHERE anchor_day IS NULL',
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
    final file = File(p.join(dir.path, 'chavanni.db'));
    return NativeDatabase.createInBackground(file, logStatements: false);
  });
}
