import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' as drift;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/logger.dart';
import '../../data/db/database.dart';
import '../../state/providers.dart';

/// Round-trippable JSON dump of every interesting table. Schema version
/// is recorded so a future import can refuse mismatched payloads.
class BackupService {
  BackupService(this._db);
  final AppDatabase _db;

  static const _schemaVersion = 2;

  Future<File> exportToFile() async {
    final json = await exportToJson();
    final dir = await getApplicationDocumentsDirectory();
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(':', '-')
        .split('.')
        .first;
    final file = File(p.join(dir.path, 'chavanni-backup-$stamp.json'));
    await file.writeAsString(json, flush: true);
    await _db.kvSet(
      'backup.last_export_at',
      DateTime.now().millisecondsSinceEpoch.toString(),
    );
    return file;
  }

  Future<File> exportTransactionsCsv() async {
    final rows =
        await (_db.select(_db.transactions).join([
              drift.leftOuterJoin(
                _db.accounts,
                _db.accounts.id.equalsExp(_db.transactions.accountId),
              ),
              drift.leftOuterJoin(
                _db.categories,
                _db.categories.id.equalsExp(_db.transactions.categoryId),
              ),
              drift.leftOuterJoin(
                _db.payees,
                _db.payees.id.equalsExp(_db.transactions.payeeId),
              ),
            ])..orderBy([
              drift.OrderingTerm.desc(_db.transactions.date),
              drift.OrderingTerm.desc(_db.transactions.createdAt),
            ]))
            .get();
    final buf = StringBuffer()
      ..writeln(
        'date,account,payee,category,amount_cents,cleared,origin,notes',
      );
    for (final row in rows) {
      final tx = row.readTable(_db.transactions);
      if (tx.parentId != null) continue;
      final account = row.readTableOrNull(_db.accounts)?.name ?? '';
      final payee = row.readTableOrNull(_db.payees)?.name ?? tx.payeeName ?? '';
      final category = row.readTableOrNull(_db.categories)?.name ?? '';
      buf.writeln(
        [
          tx.date,
          account,
          payee,
          category,
          tx.amountCents.toString(),
          tx.cleared.toString(),
          tx.origin,
          tx.notes ?? '',
        ].map(_csvCell).join(','),
      );
    }
    final dir = await getApplicationDocumentsDirectory();
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(':', '-')
        .split('.')
        .first;
    final file = File(p.join(dir.path, 'chavanni-transactions-$stamp.csv'));
    await file.writeAsString(buf.toString(), flush: true);
    return file;
  }

  Future<int?> lastExportAt() async {
    final raw = await _db.kvGet('backup.last_export_at');
    return raw == null ? null : int.tryParse(raw);
  }

  static String _csvCell(String value) {
    final escaped = value.replaceAll('"', '""');
    return '"$escaped"';
  }

  Future<String> exportToJson() async {
    final accounts = await _db.select(_db.accounts).get();
    final groups = await _db.select(_db.categoryGroups).get();
    final cats = await _db.select(_db.categories).get();
    final payees = await _db.select(_db.payees).get();
    final tx = await _db.select(_db.transactions).get();
    final tags = await _db.select(_db.tags).get();
    final transactionTags = await _db.select(_db.transactionTags).get();
    final rules = await _db.select(_db.rules).get();
    final ruleMatches = await _db.select(_db.ruleMatches).get();
    final budgets = await _db.select(_db.budgets).get();
    final recurrences = await _db.select(_db.recurrences).get();
    final kv = await _db.select(_db.appKv).get();

    final payload = <String, dynamic>{
      'schema_version': _schemaVersion,
      'exported_at': DateTime.now().toIso8601String(),
      'accounts': accounts.map(_accountToJson).toList(),
      'category_groups': groups.map(_groupToJson).toList(),
      'categories': cats.map(_catToJson).toList(),
      'payees': payees.map(_payeeToJson).toList(),
      'transactions': tx.map(_txToJson).toList(),
      'tags': tags.map(_tagToJson).toList(),
      'transaction_tags': transactionTags.map(_transactionTagToJson).toList(),
      'rules': rules.map(_ruleToJson).toList(),
      'rule_matches': ruleMatches.map(_ruleMatchToJson).toList(),
      'budgets': budgets.map(_budgetToJson).toList(),
      'recurrences': recurrences.map(_recurToJson).toList(),
      'kv': kv.map(_kvToJson).toList(),
    };
    return const JsonEncoder.withIndent('  ').convert(payload);
  }

