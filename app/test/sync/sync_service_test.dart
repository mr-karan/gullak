import 'dart:async';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/core/prefs.dart';
import 'package:gullak/core/secure_store.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/sync/remote_applier.dart';
import 'package:gullak/sync/sync_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Records pushed bodies and replays canned pull pages so we can assert
/// SyncService's batching, quarantine, and cursor behaviour without a network.
class _FakeDio implements Dio {
  final List<Map<String, dynamic>> pushedBodies = [];
  List<Map<String, dynamic>> pullPages = [];
  int _pull = 0;

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
    pushedBodies.add(data as Map<String, dynamic>);
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      data: {'applied': (data['changes'] as List).length} as T,
      statusCode: 200,
    );
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
    if (path.endsWith('/v1/sync/capabilities')) {
      return Response<T>(
        requestOptions: RequestOptions(path: path),
        data:
            {
                  'preferredProtocol': 1,
                  'supportedProtocols': [1, 2],
                }
                as T,
        statusCode: 200,
      );
    }
    final page = _pull < pullPages.length
        ? pullPages[_pull]
        : {'changes': <dynamic>[], 'cursor': queryParameters?['since'] ?? 0};
    _pull++;
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      data: page as T,
      statusCode: 200,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
    '${invocation.memberName} not stubbed in _FakeDio',
  );
}

void main() {
  late AppDatabase db;
  late SecureStore secure;
  late Prefs prefs;
  late _FakeDio dio;
  late SyncService sync;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({
      'gullak.sync.baseUrl': 'http://server.test',
      'gullak.sync.apiKey': 'k',
    });
    db = AppDatabase.forTesting(NativeDatabase.memory());
    secure = SecureStore();
    prefs = await Prefs.load();
    dio = _FakeDio();
    sync = SyncService(db, secure, prefs, RemoteApplier(db), dio: dio);
  });
  tearDown(() => db.close());

  Future<void> insertChange({
    required String ccid,
    required String resource,
    required String resourceId,
    String op = 'upsert',
    String? payload,
    bool synced = false,
  }) => db
      .into(db.changeLog)
      .insert(
        ChangeLogCompanion.insert(
          at: DateTime.now().millisecondsSinceEpoch,
          clientChangeId: Value(ccid),
          resource: resource,
          resourceId: resourceId,
          op: op,
          payload: Value(payload),
          synced: Value(synced),
        ),
      );

  test('pushPending sends unsynced rows and marks them synced', () async {
    await insertChange(
      ccid: 'c1',
      resource: 'accounts',
      resourceId: 'a1',
      payload: '{"id":"a1","updatedAt":1}',
    );
    final pushed = await sync.pushPending();
    expect(pushed.pushed, 1);
    expect(pushed.quarantined, 0);
    expect(dio.pushedBodies.single['changes'], hasLength(1));
    final remaining = await (db.select(
      db.changeLog,
    )..where((t) => t.synced.equals(false))).get();
    expect(remaining, isEmpty);
  });

  test(
    'a corrupt payload row is quarantined, not blocking the good rows',
    () async {
      await insertChange(
        ccid: 'bad',
        resource: 'accounts',
        resourceId: 'a1',
        payload: '{not json',
      );
      await insertChange(
        ccid: 'good',
        resource: 'accounts',
        resourceId: 'a2',
        payload: '{"id":"a2","updatedAt":1}',
      );
      final pushed = await sync.pushPending();
      // Only the good row is sent; the corrupt one is quarantined + counted.
      expect(pushed.pushed, 1);
      expect(pushed.quarantined, 1);
      final sentCcids = (dio.pushedBodies.single['changes'] as List)
          .map((c) => (c as Map)['clientChangeId'])
          .toList();
      expect(sentCcids, ['good']);
      // ...and neither row is left blocking the unsynced queue.
      final remaining = await (db.select(
        db.changeLog,
      )..where((t) => t.synced.equals(false))).get();
      expect(remaining, isEmpty);
    },
  );

  test('pushPending marks nothing synced when the POST throws', () async {
    dio = _FakeDio();
    final throwingDio = _ThrowingDio();
    sync = SyncService(db, secure, prefs, RemoteApplier(db), dio: throwingDio);
    await insertChange(
      ccid: 'c1',
      resource: 'accounts',
      resourceId: 'a1',
      payload: '{"id":"a1","updatedAt":1}',
    );
    await expectLater(sync.pushPending(), throwsA(isA<DioException>()));
    final remaining = await (db.select(
      db.changeLog,
    )..where((t) => t.synced.equals(false))).get();
    expect(remaining, hasLength(1)); // still pending for retry
  });

  test('pullChanges applies a page and advances the cursor', () async {
    dio.pullPages = [
      {
        'changes': [
          {
            'resource': 'accounts',
            'resourceId': 'a1',
            'op': 'upsert',
            'at': 10,
            'payload': {
              'id': 'a1',
              'name': 'Pulled',
              'kind': 'checking',
              'openingBalanceCents': 0,
              'onBudget': true,
              'archived': false,
              'sortOrder': 0,
              'createdAt': 10,
              'updatedAt': 10,
            },
          },
        ],
        'cursor': 42,
      },
    ];
    final pulled = await sync.pullChanges();
    expect(pulled, 1);
    expect(prefs.syncCursor, 42);
    final row = await (db.select(
      db.accounts,
    )..where((t) => t.id.equals('a1'))).getSingleOrNull();
    expect(row?.name, 'Pulled');
  });

  test('concurrent syncOnce callers share one reconciliation round', () async {
    final blockingDio = _BlockingCapabilitiesDio();
    sync = SyncService(db, secure, prefs, RemoteApplier(db), dio: blockingDio);

    final first = sync.syncOnce();
    await Future<void>.delayed(Duration.zero);
    final second = sync.syncOnce();

    expect(identical(first, second), isTrue);
    expect(blockingDio.capabilityCalls, 1);

    blockingDio.release.complete();
    final results = await Future.wait([first, second]);
    expect(results[0], results[1]);
    expect(blockingDio.capabilityCalls, 1);
  });
}

class _BlockingCapabilitiesDio extends _FakeDio {
  final Completer<void> release = Completer<void>();
  int capabilityCalls = 0;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Options? options,
    Map<String, dynamic>? queryParameters,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) async {
    if (path.endsWith('/v1/sync/capabilities')) {
      capabilityCalls++;
      await release.future;
    }
    return super.get<T>(
      path,
      data: data,
      options: options,
      queryParameters: queryParameters,
      cancelToken: cancelToken,
      onReceiveProgress: onReceiveProgress,
    );
  }
}

class _ThrowingDio extends _FakeDio {
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
    throw DioException(requestOptions: RequestOptions(path: path));
  }
}
