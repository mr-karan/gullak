import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/build_info.dart';
import '../core/secure_store.dart';
import '../data/db/database.dart';
import 'crdt.dart';
import 'crdt_checkpoint.dart';
import 'crdt_store.dart';

final class SyncV2Exception implements Exception {
  const SyncV2Exception(this.message, {this.code, this.retryable = false});

  final String message;
  final String? code;
  final bool retryable;

  @override
  String toString() =>
      'SyncV2Exception${code == null ? '' : ' ($code)'}: $message';
}

final class SyncV2Stats {
  const SyncV2Stats({
    required this.pushed,
    required this.pulled,
    required this.duplicates,
    required this.quarantined,
    required this.conflicts,
    required this.cursor,
  });

  final int pushed;
  final int pulled;
  final int duplicates;
  final int quarantined;
  final int conflicts;
  final int cursor;
}

/// Protocol-v2 transport. Correctness state and cursors live in Drift; secure
/// storage contains only the per-actor bearer credential.
final class SyncV2Client {
  SyncV2Client(
    this._db,
    this._secure,
    this._store, {
    Dio? dio,
    Uuid uuid = const Uuid(),
  }) : _dio = dio ?? Dio(),
       _uuid = uuid;

  static const _actorKvKey = 'sync.v2.actorId';
  static const legacyDrainEpochKvKey = 'sync.v2.legacyDrainEpoch';
  static const _batchSize = 200;

  final AppDatabase _db;
  final SecureStore _secure;
  final CrdtStore _store;
  final Dio _dio;
  final Uuid _uuid;

  Future<SyncV2Stats> sync({
    required String baseUrl,
    required String epoch,
    String? apiKey,
    String? legacyClientId,
    int? legacyV1Cursor,
  }) async {
    if ((legacyClientId == null) != (legacyV1Cursor == null)) {
      throw ArgumentError(
        'legacyClientId and legacyV1Cursor must be supplied together',
      );
    }
    var actorId = await _actorId();
    var token = await _secure.readSyncActorToken(actorId);
    if (token == null) {
      final registered = await _register(
        baseUrl: baseUrl,
        apiKey: apiKey,
        actorId: actorId,
        legacyClientId: legacyClientId,
      );
      actorId = registered.actorId;
      token = registered.token;
    }

    var state = await _replicaState();
    if (state?.epoch != null && state!.epoch != epoch) {
      // Dots and changeIds are globally unique, including across epochs. A
      // checkpoint for a new epoch intentionally starts a fresh causal graph,
      // so reusing this actor at sequence one would collide with retained old
      // history. Rotate identity only after every old-epoch local fact is
      // durably accepted; otherwise recovery must be explicit.
      if (await _hasLocalV2State(actorId)) {
        throw const SyncV2Exception(
          'A new sync epoch is available, but this replica still has '
          'unresolved changes from the previous epoch.',
          code: 'epoch_cutover_blocked',
        );
      }
      actorId = _uuid.v4();
      await _db.kvSet(_actorKvKey, actorId);
      final registered = await _register(
        baseUrl: baseUrl,
        apiKey: apiKey,
        actorId: actorId,
        legacyClientId: legacyClientId,
      );
      actorId = registered.actorId;
      token = registered.token;
    }
    if (state?.epoch != epoch || state?.actorId != actorId) {
      state = await _bootstrap(
        baseUrl: baseUrl,
        apiKey: apiKey,
        actorId: actorId,
        actorToken: token,
        epoch: epoch,
      );
    }

    final push = await _pushPending(
      baseUrl: baseUrl,
      apiKey: apiKey,
      actorId: actorId,
      actorToken: token,
      epoch: epoch,
    );
    CrdtRemotePageResult pull;
    try {
      pull = await _pullAll(
        baseUrl: baseUrl,
        apiKey: apiKey,
        actorId: actorId,
        actorToken: token,
        epoch: epoch,
      );
    } on DioException catch (error) {
      if (error.response?.statusCode != 409 ||
          _errorCode(error.response?.data) != 'reset_required') {
        rethrow;
      }
      // A corrupt/ahead/pruned cursor is repaired from a verified checkpoint,
      // never by manufacturing cursor zero over existing state. The installer
      // refuses while any local change is unresolved.
      await _bootstrap(
        baseUrl: baseUrl,
        apiKey: apiKey,
        actorId: actorId,
        actorToken: token,
        epoch: epoch,
      );
      pull = await _pullAll(
        baseUrl: baseUrl,
        apiKey: apiKey,
        actorId: actorId,
        actorToken: token,
        epoch: epoch,
      );
    }
    state = await _requireReplica();
    await _ack(
      baseUrl: baseUrl,
      apiKey: apiKey,
      actorId: actorId,
      actorToken: token,
      state: state,
    );
    if (legacyClientId != null && legacyV1Cursor != null) {
      await _attestLegacyDrain(
        baseUrl: baseUrl,
        apiKey: apiKey,
        actorId: actorId,
        actorToken: token,
        epoch: epoch,
        legacyClientId: legacyClientId,
        v1Cursor: legacyV1Cursor,
      );
      await _db.kvSet(legacyDrainEpochKvKey, epoch);
    }
    return SyncV2Stats(
      pushed: push.accepted,
      pulled: pull.accepted,
      duplicates: push.duplicates + pull.duplicates,
      quarantined: pull.quarantined,
      conflicts: pull.conflicts.length,
      cursor: state.pullCursor,
    );
  }

