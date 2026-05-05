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
import 'remote_applier.dart';

/// Talks to the homelab pi-server's /v1/sync endpoints. Local mutations
/// land in the [ChangeLog] Drift table via repositories; this service
/// batches the unsynced rows and POSTs them up to /v1/sync/push.
///
/// Pull is intentionally a thin shell — when wired we'll GET
/// `/v1/sync/changes?since=<cursor>&clientId=<self>` and apply LWW
/// per row by `updatedAt`. Server already filters out our own
/// changes so we don't echo-loop.
///
/// LWW per row by `updatedAt` is the conflict policy. Fine for
/// personal use; revisit if anything important ever clobbers.
class SyncService {
  SyncService(this._db, this._secure, this._prefs, this._applier, {Dio? dio})
    : _dio = dio ?? Dio();

  final AppDatabase _db;
  final SecureStore _secure;
  final Prefs _prefs;
  final RemoteApplier _applier;
  final Dio _dio;
  final Uuid _uuid = const Uuid();
  String? _clientId;

  static const _kClientIdKey = 'sync.clientId';
  static const _pruneRetainDays = 14;

  Future<bool> isConfigured() async {
    final url = (await _secure.readSyncBaseUrl())?.trim();
    return url != null && url.isNotEmpty;
  }

  Future<String> _getClientId() async {
    if (_clientId != null) return _clientId!;
    final stored = await _db.kvGet(_kClientIdKey);
    if (stored != null && stored.isNotEmpty) {
      _clientId = stored;
      return stored;
    }
    final fresh = _uuid.v4();
    await _db.kvSet(_kClientIdKey, fresh);
    _clientId = fresh;
    return fresh;
  }

  /// Probes the server's /v1/health to confirm the URL + (optional)
  /// API key are reachable before the user commits to syncing.
  Future<({bool ok, String message})> testConnection({
    required String baseUrl,
    String? apiKey,
  }) async {
    final url = _join(baseUrl, '/v1/health');
    try {
      final r = await _dio.get<dynamic>(
        url,
        options: Options(
          headers: {
            if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
            'accept': 'application/json',
          },
          receiveTimeout: const Duration(seconds: 8),
        ),
      );
      final data = r.data;
      if (data is Map && data['status'] == 'ok') {
        final version = data['version'] ?? 'unknown';
        return (ok: true, message: 'OK · server v$version');
      }
      return (ok: false, message: 'Unexpected response: $data');
    } on DioException catch (e) {
      return (
        ok: false,
        message: e.response?.statusCode == 401
            ? 'Unauthorized — check the API key'
            : (e.message ?? 'Network error'),
      );
    } catch (e) {
      return (ok: false, message: '$e');
    }
  }

  Future<({int pushed, int pulled, String? error})> syncOnce() async {
    if (!await isConfigured()) {
      return (pushed: 0, pulled: 0, error: 'Sync server not configured.');
    }
    try {
      final pushed = await pushPending();
      final pulled = await pullChanges();
      await _prefs.setSyncLastAt(DateTime.now().millisecondsSinceEpoch);
      await pruneSynced();
      return (pushed: pushed, pulled: pulled, error: null);
    } catch (e) {
      log.w('sync failed: $e');
      return (pushed: 0, pulled: 0, error: '$e');
    }
  }

  Future<int> pullChanges() async {
    final baseUrl = (await _secure.readSyncBaseUrl())?.trim();
    final apiKey = (await _secure.readSyncApiKey())?.trim();
    if (baseUrl == null || baseUrl.isEmpty) return 0;

    final clientId = await _getClientId();
    var pulled = 0;
    while (true) {
      final cursor = _prefs.syncCursor;
      final r = await _dio.get<dynamic>(
        _join(baseUrl, '/v1/sync/changes'),
        queryParameters: {'since': cursor, 'limit': 500, 'clientId': clientId},
        options: Options(
          headers: {
            if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
            'accept': 'application/json',
          },
          receiveTimeout: const Duration(seconds: 30),
        ),
      );
      final data = r.data;
      if (data is! Map) break;
      final changes = data['changes'];
      final nextCursor = (data['cursor'] as num?)?.toInt() ?? cursor;
      if (changes is! List || changes.isEmpty) {
        if (nextCursor != cursor) await _prefs.setSyncCursor(nextCursor);
        break;
      }
      for (final change in changes) {
        if (change is Map<String, dynamic>) {
          await _applier.apply(change);
        }
      }
      pulled += changes.length;
      await _prefs.setSyncCursor(nextCursor);
      if (changes.length < 500) break;
    }
    return pulled;
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
                ..where(
                  (t) =>
                      t.synced.equals(false) &
                      t.clientChangeId.equals('').not(),
                )
                ..orderBy([(t) => OrderingTerm.asc(t.id)])
                ..limit(200))
              .get();
      if (batch.isEmpty) break;

      final body = {
        'clientId': clientId,
        'changes': [
          for (final row in batch)
            {
              'clientChangeId': row.clientChangeId,
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

  /// Drop synced change-log rows older than [_pruneRetainDays]. Keeps
  /// the local table from growing forever while leaving a short
  /// recovery window if a recent sync turns out to be wrong.
  Future<int> pruneSynced() async {
    final cutoff = DateTime.now()
        .subtract(const Duration(days: _pruneRetainDays))
        .millisecondsSinceEpoch;
    return (_db.delete(_db.changeLog)..where(
          (t) => t.synced.equals(true) & t.at.isSmallerThanValue(cutoff),
        ))
        .go();
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
    ref.read(remoteApplierProvider),
  );
});
