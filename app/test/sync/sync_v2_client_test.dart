import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/core/secure_store.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/sync/crdt.dart';
import 'package:gullak/sync/crdt_store.dart';
import 'package:gullak/sync/sync_v2_client.dart';

void main() {
  late AppDatabase db;
  late SecureStore secure;
  late CrdtStore store;
  late _V2Dio dio;
  late SyncV2Client client;

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    db = AppDatabase.forTesting(NativeDatabase.memory());
    secure = SecureStore();
    store = CrdtStore(db, nowMs: () => 1000);
    dio = _V2Dio();
    client = SyncV2Client(db, secure, store, dio: dio);
    await db.kvSet('sync.v2.actorId', 'phone');
  });

  tearDown(() => db.close());

  test(
    'registers, installs empty checkpoint and acknowledges exact state',
    () async {
      final result = await client.sync(
        baseUrl: 'http://server',
        epoch: 'epoch',
      );
      expect(result.cursor, 0);
      expect(dio.registerCalls, 1);
      expect(dio.bootstrapCalls, 1);
      expect(dio.acks.single, {
        'actorId': 'phone',
        'appVersion': isA<String>(),
        'platform': isA<String>(),
        'epoch': 'epoch',
        'cursor': 0,
        'frontier': <String, int>{},
        'checkpointId': 'epoch:genesis',
      });
      expect(
        await secure.readSyncActorToken('phone'),
        'token-value-32-bytes-minimum-xxxxxxxx',
      );
    },
  );

  test(
    'accepted local event is echoed and retired by exact identity',
    () async {
      await client.sync(baseUrl: 'http://server', epoch: 'epoch');
      final envelope = await store.authorLocalChange(
        ops: [
          AssignOp(
            resource: 'accounts',
            entityId: 'a1',
            field: r'$exists',
            value: true,
          ),
          for (final entry in <String, Object?>{
            'name': 'Checking',
            'kind': 'checking',
            'openingBalanceCents': 0,
            'onBudget': true,
            'archived': false,
            'sortOrder': 0,
            'createdAt': 1,
            'updatedAt': 1,
          }.entries)
            AssignOp(
              resource: 'accounts',
              entityId: 'a1',
              field: entry.key,
              value: entry.value,
            ),
        ],
      );
      dio.echo = envelope;

      final result = await client.sync(
        baseUrl: 'http://server',
        epoch: 'epoch',
      );
      expect(result.pushed, 1);
      expect(result.duplicates, 1);
      expect(result.cursor, 1);
      final row = await db.select(db.syncChanges).getSingle();
      expect(row.outboxState, 'accepted');
      expect(row.serverCursor, 1);
      expect(dio.acks.last['frontier'], {'phone': 1});
    },
  );

  test('replays pre-bootstrap field commands over the checkpoint', () async {
    await db
        .into(db.syncPendingCommands)
        .insert(
          SyncPendingCommandsCompanion.insert(
            commandId: 'offline-1',
            opsJson: jsonEncode([
              {
                'kind': 'assign',
                'resource': 'accounts',
                'entityId': 'offline-account',
                'field': r'$exists',
                'value': true,
              },
              for (final entry in <String, Object?>{
                'name': 'Offline account',
                'kind': 'checking',
                'openingBalanceCents': 0,
                'onBudget': true,
                'archived': false,
                'sortOrder': 0,
                'createdAt': 1,
                'updatedAt': 1,
              }.entries)
                {
                  'kind': 'assign',
                  'resource': 'accounts',
                  'entityId': 'offline-account',
                  'field': entry.key,
                  'value': entry.value,
                },
            ]),
            createdAt: 1,
          ),
        );

    final result = await client.sync(baseUrl: 'http://server', epoch: 'epoch');

    expect(result.pushed, 1);
    expect(await db.select(db.syncPendingCommands).get(), isEmpty);
    expect((await db.select(db.accounts).getSingle()).name, 'Offline account');
    expect((await db.select(db.syncChanges).getSingle()).actorId, 'phone');
  });

  test(
    'permanent push rejection is durable and blocks the actor chain',
    () async {
      await client.sync(baseUrl: 'http://server', epoch: 'epoch');
      await store.authorLocalChange(
        ops: [
          AssignOp(
            resource: 'accounts',
            entityId: 'bad',
            field: r'$exists',
            value: true,
          ),
          for (final entry in <String, Object?>{
            'name': 'Rejected locally-valid row',
            'kind': 'checking',
            'openingBalanceCents': 0,
            'onBudget': true,
            'archived': false,
            'sortOrder': 0,
            'createdAt': 1,
            'updatedAt': 1,
          }.entries)
            AssignOp(
              resource: 'accounts',
              entityId: 'bad',
              field: entry.key,
              value: entry.value,
            ),
        ],
      );
      dio.rejectPush = true;

      await expectLater(
        client.sync(baseUrl: 'http://server', epoch: 'epoch'),
        throwsA(
          isA<SyncV2Exception>().having(
            (error) => error.code,
            'code',
            'invalid_projection',
          ),
        ),
      );
      final row = await db.select(db.syncChanges).getSingle();
      expect(row.outboxState, 'rejected');
      expect(row.rejectionCode, 'invalid_projection');
    },
  );

  test(
    'a cursor ahead of server is repaired through verified bootstrap',
    () async {
      await client.sync(baseUrl: 'http://server', epoch: 'epoch');
      await (db.update(db.syncReplicaState)..where((row) => row.id.equals(1)))
          .write(const SyncReplicaStateCompanion(pullCursor: Value(99)));
      dio.resetPullOnce = true;

      final result = await client.sync(
        baseUrl: 'http://server',
        epoch: 'epoch',
      );

      expect(result.cursor, 0);
      expect(dio.bootstrapCalls, 2);
      expect((await db.select(db.syncReplicaState).getSingle()).pullCursor, 0);
    },
  );

  test(
    'a new epoch rotates actor identity instead of reusing its dot',
    () async {
      await client.sync(baseUrl: 'http://server', epoch: 'epoch');
      dio.serverEpoch = 'epoch-2';

      await client.sync(baseUrl: 'http://server', epoch: 'epoch-2');

      final state = await db.select(db.syncReplicaState).getSingle();
      expect(state.epoch, 'epoch-2');
      expect(state.actorId, isNot('phone'));
      expect(state.nextSequence, 1);
      expect(dio.registerCalls, 2);
    },
  );
}

