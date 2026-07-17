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
  static const _kActiveTagId = 'gullak.tags.activeTagId';
  static const _kLocationCaptureEnabled = 'gullak.location.captureEnabled';
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

  static const _kSyncCursor = 'gullak.sync.cursor';
  static const _kSyncLastAt = 'gullak.sync.lastAt';
  static const _kSyncQuarantined = 'gullak.sync.quarantined';

  int get syncCursor => _inner.getInt(_kSyncCursor) ?? 0;
  Future<void> setSyncCursor(int v) => _inner.setInt(_kSyncCursor, v);

  int? get syncLastAt => _inner.getInt(_kSyncLastAt);
  Future<void> setSyncLastAt(int v) => _inner.setInt(_kSyncLastAt, v);

  /// Running count of local changes that could not be synced (corrupt payloads
  /// quarantined during push). Surfaced in Settings → Sync; cleared there.
  int get syncQuarantined => _inner.getInt(_kSyncQuarantined) ?? 0;
  Future<void> setSyncQuarantined(int v) => _inner.setInt(_kSyncQuarantined, v);

  String? get lastAccountId => _inner.getString(_kLastAccountId);
  Future<void> setLastAccountId(String? id) async {
    if (id == null) {
      await _inner.remove(_kLastAccountId);
    } else {
      await _inner.setString(_kLastAccountId, id);
    }
  }

  String? get activeTagId => _inner.getString(_kActiveTagId);
  Future<void> setActiveTagId(String? id) async {
    if (id == null) {
      await _inner.remove(_kActiveTagId);
    } else {
      await _inner.setString(_kActiveTagId, id);
    }
  }

  bool get locationCaptureEnabled =>
      _inner.getBool(_kLocationCaptureEnabled) ?? false;
  Future<void> setLocationCaptureEnabled(bool v) =>
      _inner.setBool(_kLocationCaptureEnabled, v);

  String get payeeAccountHints => _inner.getString(_kPayeeAccountHints) ?? '{}';
  Future<void> setPayeeAccountHints(String json) =>
      _inner.setString(_kPayeeAccountHints, json);

  String get payeeCategoryHints =>
      _inner.getString(_kPayeeCategoryHints) ?? '{}';
  Future<void> setPayeeCategoryHints(String json) =>
      _inner.setString(_kPayeeCategoryHints, json);
}
