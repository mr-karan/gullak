import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../core/logger.dart';
import '../core/network_errors.dart';
import '../core/prefs.dart';
import '../core/secure_store.dart';
import '../data/db/database.dart';
import '../state/providers.dart';
import 'remote_applier.dart';
import 'crdt_store.dart';
import 'sync_v2_client.dart';

typedef SyncRunResult = ({
  int pushed,
  int pulled,
  int quarantined,
  int duplicates,
  int conflicts,
  int protocol,
  String? error,
});

/// Negotiates sync protocol support with the configured server.
///
/// Protocol v2 exchanges immutable causal field operations and folds them
/// through [CrdtStore]. Protocol v1 remains here only as a mixed-version
/// migration adapter: it drains an installed pre-v2 outbox before verified
/// checkpoint bootstrap and is disabled by the server after activation.
class SyncService {
  SyncService(
    this._db,
    this._secure,
    this._prefs,
    this._applier, {
    Dio? dio,
    SyncV2Client? v2Client,
  }) : _dio = dio ?? Dio() {
    _v2 = v2Client ?? SyncV2Client(_db, _secure, CrdtStore(_db), dio: _dio);
  }

  final AppDatabase _db;
  final SecureStore _secure;
  final Prefs _prefs;
  final RemoteApplier _applier;
  final Dio _dio;
  late final SyncV2Client _v2;
  final Uuid _uuid = const Uuid();
  String? _clientId;
  Future<SyncRunResult>? _inFlight;

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
            'connection': 'close',
          },
          connectTimeout: const Duration(seconds: 5),
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
      return (ok: false, message: networkErrorMessage(e));
    } catch (e) {
      return (ok: false, message: networkErrorMessage(e));
    }
  }

  /// Cheap reachability probe using the configured server creds.
  /// Returns ok=false with a human message when not configured or
  /// unreachable. Used by the health monitor for the offline banner —
  /// kept distinct from `syncOnce()` so a payload-level sync failure
  /// doesn't masquerade as the server being down.
  Future<({bool ok, String message})> probeHealth() async {
    final baseUrl = (await _secure.readSyncBaseUrl())?.trim();
    if (baseUrl == null || baseUrl.isEmpty) {
      return (ok: false, message: 'Sync server not configured.');
    }
    final apiKey = (await _secure.readSyncApiKey())?.trim();
    return testConnection(baseUrl: baseUrl, apiKey: apiKey);
  }

  /// Coalesce every caller onto one reconciliation round. Lifecycle hooks,
  /// mutation debounces, and manual sync can race; protocol idempotency makes
  /// duplicate requests safe, but serial execution is the stronger contract.
  Future<SyncRunResult> syncOnce() {
    final running = _inFlight;
    if (running != null) return running;

    late final Future<SyncRunResult> run;
    run = _syncOnce().whenComplete(() {
      if (identical(_inFlight, run)) _inFlight = null;
    });
    _inFlight = run;
    return run;
  }

  Future<SyncRunResult> _syncOnce() async {
    if (!await isConfigured()) {
      return (
        pushed: 0,
        pulled: 0,
        quarantined: 0,
        duplicates: 0,
        conflicts: 0,
        protocol: 0,
        error: 'Sync server not configured.',
      );
    }
    try {
      final baseUrl = (await _secure.readSyncBaseUrl())!.trim();
      final apiKey = (await _secure.readSyncApiKey())?.trim();
      final capabilities = await _capabilities(baseUrl, apiKey);
      var pushed = 0;
      var pulled = 0;
      var quarantined = 0;
      var duplicates = 0;
      var conflicts = 0;
      var protocol = capabilities.protocol;

      if (capabilities.protocol == 2) {
        final epoch = capabilities.epoch;
        if (epoch == null || epoch.isEmpty) {
          throw const SyncV2Exception(
            'Server selected sync v2 without a verified epoch.',
            code: 'missing_epoch',
          );
        }
        String? legacyClientId;
        int? legacyV1Cursor;
        final pendingLegacy = await (_db.select(
          _db.changeLog,
        )..where((row) => row.synced.equals(false))).get();
        if (pendingLegacy.isNotEmpty && capabilities.mode != 'preparing') {
          throw SyncV2Exception(
            '${pendingLegacy.length} legacy local change(s) were not drained '
            'before v2 activation.',
            code: 'legacy_cutover_blocked',
          );
        }
        final drainEpoch = await _db.kvGet(SyncV2Client.legacyDrainEpochKvKey);
        if (capabilities.mode == 'preparing' && drainEpoch != epoch) {
          // A durable v2 actor attests the legacy outbox only after every v1
          // push has succeeded and an inclusive pull reached the exact server
          // head. If the attestation request fails, the epoch marker remains
          // absent and the entire drain is retried on the next sync.
          final legacyPush = await pushPending();
          pushed += legacyPush.pushed;
          quarantined += legacyPush.quarantined;
          pulled += await pullChanges();
          final stillPending = await (_db.select(
            _db.changeLog,
          )..where((row) => row.synced.equals(false))).get();
          if (stillPending.isNotEmpty) {
            throw SyncV2Exception(
              '${stillPending.length} legacy local change(s) remain after drain.',
              code: 'legacy_drain_incomplete',
            );
          }
          legacyClientId = await _getClientId();
          legacyV1Cursor = _prefs.syncCursor;
        }
        final result = await _v2.sync(
          baseUrl: baseUrl,
          epoch: epoch,
          apiKey: apiKey,
          legacyClientId: legacyClientId,
          legacyV1Cursor: legacyV1Cursor,
        );
        pushed += result.pushed;
        pulled += result.pulled;
        quarantined += result.quarantined;
        duplicates += result.duplicates;
        conflicts += result.conflicts;
      } else {
        protocol = 1;
        final push = await pushPending();
        pushed = push.pushed;
        quarantined = push.quarantined;
        pulled = await pullChanges();
      }
      // WhatsApp-derived inbox candidates land on the server queue;
      // import them into the local SMS Inbox so the existing review
      // surface handles them. Failures here don't block the sync —
      // we'll retry on the next round.
      try {
        await pullWhatsappCandidates();
      } catch (e) {
        log.w('whatsapp candidate import failed: $e');
      }
      await _prefs.setSyncLastAt(DateTime.now().millisecondsSinceEpoch);
      // Persist a running total of quarantined (unsyncable) changes so the
      // signal survives pruneSynced and can be shown in Settings. Corruption is
      // near-impossible in practice, but if it happens the user must know a
      // change never left the device rather than silently diverging.
      if (quarantined > 0) {
        log.e('sync: quarantined $quarantined unsyncable change(s)');
        await _prefs.setSyncQuarantined(_prefs.syncQuarantined + quarantined);
      }
      await pruneSynced();
      return (
        pushed: pushed,
        pulled: pulled,
        quarantined: quarantined,
        duplicates: duplicates,
        conflicts: conflicts,
        protocol: protocol,
        error: null,
      );
    } catch (e) {
      log.w('sync failed: $e');
      return (
        pushed: 0,
        pulled: 0,
        quarantined: 0,
        duplicates: 0,
        conflicts: 0,
        protocol: 0,
        error: networkErrorMessage(e),
      );
    }
  }

  Future<({int protocol, String? mode, String? epoch})> _capabilities(
    String baseUrl,
    String? apiKey,
  ) async {
    try {
      final response = await _dio.get<Object?>(
        _join(baseUrl, '/v1/sync/capabilities'),
        options: Options(
          headers: {
            if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
            'accept': 'application/json',
            'connection': 'close',
          },
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      final data = response.data;
      if (data is! Map) {
        throw const SyncV2Exception('Invalid sync capabilities response.');
      }
      final preferred = data['preferredProtocol'];
      if (preferred == 1) return (protocol: 1, mode: null, epoch: null);
      if (preferred != 2) {
        throw SyncV2Exception(
          'Unsupported preferred sync protocol: $preferred.',
        );
      }
      final v2 = data['v2'];
      if (v2 is! Map) {
        throw const SyncV2Exception('Capabilities omitted v2 metadata.');
      }
      return (
        protocol: 2,
        mode: v2['mode'] as String?,
        epoch: v2['epoch'] as String?,
      );
    } on DioException catch (error) {
      // Servers predating negotiation are protocol-v1 only.
      if (error.response?.statusCode == 404) {
        return (protocol: 1, mode: null, epoch: null);
      }
      rethrow;
    }
  }

  /// Fetch any pending WhatsApp-derived expense candidates from the
  /// server, insert one local `sms_messages` row each (the Inbox UI
  /// already reads from there), and ack the server so it stops sending
  /// them. Idempotent — repeated calls won't double-insert because each
  /// row carries `androidId = 'whatsapp:<server id>'` and the same id
  /// is checked before insert. The phone is the source of truth for
  /// the review lifecycle (accepted / dismissed / duplicate); the
  /// server only owns delivery.
  Future<int> pullWhatsappCandidates() async {
    final baseUrl = (await _secure.readSyncBaseUrl())?.trim();
    final apiKey = (await _secure.readSyncApiKey())?.trim();
    if (baseUrl == null || baseUrl.isEmpty) return 0;
    final r = await _dio.get<dynamic>(
      _join(baseUrl, '/v1/whatsapp/inbox-candidates'),
      queryParameters: {'limit': 100},
      options: Options(
        headers: {
          if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
          'accept': 'application/json',
          'connection': 'close',
        },
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 15),
      ),
    );
    final data = r.data;
    if (data is! Map) return 0;
    final items = data['items'];
    if (items is! List || items.isEmpty) return 0;

    final ackIds = <String>[];
    for (final raw in items) {
      if (raw is! Map<String, dynamic>) continue;
      final id = raw['id'] as String?;
      if (id == null || id.isEmpty) continue;
      // 'whatsapp' (default) or 'sms' (iOS Shortcuts → /v1/sms/ingest). The
      // source namespaces the local dedupe id and drives the Inbox label.
      final source = (raw['source'] as String?)?.trim().isNotEmpty == true
          ? (raw['source'] as String).trim()
          : 'whatsapp';
      final androidId = '$source:$id';

      // Idempotency: skip if we've already imported this exact row.
      final existing =
          await (_db.select(_db.smsMessages)
                ..where((t) => t.androidId.equals(androidId))
                ..limit(1))
              .get();
      if (existing.isNotEmpty) {
        ackIds.add(id);
        continue;
      }

      final body = (raw['body'] as String?)?.trim() ?? '';
      if (body.isEmpty) {
        ackIds.add(id);
        continue;
      }
      final receivedAt =
          (raw['receivedAt'] as num?)?.toInt() ??
          DateTime.now().millisecondsSinceEpoch;
      final candidateJson = raw['candidateJson'] as String?;
      final pushName = (raw['pushName'] as String?)?.trim();
      final sourceUser = (raw['sourceUser'] as String?)?.trim();
      final label = source == 'sms' ? 'SMS' : 'WhatsApp';
      final who = (pushName != null && pushName.isNotEmpty)
          ? pushName
          : (sourceUser != null && sourceUser.isNotEmpty)
          ? sourceUser
          : null;
      final address = who != null ? '$label · $who' : label;

      await _db
          .into(_db.smsMessages)
          .insert(
            SmsMessagesCompanion.insert(
              androidId: Value(androidId),
              address: address,
              body: body,
              receivedAt: receivedAt,
              classifiedAs: const Value('transactional'),
              parserVersion: const Value(1),
              candidateJson: Value(candidateJson),
              candidateStatus: const Value('inbox'),
            ),
          );
      ackIds.add(id);
    }

    if (ackIds.isNotEmpty) {
      try {
        await _dio.post<dynamic>(
          _join(baseUrl, '/v1/whatsapp/inbox-candidates/ack'),
          data: {'ids': ackIds},
          options: Options(
            headers: {
              if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
              'content-type': 'application/json',
              'accept': 'application/json',
              'connection': 'close',
            },
            connectTimeout: const Duration(seconds: 5),
            receiveTimeout: const Duration(seconds: 10),
          ),
        );
      } catch (e) {
        // If the ack fails we'll get the same rows again next sync —
        // the local idempotency check will skip the re-imports.
        log.w('whatsapp candidate ack failed: $e');
      }
    }
    return ackIds.length;
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
            'connection': 'close',
          },
          connectTimeout: const Duration(seconds: 5),
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
      var allApplied = true;
      for (final change in changes) {
        if (change is Map<String, dynamic>) {
          final ok = await _applier.apply(change);
          if (!ok) allApplied = false;
        }
      }
      pulled += changes.length;
      // Only advance the cursor when every change in the page applied. A
      // failed (transient) change leaves the cursor in place so the page is
      // retried next sync; re-applying the succeeded changes is safe because
      // applies are idempotent (last-write-wins / upsert by id).
      if (!allApplied) {
        log.w('sync: page had apply failures; holding cursor for retry');
        break;
      }
      await _prefs.setSyncCursor(nextCursor);
      if (changes.length < 500) break;
    }
    return pulled;
  }

  /// Pushes unsynced change-log rows. Returns the count actually sent and the
  /// count quarantined (locally-corrupt rows that can never be pushed — see the
  /// decode guard below). Quarantined is surfaced up so the user learns a
  /// change couldn't sync instead of it vanishing silently.
  Future<({int pushed, int quarantined})> pushPending() async {
    final baseUrl = (await _secure.readSyncBaseUrl())?.trim();
    final apiKey = (await _secure.readSyncApiKey())?.trim();
    if (baseUrl == null || baseUrl.isEmpty) return (pushed: 0, quarantined: 0);

    final clientId = await _getClientId();
    var pushed = 0;
    var quarantined = 0;
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

      // Decode each row's payload defensively. A change_log payload is written
      // by us via jsonEncode, so a decode failure means the local row is
      // corrupt — it can never be pushed. Quarantine it (mark synced) so a
      // single bad row can't throw out of the batch and wedge every future
      // push forever.
      final changes = <Map<String, dynamic>>[];
      final sentIds = <int>[];
      final corruptIds = <int>[];
      for (final row in batch) {
        dynamic payload;
        if (row.payload != null) {
          try {
            payload = jsonDecode(row.payload!);
          } catch (e) {
            log.w(
              'sync: corrupt local change_log payload id=${row.id}; '
              'quarantining: $e',
            );
            corruptIds.add(row.id);
            continue;
          }
        }
        changes.add({
          'clientChangeId': row.clientChangeId,
          'resource': row.resource,
          'resourceId': row.resourceId,
          'op': row.op,
          // ignore: use_null_aware_elements
          if (payload != null) 'payload': payload,
        });
        sentIds.add(row.id);
      }

      // Retire corrupt rows regardless of the network outcome so they leave the
      // unsynced set and the loop can make progress.
      if (corruptIds.isNotEmpty) {
        await (_db.update(_db.changeLog)..where((t) => t.id.isIn(corruptIds)))
            .write(const ChangeLogCompanion(synced: Value(true)));
        quarantined += corruptIds.length;
      }

      if (changes.isNotEmpty) {
        final url = _join(baseUrl, '/v1/sync/push');
        await _dio.post<dynamic>(
          url,
          data: {'clientId': clientId, 'changes': changes},
          options: Options(
            headers: {
              if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
              'content-type': 'application/json',
              'accept': 'application/json',
              'connection': 'close',
            },
            connectTimeout: const Duration(seconds: 5),
            sendTimeout: const Duration(seconds: 20),
            receiveTimeout: const Duration(seconds: 30),
          ),
        );

        // Only mark rows synced after the POST returns non-error (Dio throws on
        // non-2xx, which propagates and leaves them unsynced for retry).
        await (_db.update(_db.changeLog)..where((t) => t.id.isIn(sentIds)))
            .write(const ChangeLogCompanion(synced: Value(true)));
        pushed += sentIds.length;
      }
    }
    return (pushed: pushed, quarantined: quarantined);
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
