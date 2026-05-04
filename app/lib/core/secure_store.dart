import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'logger.dart';

/// Secrets-only storage. Public preferences live in [Prefs].
///
/// Today this is just the LLM endpoint config; we keep it because LLM
/// keys are sensitive. Reads/writes are guarded so an unentitled
/// keychain (e.g. an unsigned simulator build) returns null instead
/// of throwing.
class SecureStore {
  SecureStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kLlmBaseUrl = 'gullak.llm.baseUrl';
  static const _kLlmApiKey = 'gullak.llm.apiKey';
  static const _kLlmModel = 'gullak.llm.model';
  static const _kSyncBaseUrl = 'gullak.sync.baseUrl';
  static const _kSyncApiKey = 'gullak.sync.apiKey';

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

  Future<void> writeLlm({
    String? baseUrl,
    String? apiKey,
    String? model,
  }) async {
    await _write(_kLlmBaseUrl, baseUrl);
    await _write(_kLlmApiKey, apiKey);
    await _write(_kLlmModel, model);
  }

  Future<String?> readLlmBaseUrl() => _read(_kLlmBaseUrl);
  Future<String?> readLlmApiKey() => _read(_kLlmApiKey);
  Future<String?> readLlmModel() => _read(_kLlmModel);

  Future<void> writeSync({String? baseUrl, String? apiKey}) async {
    await _write(_kSyncBaseUrl, baseUrl);
    await _write(_kSyncApiKey, apiKey);
  }

  Future<String?> readSyncBaseUrl() => _read(_kSyncBaseUrl);
  Future<String?> readSyncApiKey() => _read(_kSyncApiKey);

  Future<void> wipe() async {
    try {
      await _storage.deleteAll();
    } catch (e) {
      log.w('secure wipe failed: $e');
    }
  }
}