final class _V2Dio implements Dio {
  int registerCalls = 0;
  int bootstrapCalls = 0;
  bool rejectPush = false;
  bool resetPullOnce = false;
  String serverEpoch = 'epoch';
  ChangeEnvelope? echo;
  final List<Map<String, Object?>> acks = [];
  final List<Map<String, Object?>> registrations = [];

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Options? options,
    Object? queryParameters,
    CancelToken? cancelToken,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    if (path.endsWith('/register')) {
      registerCalls++;
      final registration = Map<String, Object?>.from(data! as Map);
      registrations.add(registration);
      final actorId = registration['actorId']! as String;
      return _response<T>(path, {
        'protocol': 2,
        'epoch': serverEpoch,
        'actorId': actorId,
        'actorToken': 'token-value-32-bytes-minimum-xxxxxxxx',
      });
    }
    if (path.endsWith('/push')) {
      final changes = (data as Map)['changes']! as List;
      final envelope = Map<String, Object?>.from(changes.single as Map);
      if (rejectPush) {
        return _response<T>(path, {
          'results': [
            {
              'changeId': envelope['changeId'],
              'result': {
                'status': 'rejected',
                'code': 'invalid_projection',
                'reason': 'test rejection',
                'transportCursor': null,
                'conflicts': <Object?>[],
              },
            },
          ],
        });
      }
      return _response<T>(path, {
        'results': [
          {
            'changeId': envelope['changeId'],
            'result': {
              'status': 'accepted',
              'transportCursor': 1,
              'conflicts': <Object?>[],
            },
          },
        ],
      });
    }
    if (path.endsWith('/ack')) {
      acks.add(Map<String, Object?>.from(data! as Map));
      return _response<T>(path, {'acknowledged': (data as Map)['cursor']});
    }
    throw UnimplementedError(path);
  }

  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Options? options,
    Map<String, dynamic>? queryParameters,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) async {
    if (path.endsWith('/bootstrap')) {
      bootstrapCalls++;
      return _response<T>(path, _emptyBootstrap(serverEpoch));
    }
    if (path.endsWith('/changes')) {
      final after = queryParameters!['after'] as int;
      if (resetPullOnce) {
        resetPullOnce = false;
        throw DioException(
          requestOptions: RequestOptions(path: path),
          response: Response<Object?>(
            requestOptions: RequestOptions(path: path),
            statusCode: 409,
            data: const {
              'error': 'reset_required',
              'reason': 'cursor_ahead_of_server',
            },
          ),
        );
      }
      final event = echo;
      if (event == null || after >= 1) {
        return _response<T>(path, {
          'epoch': serverEpoch,
          'after': after,
          'cursor': after,
          'hasMore': false,
          'changes': <Object?>[],
        });
      }
      return _response<T>(path, {
        'epoch': serverEpoch,
        'after': after,
        'cursor': 1,
        'hasMore': false,
        'changes': [
          {
            'cursor': 1,
            'contentHash': sha256
                .convert(utf8.encode(event.canonicalJson()))
                .toString(),
            'envelope': event.toJson(),
          },
        ],
      });
    }
    throw UnimplementedError(path);
  }

  Response<T> _response<T>(String path, Object value) => Response<T>(
    requestOptions: RequestOptions(path: path),
    data: value as T,
    statusCode: 200,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
    '${invocation.memberName} is not implemented by _V2Dio',
  );
}

Map<String, Object?> _emptyBootstrap(String epoch) {
  final projectionHash = sha256
      .convert(
        utf8.encode(
          encodeCanonicalJson([
            for (final resource in const [
              'accounts',
              'budgets',
              'categories',
              'category_groups',
              'payees',
              'recurrences',
              'tags',
              'transaction_tags',
              'transactions',
            ])
              {
                'resource': resource,
                'lifecycle': resource == 'transaction_tags'
                    ? r'$member'
                    : r'$exists',
                'entities': <Object?>[],
              },
          ]),
        ),
      )
      .toString();
  final body = {
    'epoch': epoch,
    'schemaVersion': 1,
    'frontier': <String, int>{},
    'registers': <Object?>[],
    'projectionHash': projectionHash,
    'creationCursor': 0,
    'eventCount': 0,
    'isGenesis': true,
  };
  return {
    'protocol': 2,
    'epoch': epoch,
    'checkpoint': {
      'id': '$epoch:genesis',
      'epoch': epoch,
      'schemaVersion': 1,
      'frontier': <String, int>{},
      'registers': <Object?>[],
      'projectionHash': projectionHash,
      'contentHash': sha256
          .convert(utf8.encode(encodeCanonicalJson(body)))
          .toString(),
      'cursor': 0,
      'eventCount': 0,
      'isGenesis': true,
      'createdAt': 1,
    },
    'changesThroughCheckpoint': <Object?>[],
  };
}
