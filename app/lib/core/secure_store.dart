import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'logger.dart';

/// Secrets-only storage. Public preferences live in [Prefs].
///
/// Just the sync-server URL + API key. The phone delegates all LLM
/// work to the homelab pi-server (SMS parsing, QuickEntry parsing,
/// receipt photos), so the OpenRouter key lives there, not here.
/// Reads/writes are guarded so an unentitled keychain (e.g. an
/// unsigned simulator build) returns null instead of throwing.
class SecureStore {
  SecureStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kSyncBaseUrl = 'chavanni.sync.baseUrl';
  static const _kSyncApiKey = 'chavanni.sync.apiKey';

  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (e) {
      log.w(
        'secure read failed: $e',
      ); // omit key name — don't reveal stored secrets
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
      log.w('secure write failed: $e'); // omit key name
    }
  }

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
