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

  static const _kSyncBaseUrl = 'gullak.sync.baseUrl';
  static const _kSyncApiKey = 'gullak.sync.apiKey';
  static const _kSyncActorId = 'gullak.sync.v2.actorId';
  static const _kSyncActorToken = 'gullak.sync.v2.actorToken';

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

  /// Stores the one-time v2 device credential with the actor it authenticates.
  /// The pair is written together from the caller's perspective; a mismatch is
  /// treated as absent so a token can never be sent for another actor.
  Future<void> writeSyncActorCredential({
    required String actorId,
    required String actorToken,
  }) async {
    await _write(_kSyncActorId, actorId);
    await _write(_kSyncActorToken, actorToken);
  }

  Future<String?> readSyncActorToken(String actorId) async {
    final storedActor = await _read(_kSyncActorId);
    if (storedActor != actorId) return null;
    return _read(_kSyncActorToken);
  }

  Future<void> wipe() async {
    try {
      await _storage.deleteAll();
    } catch (e) {
      log.w('secure wipe failed: $e');
    }
  }
}
