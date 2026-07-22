import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show RuleRow, RuleMatchRow;

class RuleAction {
  const RuleAction({
    this.payeeName,
    this.categoryId,
    this.accountId,
    this.autoConfirm,
    this.ignore,
    this.tagIds = const [],
  });

  final String? payeeName;
  final String? categoryId;
  final String? accountId;
  final bool? autoConfirm;
  final bool? ignore;
  final List<String> tagIds;

  bool get isEmpty =>
      payeeName == null &&
      categoryId == null &&
      accountId == null &&
      autoConfirm == null &&
      ignore == null &&
      tagIds.isEmpty;

  RuleAction merge(RuleAction other) => RuleAction(
    payeeName: other.payeeName ?? payeeName,
    categoryId: other.categoryId ?? categoryId,
    accountId: other.accountId ?? accountId,
    autoConfirm: other.autoConfirm ?? autoConfirm,
    ignore: other.ignore ?? ignore,
    tagIds: {...tagIds, ...other.tagIds}.toList(growable: false),
  );
}

class RuleRepository {
  RuleRepository(this._db);

  final AppDatabase _db;
  static const _uuid = Uuid();

  Future<List<RuleRow>> list({bool includeDisabled = false}) {
    final q = _db.select(_db.rules)
      ..orderBy([
        (r) => OrderingTerm.asc(r.priority),
        (r) => OrderingTerm.asc(r.name),
      ]);
    if (!includeDisabled) q.where((r) => r.enabled.equals(true));
    return q.get();
  }

  Stream<List<RuleRow>> watch({bool includeDisabled = true}) {
    final q = _db.select(_db.rules)
      ..orderBy([
        (r) => OrderingTerm.asc(r.priority),
        (r) => OrderingTerm.asc(r.name),
      ]);
    if (!includeDisabled) q.where((r) => r.enabled.equals(true));
    return q.watch();
  }

  Future<String> upsertRule({
    String? id,
    required String name,
    required String triggerType,
    required Map<String, dynamic> triggerPayload,
    required Map<String, dynamic> actionPayload,
    bool enabled = true,
    int priority = 100,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final ruleId = id ?? _uuid.v4();
    final existing = await (_db.select(
      _db.rules,
    )..where((r) => r.id.equals(ruleId))).getSingleOrNull();
    final row = RulesCompanion.insert(
      id: ruleId,
      name: name,
      triggerType: triggerType,
      triggerPayload: jsonEncode(triggerPayload),
      actionPayload: jsonEncode(actionPayload),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      enabled: Value(enabled),
      priority: Value(priority),
    );
    await _db.into(_db.rules).insertOnConflictUpdate(row);
    return ruleId;
  }

  Future<void> delete(String id) async {
    await (_db.delete(_db.rules)..where((r) => r.id.equals(id))).go();
  }

  Future<RuleAction> actionForSms({
    required String address,
    required String body,
    String? payeeName,
    String? accountHint,
    int? amountCents,
  }) async {
    var action = const RuleAction();
    final rules = await list();
    for (final rule in rules) {
      if (!_matches(
        rule,
        address: address,
        body: body,
        payeeName: payeeName,
        accountHint: accountHint,
        amountCents: amountCents,
      )) {
        continue;
      }
      action = action.merge(_decodeAction(rule.actionPayload));
    }
    return action;
  }

  Future<RuleAction> actionForPayee({
    required String payeeId,
    String? payeeName,
  }) async {
    var action = const RuleAction();
    final rules = await list();
    for (final rule in rules) {
      if (!_matches(
        rule,
        address: '',
        body: '',
        payeeId: payeeId,
        payeeName: payeeName,
      )) {
        continue;
      }
      action = action.merge(_decodeAction(rule.actionPayload));
    }
    return action;
  }

  Future<Map<String, String>> payeeCategoryHintIds() async {
    final out = <String, String>{};
    for (final rule in await list()) {
      if (rule.triggerType != 'payee') continue;
      final trigger = _decodeMap(rule.triggerPayload);
      final payeeId = trigger['payeeId'] as String?;
      if (payeeId == null || payeeId.isEmpty) continue;
      final action = _decodeMap(rule.actionPayload);
      final categoryId = action['categoryId'] as String?;
      if (categoryId == null || categoryId.isEmpty) continue;
      out[payeeId] = categoryId;
    }
    return out;
  }

  Future<void> recordMatch({
    required String ruleId,
    required String sourceType,
    required String sourceId,
    String? transactionId,
    required String outcome,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final id = _uuid.v4();
    await _db
        .into(_db.ruleMatches)
        .insert(
          RuleMatchesCompanion.insert(
            id: id,
            ruleId: ruleId,
            sourceType: sourceType,
            sourceId: sourceId,
            transactionId: Value(transactionId),
            matchedAt: now,
            outcome: outcome,
            updatedAt: now,
          ),
        );
  }

  bool _matches(
    RuleRow rule, {
    required String address,
    required String body,
    String? payeeId,
    String? payeeName,
    String? accountHint,
    int? amountCents,
  }) {
    final payload = _decodeMap(rule.triggerPayload);
    final value = (payload['value'] as String? ?? '').trim().toLowerCase();
    final match = (payload['match'] as String? ?? 'contains').toLowerCase();
    if (value.isEmpty && rule.triggerType != 'amount') return false;

    final target = switch (rule.triggerType) {
      'sms_sender' => address,
      'sms_body' => body,
      'payee' || 'merchant' => payeeId ?? payeeName ?? '',
      'account_hint' => accountHint ?? '',
      'amount' => amountCents?.abs().toString() ?? '',
      _ => '',
    }.toLowerCase();

    return switch (match) {
      'equals' => target == value,
      'starts_with' => target.startsWith(value),
      'regex' => RegExp(value, caseSensitive: false).hasMatch(target),
      _ => target.contains(value),
    };
  }

  RuleAction _decodeAction(String raw) {
    final j = _decodeMap(raw);
    return RuleAction(
      payeeName: j['payeeName'] as String?,
      categoryId: j['categoryId'] as String?,
      accountId: j['accountId'] as String?,
      autoConfirm: j['autoConfirm'] as bool?,
      ignore: j['ignore'] as bool?,
      tagIds:
          (j['tags'] as List<dynamic>?)?.whereType<String>().toList(
            growable: false,
          ) ??
          const [],
    );
  }

  Map<String, dynamic> _decodeMap(String raw) {
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : const {};
    } catch (_) {
      return const {};
    }
  }
}

final ruleRepoProvider = Provider<RuleRepository>(
  (ref) => RuleRepository(ref.watch(dbProvider)),
);

final rulesProvider = StreamProvider<List<RuleRow>>(
  (ref) => ref.watch(ruleRepoProvider).watch(),
);
