import 'package:shared_preferences/shared_preferences.dart';

/// Non-secret app preferences. Init once at boot.
class Prefs {
  Prefs._(this._inner);

  final SharedPreferences _inner;

  static Future<Prefs> load() async {
    final p = await SharedPreferences.getInstance();
    return Prefs._(p);
  }

  static const _kCurrencyMinorDigits = 'gullak.currency.minorDigits';
  static const _kCurrencySymbol = 'gullak.currency.symbol';
  static const _kThemeMode = 'gullak.theme';
  static const _kDefaultAccountId = 'gullak.default.account';
  static const _kLastPullDate = 'gullak.sync.lastPull';
  static const _kQuickEntryTab = 'gullak.entry.tab';
  static const _kSmsEnabled = 'gullak.sms.enabled';
  static const _kLastAccountId = 'gullak.entry.lastAccountId';
  // Persisted as JSON: { "<payeeId>": "<accountId>" }
  static const _kPayeeAccountHints = 'gullak.entry.payeeAccountHints';
  // Persisted as JSON: { "<payeeId>": "<categoryId>" }
  static const _kPayeeCategoryHints = 'gullak.entry.payeeCategoryHints';

  int get currencyMinorDigits => _inner.getInt(_kCurrencyMinorDigits) ?? 2;
  Future<void> setCurrencyMinorDigits(int v) =>
      _inner.setInt(_kCurrencyMinorDigits, v);

  String get currencySymbol => _inner.getString(_kCurrencySymbol) ?? '₹';
  Future<void> setCurrencySymbol(String s) =>
      _inner.setString(_kCurrencySymbol, s);

  String get themeMode => _inner.getString(_kThemeMode) ?? 'system';
  Future<void> setThemeMode(String mode) => _inner.setString(_kThemeMode, mode);

  String? get defaultAccountId => _inner.getString(_kDefaultAccountId);
  Future<void> setDefaultAccountId(String? id) async {
    if (id == null) {
      await _inner.remove(_kDefaultAccountId);
    } else {
      await _inner.setString(_kDefaultAccountId, id);
    }
  }

  String? get lastPullDate => _inner.getString(_kLastPullDate);
  Future<void> setLastPullDate(String d) => _inner.setString(_kLastPullDate, d);

  String get quickEntryTab => _inner.getString(_kQuickEntryTab) ?? 'form';
  Future<void> setQuickEntryTab(String tab) =>
      _inner.setString(_kQuickEntryTab, tab);

  bool get smsEnabled => _inner.getBool(_kSmsEnabled) ?? false;
  Future<void> setSmsEnabled(bool v) => _inner.setBool(_kSmsEnabled, v);

  static const _kSmsAutoConfirm = 'gullak.sms.autoConfirm';
  static const _kSmsAutoConfirmThreshold = 'gullak.sms.autoConfirmThreshold';

  /// Default off — auto-confirm writes a financial row without a user
  /// gesture, so the user has to explicitly opt in.
  bool get smsAutoConfirm => _inner.getBool(_kSmsAutoConfirm) ?? false;
  Future<void> setSmsAutoConfirm(bool v) => _inner.setBool(_kSmsAutoConfirm, v);

  /// Below this confidence, a candidate stays in Inbox for review.
  /// Default 0.9 — only the cleanest parser hits clear it.
  double get smsAutoConfirmThreshold =>
      _inner.getDouble(_kSmsAutoConfirmThreshold) ?? 0.9;
  Future<void> setSmsAutoConfirmThreshold(double v) =>
      _inner.setDouble(_kSmsAutoConfirmThreshold, v);

  static const _kSyncCursor = 'gullak.sync.cursor';
  static const _kSyncLastAt = 'gullak.sync.lastAt';

  int get syncCursor => _inner.getInt(_kSyncCursor) ?? 0;
  Future<void> setSyncCursor(int v) => _inner.setInt(_kSyncCursor, v);

  int? get syncLastAt => _inner.getInt(_kSyncLastAt);
  Future<void> setSyncLastAt(int v) => _inner.setInt(_kSyncLastAt, v);

  String? get lastAccountId => _inner.getString(_kLastAccountId);
  Future<void> setLastAccountId(String? id) async {
    if (id == null) {
      await _inner.remove(_kLastAccountId);
    } else {
      await _inner.setString(_kLastAccountId, id);
    }
  }

  String get payeeAccountHints => _inner.getString(_kPayeeAccountHints) ?? '{}';
  Future<void> setPayeeAccountHints(String json) =>
      _inner.setString(_kPayeeAccountHints, json);

  String get payeeCategoryHints =>
      _inner.getString(_kPayeeCategoryHints) ?? '{}';
  Future<void> setPayeeCategoryHints(String json) =>
      _inner.setString(_kPayeeCategoryHints, json);
}
