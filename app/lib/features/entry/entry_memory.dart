import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/prefs.dart';
import '../../state/providers.dart';
import '../rules/data/rule_repository.dart';

/// Small store of "what did the user pick last time" hints used to
/// pre-fill Quick Entry. Payee mappings are now synced rules; the old
/// SharedPreferences values remain as a compatibility fallback while
/// existing devices migrate.
class EntryMemory {
  EntryMemory(this._prefs, this._rules);
  final Prefs _prefs;
  final RuleRepository _rules;

  String? get lastAccountId => _prefs.lastAccountId;
  Future<void> rememberAccount(String accountId) =>
      _prefs.setLastAccountId(accountId);

  Future<String?> accountForPayee(String payeeId) async {
    final rule = await _rules.actionForPayee(payeeId: payeeId);
    final synced = rule.accountId;
    if (synced != null) return synced;
    return _hint(_prefs.payeeAccountHints, payeeId);
  }

  Future<String?> categoryForPayee(String payeeId) async {
    final rule = await _rules.actionForPayee(payeeId: payeeId);
    final synced = rule.categoryId;
    if (synced != null) return synced;
    return _hint(_prefs.payeeCategoryHints, payeeId);
  }

  Future<void> rememberPayeeMapping({
    required String payeeId,
    String? accountId,
    String? categoryId,
  }) async {
    final existing = await _rules.actionForPayee(payeeId: payeeId);
    final nextAccountId = accountId ?? existing.accountId;
    final nextCategoryId = categoryId ?? existing.categoryId;
    if (nextAccountId != null) {
      await _prefs.setPayeeAccountHints(
        _setHint(_prefs.payeeAccountHints, payeeId, nextAccountId),
      );
    }
    if (nextCategoryId != null) {
      await _prefs.setPayeeCategoryHints(
        _setHint(_prefs.payeeCategoryHints, payeeId, nextCategoryId),
      );
    }
    if (nextAccountId == null && nextCategoryId == null) return;
    final actionPayload = <String, dynamic>{};
    if (nextAccountId != null) actionPayload['accountId'] = nextAccountId;
    if (nextCategoryId != null) actionPayload['categoryId'] = nextCategoryId;
    await _rules.upsertRule(
      id: payeeId,
      name: 'Payee memory',
      triggerType: 'payee',
      triggerPayload: {'payeeId': payeeId, 'match': 'equals'},
      actionPayload: actionPayload,
      priority: 10,
    );
  }

  static String? _hint(String raw, String key) {
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      final v = m[key];
      return v is String ? v : null;
    } catch (_) {
      return null;
    }
  }

  static String _setHint(String raw, String key, String value) {
    Map<String, dynamic> m;
    try {
      m = (jsonDecode(raw) as Map<String, dynamic>?) ?? <String, dynamic>{};
    } catch (_) {
      m = <String, dynamic>{};
    }
    m[key] = value;
    return jsonEncode(m);
  }
}

final Provider<EntryMemory> entryMemoryProvider = Provider<EntryMemory>(
  (ref) => EntryMemory(ref.watch(prefsProvider), ref.watch(ruleRepoProvider)),
);