  /// Wipes existing data and replaces it with [json]. Throws on
  /// schema-version mismatch or malformed payloads — caller surfaces.
  Future<int> importFromJson(String json) async {
    final dec = jsonDecode(json);
    if (dec is! Map<String, dynamic>) {
      throw const FormatException('expected a JSON object');
    }
    final version = dec['schema_version'] as int?;
    if (version != _schemaVersion) {
      throw FormatException(
        'schema mismatch: expected $_schemaVersion, got $version',
      );
    }

    var imported = 0;
    Iterable<Map<String, dynamic>> rowsOf(String key) =>
        (dec[key] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>();

    await _db.transaction(() async {
      // Order matters for FK-style integrity. Wipe in reverse order.
      await _db.delete(_db.budgets).go();
      await _db.delete(_db.recurrences).go();
      await _db.delete(_db.ruleMatches).go();
      await _db.delete(_db.rules).go();
      await _db.delete(_db.transactionTags).go();
      await _db.delete(_db.tags).go();
      await _db.delete(_db.transactions).go();
      await _db.delete(_db.payees).go();
      await _db.delete(_db.categories).go();
      await _db.delete(_db.categoryGroups).go();
      await _db.delete(_db.accounts).go();

      for (final r in rowsOf('accounts')) {
        await _db.into(_db.accounts).insert(_accountFromJson(r));
        imported++;
      }
      for (final r in rowsOf('category_groups')) {
        await _db.into(_db.categoryGroups).insert(_groupFromJson(r));
        imported++;
      }
      for (final r in rowsOf('categories')) {
        await _db.into(_db.categories).insert(_catFromJson(r));
        imported++;
      }
      for (final r in rowsOf('payees')) {
        await _db.into(_db.payees).insert(_payeeFromJson(r));
        imported++;
      }
      for (final r in rowsOf('transactions')) {
        await _db.into(_db.transactions).insert(_txFromJson(r));
        imported++;
      }
      for (final r in rowsOf('tags')) {
        await _db.into(_db.tags).insert(_tagFromJson(r));
        imported++;
      }
      for (final r in rowsOf('transaction_tags')) {
        await _db.into(_db.transactionTags).insert(_transactionTagFromJson(r));
        imported++;
      }
      for (final r in rowsOf('rules')) {
        await _db.into(_db.rules).insert(_ruleFromJson(r));
        imported++;
      }
      for (final r in rowsOf('rule_matches')) {
        await _db.into(_db.ruleMatches).insert(_ruleMatchFromJson(r));
        imported++;
      }
      for (final r in rowsOf('budgets')) {
        await _db.into(_db.budgets).insert(_budgetFromJson(r));
        imported++;
      }
      for (final r in rowsOf('recurrences')) {
        await _db.into(_db.recurrences).insert(_recurFromJson(r));
        imported++;
      }
      for (final r in rowsOf('kv')) {
        await _db.into(_db.appKv).insert(_kvFromJson(r));
        imported++;
      }
    });

    log.i('imported $imported rows');
    return imported;
  }

  BackupPreview previewJson(String json) {
    final dec = jsonDecode(json);
    if (dec is! Map<String, dynamic>) {
      throw const FormatException('expected a JSON object');
    }
    final version = dec['schema_version'] as int?;
    if (version != _schemaVersion) {
      throw FormatException(
        'schema mismatch: expected $_schemaVersion, got $version',
      );
    }
    int count(String key) {
      final value = dec[key];
      return value is List ? value.length : 0;
    }

    return BackupPreview(
      exportedAt: dec['exported_at'] as String?,
      accounts: count('accounts'),
      transactions: count('transactions'),
      categories: count('categories'),
      tags: count('tags'),
      rules: count('rules'),
      budgets: count('budgets'),
    );
  }

  // ── serializers ──────────────────────────────────────────────────

  Map<String, dynamic> _accountToJson(AccountRow a) => {
    'id': a.id,
    'name': a.name,
    'kind': a.kind,
    'opening_balance_cents': a.openingBalanceCents,
    'reconciled_balance_cents': a.reconciledBalanceCents,
    'reconciled_at': a.reconciledAt,
    'on_budget': a.onBudget,
    'archived': a.archived,
    'sort_order': a.sortOrder,
    'created_at': a.createdAt,
    'updated_at': a.updatedAt,
  };

  AccountsCompanion _accountFromJson(Map<String, dynamic> j) =>
      AccountsCompanion.insert(
        id: j['id'] as String,
        name: j['name'] as String,
        kind: drift.Value(j['kind'] as String? ?? 'checking'),
        openingBalanceCents: drift.Value(
          (j['opening_balance_cents'] as num?)?.toInt() ?? 0,
        ),
        reconciledBalanceCents: drift.Value(
          (j['reconciled_balance_cents'] as num?)?.toInt(),
        ),
        reconciledAt: drift.Value((j['reconciled_at'] as num?)?.toInt()),
        onBudget: drift.Value(j['on_budget'] as bool? ?? true),
        archived: drift.Value(j['archived'] as bool? ?? false),
        sortOrder: drift.Value((j['sort_order'] as num?)?.toInt() ?? 0),
        createdAt: (j['created_at'] as num).toInt(),
        updatedAt: (j['updated_at'] as num).toInt(),
      );

  Map<String, dynamic> _groupToJson(CategoryGroupRow g) => {
    'id': g.id,
    'name': g.name,
    'is_income': g.isIncome,
    'sort_order': g.sortOrder,
  };

  CategoryGroupsCompanion _groupFromJson(Map<String, dynamic> j) =>
      CategoryGroupsCompanion.insert(
        id: j['id'] as String,
        name: j['name'] as String,
        isIncome: drift.Value(j['is_income'] as bool? ?? false),
        sortOrder: drift.Value((j['sort_order'] as num?)?.toInt() ?? 0),
      );

  Map<String, dynamic> _catToJson(CategoryRow c) => {
    'id': c.id,
    'name': c.name,
    'group_id': c.groupId,
    'parent_id': c.parentId,
    'color': c.color,
    'icon': c.icon,
    'hidden': c.hidden,
    'sort_order': c.sortOrder,
    'updated_at': c.updatedAt,
  };

  CategoriesCompanion _catFromJson(Map<String, dynamic> j) =>
      CategoriesCompanion.insert(
        id: j['id'] as String,
        name: j['name'] as String,
        groupId: j['group_id'] as String,
        parentId: drift.Value(j['parent_id'] as String?),
        color: drift.Value((j['color'] as num?)?.toInt()),
        icon: drift.Value(j['icon'] as String?),
        hidden: drift.Value(j['hidden'] as bool? ?? false),
        sortOrder: drift.Value((j['sort_order'] as num?)?.toInt() ?? 0),
        updatedAt: (j['updated_at'] as num).toInt(),
      );

  Map<String, dynamic> _payeeToJson(PayeeRow p) => {
    'id': p.id,
    'name': p.name,
    'use_count': p.useCount,
    'updated_at': p.updatedAt,
  };

  PayeesCompanion _payeeFromJson(Map<String, dynamic> j) =>
      PayeesCompanion.insert(
        id: j['id'] as String,
        name: j['name'] as String,
        useCount: drift.Value((j['use_count'] as num?)?.toInt() ?? 0),
        updatedAt: (j['updated_at'] as num).toInt(),
      );

  Map<String, dynamic> _txToJson(TransactionRow t) => {
    'id': t.id,
    'account_id': t.accountId,
    'category_id': t.categoryId,
    'payee_id': t.payeeId,
    'payee_name': t.payeeName,
    'amount_cents': t.amountCents,
    'date': t.date,
    'notes': t.notes,
    'latitude': t.latitude,
    'longitude': t.longitude,
    'location_name': t.locationName,
    'cleared': t.cleared,
    'origin': t.origin,
    'origin_ref': t.originRef,
    'transfer_account_id': t.transferAccountId,
    'transfer_group_id': t.transferGroupId,
    'parent_id': t.parentId,
    'split_total_cents': t.splitTotalCents,
    'original_amount_cents': t.originalAmountCents,
    'original_currency': t.originalCurrency,
    'created_at': t.createdAt,
    'updated_at': t.updatedAt,
  };

  TransactionsCompanion _txFromJson(Map<String, dynamic> j) =>
      TransactionsCompanion.insert(
        id: j['id'] as String,
        accountId: j['account_id'] as String,
        amountCents: (j['amount_cents'] as num).toInt(),
        date: j['date'] as String,
        createdAt: (j['created_at'] as num).toInt(),
        updatedAt: (j['updated_at'] as num).toInt(),
        categoryId: drift.Value(j['category_id'] as String?),
        payeeId: drift.Value(j['payee_id'] as String?),
        payeeName: drift.Value(j['payee_name'] as String?),
        notes: drift.Value(j['notes'] as String?),
        latitude: drift.Value((j['latitude'] as num?)?.toDouble()),
        longitude: drift.Value((j['longitude'] as num?)?.toDouble()),
        locationName: drift.Value(j['location_name'] as String?),
        cleared: drift.Value(j['cleared'] as bool? ?? false),
        origin: drift.Value(j['origin'] as String? ?? 'manual'),
        originRef: drift.Value(j['origin_ref'] as String?),
        transferAccountId: drift.Value(j['transfer_account_id'] as String?),
        transferGroupId: drift.Value(j['transfer_group_id'] as String?),
        parentId: drift.Value(j['parent_id'] as String?),
        splitTotalCents: drift.Value((j['split_total_cents'] as num?)?.toInt()),
        originalAmountCents: drift.Value(
          (j['original_amount_cents'] as num?)?.toInt(),
        ),
        originalCurrency: drift.Value(j['original_currency'] as String?),
      );

  Map<String, dynamic> _tagToJson(TagRow t) => {
    'id': t.id,
    'name': t.name,
    'color': t.color,
    'archived': t.archived,
    'created_at': t.createdAt,
    'updated_at': t.updatedAt,
  };

  TagsCompanion _tagFromJson(Map<String, dynamic> j) => TagsCompanion.insert(
    id: j['id'] as String,
    name: j['name'] as String,
    color: drift.Value((j['color'] as num?)?.toInt()),
    archived: drift.Value(j['archived'] as bool? ?? false),
    createdAt: (j['created_at'] as num).toInt(),
    updatedAt: (j['updated_at'] as num).toInt(),
  );

  Map<String, dynamic> _transactionTagToJson(TransactionTagRow t) => {
    'id': t.id,
    'transaction_id': t.transactionId,
    'tag_id': t.tagId,
    'updated_at': t.updatedAt,
  };

  TransactionTagsCompanion _transactionTagFromJson(Map<String, dynamic> j) =>
      TransactionTagsCompanion.insert(
        id: j['id'] as String,
        transactionId: j['transaction_id'] as String,
        tagId: j['tag_id'] as String,
        updatedAt: (j['updated_at'] as num).toInt(),
      );

  Map<String, dynamic> _ruleToJson(RuleRow r) => {
    'id': r.id,
    'name': r.name,
    'enabled': r.enabled,
    'priority': r.priority,
    'trigger_type': r.triggerType,
    'trigger_payload': r.triggerPayload,
    'action_payload': r.actionPayload,
    'created_at': r.createdAt,
    'updated_at': r.updatedAt,
  };

  RulesCompanion _ruleFromJson(Map<String, dynamic> j) => RulesCompanion.insert(
    id: j['id'] as String,
    name: j['name'] as String,
    enabled: drift.Value(j['enabled'] as bool? ?? true),
    priority: drift.Value((j['priority'] as num?)?.toInt() ?? 100),
    triggerType: j['trigger_type'] as String,
    triggerPayload: j['trigger_payload'] as String,
    actionPayload: j['action_payload'] as String,
    createdAt: (j['created_at'] as num).toInt(),
    updatedAt: (j['updated_at'] as num).toInt(),
  );

  Map<String, dynamic> _ruleMatchToJson(RuleMatchRow r) => {
    'id': r.id,
    'rule_id': r.ruleId,
    'source_type': r.sourceType,
    'source_id': r.sourceId,
    'transaction_id': r.transactionId,
    'matched_at': r.matchedAt,
    'outcome': r.outcome,
    'updated_at': r.updatedAt,
  };

  RuleMatchesCompanion _ruleMatchFromJson(Map<String, dynamic> j) =>
      RuleMatchesCompanion.insert(
        id: j['id'] as String,
        ruleId: j['rule_id'] as String,
        sourceType: j['source_type'] as String,
        sourceId: j['source_id'] as String,
        transactionId: drift.Value(j['transaction_id'] as String?),
        matchedAt: (j['matched_at'] as num).toInt(),
        outcome: j['outcome'] as String,
        updatedAt: (j['updated_at'] as num).toInt(),
      );

  Map<String, dynamic> _budgetToJson(BudgetRow b) => {
    'id': b.id,
    'category_id': b.categoryId,
    'month': b.month,
    'target_cents': b.targetCents,
    'rollover_cents': b.rolloverCents,
    'updated_at': b.updatedAt,
  };

  BudgetsCompanion _budgetFromJson(Map<String, dynamic> j) =>
      BudgetsCompanion.insert(
        id: j['id'] as String,
        categoryId: j['category_id'] as String,
        month: j['month'] as String,
        targetCents: (j['target_cents'] as num).toInt(),
        rolloverCents: drift.Value((j['rollover_cents'] as num?)?.toInt() ?? 0),
        updatedAt: (j['updated_at'] as num).toInt(),
      );

  Map<String, dynamic> _recurToJson(RecurrenceRow r) => {
    'id': r.id,
    'account_id': r.accountId,
    'category_id': r.categoryId,
    'payee_id': r.payeeId,
    'payee_name': r.payeeName,
    'amount_cents': r.amountCents,
    'notes': r.notes,
    'cadence': r.cadence,
    'next_date': r.nextDate,
    'anchor_day': r.anchorDay,
    'created_at': r.createdAt,
    'updated_at': r.updatedAt,
  };

  RecurrencesCompanion _recurFromJson(Map<String, dynamic> j) =>
      RecurrencesCompanion.insert(
        id: j['id'] as String,
        accountId: j['account_id'] as String,
        amountCents: (j['amount_cents'] as num).toInt(),
        cadence: j['cadence'] as String,
        nextDate: j['next_date'] as String,
        createdAt: (j['created_at'] as num).toInt(),
        updatedAt: (j['updated_at'] as num).toInt(),
        categoryId: drift.Value(j['category_id'] as String?),
        payeeId: drift.Value(j['payee_id'] as String?),
        payeeName: drift.Value(j['payee_name'] as String?),
        notes: drift.Value(j['notes'] as String?),
        anchorDay: drift.Value((j['anchor_day'] as num?)?.toInt()),
      );

  Map<String, dynamic> _kvToJson(AppKvRow r) => {
    'key': r.key,
    'value': r.value,
  };
  AppKvCompanion _kvFromJson(Map<String, dynamic> j) => AppKvCompanion.insert(
    key: j['key'] as String,
    value: drift.Value(j['value'] as String?),
  );
}

final Provider<BackupService> backupServiceProvider = Provider<BackupService>(
  (ref) => BackupService(ref.watch(dbProvider)),
);

class BackupPreview {
  const BackupPreview({
    required this.exportedAt,
    required this.accounts,
    required this.transactions,
    required this.categories,
    required this.tags,
    required this.rules,
    required this.budgets,
  });

  final String? exportedAt;
  final int accounts;
  final int transactions;
  final int categories;
  final int tags;
  final int rules;
  final int budgets;
}
