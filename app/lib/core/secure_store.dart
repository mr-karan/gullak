import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'logger.dart';

/// Wraps FlutterSecureStorage with a small, typed surface.
///
/// Every read is guarded: keychain failures (e.g. simulator without code
/// signing, where entitlements aren't applied) return `null` instead of
/// throwing. Without this, a Riverpod FutureProvider built on top would
/// retry forever with exponential backoff and the splash never advances.
class SecureStore {
  SecureStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kServerUrl = 'gullak.actual.serverUrl';
  static const _kApiKey = 'gullak.actual.apiKey';
  static const _kBudgetSyncId = 'gullak.actual.budgetSyncId';
  static const _kBudgetEncryptionPassword = 'gullak.actual.budgetEncryptionPassword';

  static const _kLlmBaseUrl = 'gullak.llm.baseUrl';
  static const _kLlmApiKey = 'gullak.llm.apiKey';
  static const _kLlmModel = 'gullak.llm.model';

  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (e) {
      log.w('secure read failed for $key: $e');
      return null;
    }
  }

  Future<void> _write(String key, String? value) async {
    try {
      if (value == null) {
        await _storage.delete(key: key);
      } else {
        await _storage.write(key: key, value: value);
      }
    } catch (e) {
      log.w('secure write failed for $key: $e');
    }
  }

  Future<void> writeServerCreds({
    required String serverUrl,
    required String apiKey,
    String? budgetSyncId,
  }) async {
    await _write(_kServerUrl, serverUrl);
    await _write(_kApiKey, apiKey);
    if (budgetSyncId != null) await _write(_kBudgetSyncId, budgetSyncId);
  }

  Future<String?> readServerUrl() => _read(_kServerUrl);
  Future<String?> readApiKey() => _read(_kApiKey);
  Future<String?> readBudgetSyncId() => _read(_kBudgetSyncId);

  Future<void> setBudgetSyncId(String id) => _write(_kBudgetSyncId, id);

  Future<String?> readBudgetEncryptionPassword() => _read(_kBudgetEncryptionPassword);
  Future<void> writeBudgetEncryptionPassword(String? p) =>
      _write(_kBudgetEncryptionPassword, (p == null || p.isEmpty) ? null : p);

  Future<void> writeLlm({String? baseUrl, String? apiKey, String? model}) async {
    await _write(_kLlmBaseUrl, baseUrl);
    await _write(_kLlmApiKey, apiKey);
    await _write(_kLlmModel, model);
  }

  Future<String?> readLlmBaseUrl() => _read(_kLlmBaseUrl);
  Future<String?> readLlmApiKey() => _read(_kLlmApiKey);
  Future<String?> readLlmModel() => _read(_kLlmModel);

  Future<void> wipe() async {
    try {
      await _storage.deleteAll();
    } catch (e) {
      log.w('secure wipe failed: $e');
    }
  }
}
