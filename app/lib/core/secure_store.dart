import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wraps FlutterSecureStorage with a small, typed surface.
class SecureStore {
  SecureStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
        );

  final FlutterSecureStorage _storage;

  static const _kServerUrl = 'gullak.actual.serverUrl';
  static const _kApiKey = 'gullak.actual.apiKey';
  static const _kBudgetSyncId = 'gullak.actual.budgetSyncId';
  static const _kBudgetEncryptionPassword = 'gullak.actual.budgetEncryptionPassword';

  static const _kLlmBaseUrl = 'gullak.llm.baseUrl';
  static const _kLlmApiKey = 'gullak.llm.apiKey';
  static const _kLlmModel = 'gullak.llm.model';

  Future<void> writeServerCreds({
    required String serverUrl,
    required String apiKey,
    String? budgetSyncId,
  }) async {
    await _storage.write(key: _kServerUrl, value: serverUrl);
    await _storage.write(key: _kApiKey, value: apiKey);
    if (budgetSyncId != null) {
      await _storage.write(key: _kBudgetSyncId, value: budgetSyncId);
    }
  }

  Future<String?> readServerUrl() => _storage.read(key: _kServerUrl);
  Future<String?> readApiKey() => _storage.read(key: _kApiKey);
  Future<String?> readBudgetSyncId() => _storage.read(key: _kBudgetSyncId);

  Future<void> setBudgetSyncId(String id) =>
      _storage.write(key: _kBudgetSyncId, value: id);

  Future<String?> readBudgetEncryptionPassword() =>
      _storage.read(key: _kBudgetEncryptionPassword);
  Future<void> writeBudgetEncryptionPassword(String? p) async {
    if (p == null || p.isEmpty) {
      await _storage.delete(key: _kBudgetEncryptionPassword);
    } else {
      await _storage.write(key: _kBudgetEncryptionPassword, value: p);
    }
  }

  Future<void> writeLlm({String? baseUrl, String? apiKey, String? model}) async {
    if (baseUrl == null) {
      await _storage.delete(key: _kLlmBaseUrl);
    } else {
      await _storage.write(key: _kLlmBaseUrl, value: baseUrl);
    }
    if (apiKey == null) {
      await _storage.delete(key: _kLlmApiKey);
    } else {
      await _storage.write(key: _kLlmApiKey, value: apiKey);
    }
    if (model == null) {
      await _storage.delete(key: _kLlmModel);
    } else {
      await _storage.write(key: _kLlmModel, value: model);
    }
  }

  Future<String?> readLlmBaseUrl() => _storage.read(key: _kLlmBaseUrl);
  Future<String?> readLlmApiKey() => _storage.read(key: _kLlmApiKey);
  Future<String?> readLlmModel() => _storage.read(key: _kLlmModel);

  Future<void> wipe() => _storage.deleteAll();
}
