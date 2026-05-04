import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/prefs.dart';
import '../../state/providers.dart';

/// Small store of "what did the user pick last time" hints used to
/// pre-fill Quick Entry. All persistence is through [Prefs] so we
/// avoid a Drift round-trip on every keystroke.
class EntryMemory {
  EntryMemory(this._prefs);
  final Prefs _prefs;

  String? get lastAccountId => _prefs.lastAccountId;
  Future<void> rememberAccount(String accountId) =>
      _prefs.setLastAccountId(accountId);

  String? accountForPayee(String payeeId) =>
      _hint(_prefs.payeeAccountHints, payeeId);
  String? categoryForPayee(String payeeId) =>
      _hint(_prefs.payeeCategoryHints, payeeId);

  Future<void> rememberPayeeMapping({
    required String payeeId,
    String? accountId,
    String? categoryId,
  }) async {
    if (accountId != null) {
      await _prefs.setPayeeAccountHints(
        _setHint(_prefs.payeeAccountHints, payeeId, accountId),
      );
    }
    if (categoryId != null) {
      await _prefs.setPayeeCategoryHints(
        _setHint(_prefs.payeeCategoryHints, payeeId, categoryId),
      );
    }
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
  (ref) => EntryMemory(ref.watch(prefsProvider)),
);
