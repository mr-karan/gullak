import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../core/logger.dart';
import '../core/prefs.dart';
import '../core/secure_store.dart';
import '../data/db/database.dart';
import '../state/providers.dart';

/// Talks to the homelab pi-server's /v1/sync endpoints. Local mutations
/// land in the [ChangeLog] Drift table via repositories; this service
/// batches the unsynced rows up to /v1/sync/push and (when wired) pulls
/// `/v1/sync/changes?since=<cursor>` to merge remote changes locally.
///
/// LWW per row by `updatedAt` is the conflict policy. Fine for personal
/// use; revisit if anything important ever clobbers.
class SyncService {
  SyncService(this._db, this._secure, this._prefs, {Dio? dio})
    : _dio = dio ?? Dio();

  final AppDatabase _db;
  final SecureStore _secure;
  final Prefs _prefs;
  final Dio _dio;
  final Uuid _uuid = const Uuid();
  String? _clientId;

  Future<bool> isConfigured() async {
    final url = (await _secure.readSyncBaseUrl())?.trim();
    return url != null && url.isNotEmpty;
  }

  Future<String> _getClientId() async {
    if (_clientId != null) return _clientId!;
    final stored = await _db.kvGet('sync.clientId');
    if (stored != null && stored.isNotEmpty) {
      _clientId = stored;
      return stored;
    }
    final fresh = _uuid.v4();
    await _db.kvSet('sync.clientId', fresh);
    _clientId = fresh;
    return fresh;
  }

  Future<({int pushed, int pulled, String? error})> syncOnce() async {
    if (!await isConfigured()) {
      return (pushed: 0, pulled: 0, error: 'Sync server not configured.');
    }
    try {
      final pushed = await pushPending();
      // Pull is wired in a follow-up — the server already accepts pushes.
      const pulled = 0;
      await _prefs.setSyncLastAt(DateTime.now().millisecondsSinceEpoch);
      return (pushed: pushed, pulled: pulled, error: null);
    } catch (e) {
      log.w('sync failed: $e');
      return (pushed: 0, pulled: 0, error: '$e');
    }
  }

  Future<int> pushPending() async {
    final baseUrl = (await _secure.readSyncBaseUrl())?.trim();
    final apiKey = (await _secure.readSyncApiKey())?.trim();
    if (baseUrl == null || baseUrl.isEmpty) return 0;

    final clientId = await _getClientId();
    var pushed = 0;
    while (true) {
      final batch =
          await (_db.select(_db.changeLog)
                ..where((t) => t.synced.equals(false))
                ..orderBy([(t) => OrderingTerm.asc(t.id)])
                ..limit(200))
              .get();
      if (batch.isEmpty) break;

      final body = {
        'clientId': clientId,
        'changes': [
          for (final row in batch)
            {
              'resource': row.resource,
              'resourceId': row.resourceId,
              'op': row.op,
              if (row.payload != null) 'payload': jsonDecode(row.payload!),
            },
        ],
      };

      final url = _join(baseUrl, '/v1/sync/push');
      await _dio.post<dynamic>(
        url,
        data: body,
        options: Options(
          headers: {
            if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
            'content-type': 'application/json',
          },
          sendTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 30),
        ),
      );

      await (_db.update(_db.changeLog)
            ..where((t) => t.id.isIn(batch.map((r) => r.id).toList())))
          .write(const ChangeLogCompanion(synced: Value(true)));
      pushed += batch.length;
    }
    return pushed;
  }

  static String _join(String baseUrl, String path) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return path.startsWith('/') ? '$base$path' : '$base/$path';
  }
}

final Provider<SyncService> syncServiceProvider = Provider<SyncService>((ref) {
  return SyncService(
    ref.read(dbProvider),
    ref.read(secureStoreProvider),
    ref.read(prefsProvider),
  );
});