  Future<SyncReplicaStateRow> _bootstrap({
    required String baseUrl,
    required String? apiKey,
    required String actorId,
    required String actorToken,
    required String epoch,
  }) async {
    final response = await _dio.get<Object?>(
      _join(baseUrl, '/v1/sync/v2/bootstrap'),
      queryParameters: {'actorId': actorId},
      options: _options(apiKey: apiKey, actorToken: actorToken),
    );
    final bundle = CrdtBootstrapBundle.fromJson(response.data);
    if (bundle.epoch != epoch) {
      throw SyncV2Exception(
        'server bootstrap epoch ${bundle.epoch} does not match $epoch',
        code: 'reset_required',
      );
    }
    return CrdtCheckpointInstaller(
      _db,
      _store,
    ).install(bundle, actorId: actorId);
  }

  Future<({String actorId, String token})> _register({
    required String baseUrl,
    required String? apiKey,
    required String actorId,
    String? legacyClientId,
  }) async {
    var candidate = actorId;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        final response = await _dio.post<Object?>(
          _join(baseUrl, '/v1/sync/v2/register'),
          data: {
            'actorId': candidate,
            'appVersion': buildVersion,
            'platform': Platform.operatingSystem,
            'legacyClientId': ?legacyClientId,
          },
          options: _options(apiKey: apiKey),
        );
        final body = _object(response.data, 'register response');
        final returnedActor = _string(body, 'actorId');
        final token = _string(body, 'actorToken');
        if (returnedActor != candidate || token.length < 32) {
          throw const SyncV2Exception(
            'server returned an invalid actor credential',
            code: 'invalid_registration',
          );
        }
        // Persist immediately: the server never reveals this token again.
        await _db.kvSet(_actorKvKey, candidate);
        await _secure.writeSyncActorCredential(
          actorId: candidate,
          actorToken: token,
        );
        return (actorId: candidate, token: token);
      } on DioException catch (error) {
        final code = _errorCode(error.response?.data);
        if (error.response?.statusCode != 409 ||
            code != 'actor_already_registered' ||
            attempt != 0) {
          rethrow;
        }
        // A registration response may have been lost after the server commit.
        // It is safe to abandon that actor only if it has no durable local
        // facts. Once it has authored an event, silently changing identity
        // would strand that event chain and is therefore forbidden.
        if (await _hasLocalV2State(candidate)) {
          throw const SyncV2Exception(
            'This replica lost its actor credential after authoring changes. '
            'Local recovery is required; the actor cannot be replaced silently.',
            code: 'actor_credential_lost',
          );
        }
        candidate = _uuid.v4();
        await _db.kvSet(_actorKvKey, candidate);
      }
    }
    throw const SyncV2Exception('actor registration did not complete');
  }

  Future<({int accepted, int duplicates})> _pushPending({
    required String baseUrl,
    required String? apiKey,
    required String actorId,
    required String actorToken,
    required String epoch,
  }) async {
    var accepted = 0;
    var duplicates = 0;
    while (true) {
      final rows =
          await (_db.select(_db.syncChanges)
                ..where((row) => row.outboxState.equals('pending'))
                ..orderBy([(row) => OrderingTerm.asc(row.sequence)])
                ..limit(_batchSize))
              .get();
      if (rows.isEmpty) break;
      if (rows.any((row) => row.actorId != actorId || row.epoch != epoch)) {
        throw const SyncV2Exception(
          'pending outbox contains another actor or epoch',
          code: 'outbox_identity_mismatch',
        );
      }
      final response = await _dio.post<Object?>(
        _join(baseUrl, '/v1/sync/v2/push'),
        data: {
          'actorId': actorId,
          'appVersion': buildVersion,
          'platform': Platform.operatingSystem,
          'epoch': epoch,
          'changes': rows.map((row) => jsonDecode(row.envelopeJson)).toList(),
        },
        options: _options(apiKey: apiKey, actorToken: actorToken),
      );
      final body = _object(response.data, 'push response');
      final results = body['results'];
      if (results is! List || results.length != rows.length) {
        throw const SyncV2Exception(
          'push response did not account for every change',
          code: 'invalid_push_response',
        );
      }
      SyncV2Exception? blocked;
      await _db.transaction(() async {
        for (var index = 0; index < rows.length; index++) {
          if (blocked != null) break;
          final row = rows[index];
          final item = _object(results[index], 'push result');
          if (item['changeId'] != row.changeId) {
            throw const SyncV2Exception(
              'push response changeId mismatch',
              code: 'invalid_push_response',
            );
          }
          final result = _object(item['result'], 'push result detail');
          final status = _string(result, 'status');
          if (status == 'accepted' || status == 'duplicate') {
            final cursor = result['transportCursor'];
            if (cursor is! int || cursor < 1) {
              throw const SyncV2Exception(
                'accepted push result has no cursor',
                code: 'invalid_push_response',
              );
            }
            await (_db.update(
              _db.syncChanges,
            )..where((change) => change.changeId.equals(row.changeId))).write(
              SyncChangesCompanion(
                outboxState: const Value('accepted'),
                serverCursor: Value(cursor),
                acceptedAt: Value(DateTime.now().millisecondsSinceEpoch),
              ),
            );
            status == 'accepted' ? accepted++ : duplicates++;
            continue;
          }
          final code = result['code']?.toString() ?? status;
          final reason =
              result['reason']?.toString() ?? 'server refused change';
          if (status == 'gap' || status == 'dependency_gap') {
            blocked = SyncV2Exception(reason, code: code, retryable: true);
            continue;
          }
          await (_db.update(
            _db.syncChanges,
          )..where((change) => change.changeId.equals(row.changeId))).write(
            SyncChangesCompanion(
              outboxState: const Value('rejected'),
              rejectedAt: Value(DateTime.now().millisecondsSinceEpoch),
              rejectionCode: Value(code),
              rejectionReason: Value(reason),
            ),
          );
          blocked = SyncV2Exception(
            'Server rejected ${row.changeId}: $reason. The local causal chain '
            'is preserved and sync is blocked pending explicit recovery.',
            code: code,
          );
        }
      });
      if (blocked != null) throw blocked!;
      if (rows.length < _batchSize) break;
    }
    return (accepted: accepted, duplicates: duplicates);
  }

  Future<CrdtRemotePageResult> _pullAll({
    required String baseUrl,
    required String? apiKey,
    required String actorId,
    required String actorToken,
    required String epoch,
  }) async {
    var accepted = 0;
    var duplicates = 0;
    var quarantined = 0;
    final conflicts = <CrdtConflictSummary>[];
    var cursor = (await _requireReplica()).pullCursor;
    while (true) {
      final response = await _dio.get<Object?>(
        _join(baseUrl, '/v1/sync/v2/changes'),
        queryParameters: {
          'epoch': epoch,
          'after': cursor,
          'limit': 500,
          'actorId': actorId,
        },
        options: _options(apiKey: apiKey, actorToken: actorToken),
      );
      final body = _object(response.data, 'pull response');
      if (body['epoch'] != epoch || body['after'] != cursor) {
        throw const SyncV2Exception(
          'pull response epoch or starting cursor mismatch',
          code: 'invalid_pull_response',
        );
      }
      final nextCursor = body['cursor'];
      final rawChanges = body['changes'];
      if (nextCursor is! int || nextCursor < cursor || rawChanges is! List) {
        throw const SyncV2Exception(
          'pull response cursor or changes is invalid',
          code: 'invalid_pull_response',
        );
      }
      final remote = <RemoteCrdtChange>[];
      for (final raw in rawChanges) {
        final item = _object(raw, 'remote change');
        final itemCursor = item['cursor'];
        final envelopeRaw = item['envelope'];
        final expectedHash = item['contentHash'];
        if (itemCursor is! int ||
            itemCursor <= cursor ||
            itemCursor > nextCursor ||
            expectedHash is! String ||
            envelopeRaw is! Map) {
          throw const SyncV2Exception(
            'remote change metadata is invalid',
            code: 'invalid_pull_response',
          );
        }
        final envelope = ChangeEnvelope.fromJson(
          Map<String, Object?>.from(envelopeRaw),
        );
        final actualHash = sha256
            .convert(utf8.encode(envelope.canonicalJson()))
            .toString();
        if (actualHash != expectedHash) {
          throw const SyncV2Exception(
            'remote change content hash mismatch',
            code: 'invalid_pull_response',
          );
        }
        remote.add(
          RemoteCrdtChange(envelope: envelope, serverCursor: itemCursor),
        );
      }
      if (remote.isEmpty && nextCursor != cursor) {
        throw const SyncV2Exception(
          'server advanced an empty pull page',
          code: 'invalid_pull_response',
        );
      }
      final page = await _store.integrateRemotePage(
        changes: remote,
        nextCursor: nextCursor,
      );
      accepted += page.accepted;
      duplicates += page.duplicates;
      quarantined += page.quarantined;
      conflicts.addAll(page.conflicts);
      cursor = nextCursor;
      if (body['hasMore'] != true) break;
      if (remote.isEmpty) {
        throw const SyncV2Exception(
          'server returned hasMore without a page',
          code: 'invalid_pull_response',
        );
      }
    }
    return CrdtRemotePageResult(
      accepted: accepted,
      duplicates: duplicates,
      quarantined: quarantined,
      pullCursor: cursor,
      conflicts: List.unmodifiable(conflicts),
    );
  }

  Future<void> _attestLegacyDrain({
    required String baseUrl,
    required String? apiKey,
    required String actorId,
    required String actorToken,
    required String epoch,
    required String legacyClientId,
    required int v1Cursor,
  }) async {
    await _dio.post<Object?>(
      _join(baseUrl, '/v1/sync/v2/legacy-drain'),
      data: {
        'actorId': actorId,
        'appVersion': buildVersion,
        'platform': Platform.operatingSystem,
        'epoch': epoch,
        'legacyClientId': legacyClientId,
        'v1Cursor': v1Cursor,
        'pendingOutboxCount': 0,
      },
      options: _options(apiKey: apiKey, actorToken: actorToken),
    );
  }

  Future<void> _ack({
    required String baseUrl,
    required String? apiKey,
    required String actorId,
    required String actorToken,
    required SyncReplicaStateRow state,
  }) async {
    final frontierRows = await (_db.select(
      _db.syncFrontiers,
    )..where((row) => row.epoch.equals(state.epoch!))).get();
    final frontier = <String, int>{
      for (final row in frontierRows)
        if (row.contiguousSequence > 0) row.actorId: row.contiguousSequence,
    };
    await _dio.post<Object?>(
      _join(baseUrl, '/v1/sync/v2/ack'),
      data: {
        'actorId': actorId,
        'appVersion': buildVersion,
        'platform': Platform.operatingSystem,
        'epoch': state.epoch,
        'cursor': state.pullCursor,
        'frontier': frontier,
        if (state.checkpointId != null) 'checkpointId': state.checkpointId,
      },
      options: _options(apiKey: apiKey, actorToken: actorToken),
    );
  }

  Future<String> _actorId() async {
    final stored = await _db.kvGet(_actorKvKey);
    if (stored != null && stored.isNotEmpty) return stored;
    final actor = _uuid.v4();
    await _db.kvSet(_actorKvKey, actor);
    return actor;
  }

  Future<bool> _hasLocalV2State(String actorId) async {
    final rows = await (_db.select(
      _db.syncChanges,
    )..where((row) => row.actorId.equals(actorId))).get();
    return rows.any(
      (row) =>
          row.outboxState == 'pending' ||
          row.outboxState == 'rejected' ||
          row.serverCursor == null,
    );
  }

  Future<SyncReplicaStateRow?> _replicaState() => (_db.select(
    _db.syncReplicaState,
  )..where((row) => row.id.equals(1))).getSingleOrNull();

  Future<SyncReplicaStateRow> _requireReplica() async {
    final state = await _replicaState();
    if (state?.epoch == null) {
      throw const SyncV2Exception('CRDT replica is not bootstrapped');
    }
    return state!;
  }

  static Options _options({String? apiKey, String? actorToken}) => Options(
    headers: {
      if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
      if (actorToken?.isNotEmpty == true) 'x-sync-actor-token': actorToken,
      'accept': 'application/json',
      'content-type': 'application/json',
      'connection': 'close',
    },
    connectTimeout: const Duration(seconds: 8),
    sendTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 45),
  );

  static Map<String, Object?> _object(Object? value, String name) {
    if (value is! Map) throw SyncV2Exception('$name must be an object');
    return Map<String, Object?>.from(value);
  }

  static String _string(Map<String, Object?> value, String key) {
    final result = value[key];
    if (result is! String || result.isEmpty) {
      throw SyncV2Exception('$key must be a non-empty string');
    }
    return result;
  }

  static String? _errorCode(Object? value) {
    if (value is! Map) return null;
    final error = value['error'];
    return error is String ? error : null;
  }

  static String _join(String baseUrl, String path) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return '$base$path';
  }
}
