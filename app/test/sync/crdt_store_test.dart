import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/sync/crdt.dart';
import 'package:gullak/sync/crdt_resources.dart';
import 'package:gullak/sync/crdt_store.dart';

void main() {
  late AppDatabase db;
  late CrdtStore store;
  var now = 1000;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    store = CrdtStore(db, nowMs: () => now++);
    await store.bootstrapEmptyReplica(epoch: 'epoch', actorId: 'phone');
  });

  tearDown(() => db.close());

  test(
    'local create, update, delete and durable allocation are atomic',
    () async {
      final created = await store.authorLocalChange(ops: _transactionCreate());
      expect(created.changeId, 'phone:1');
      expect(created.lamport, 1);
      expect(
        (await db.select(db.transactions).getSingle()).payeeName,
        'Original',
      );

      final updated = await store.authorLocalChange(
        ops: [_op('notes', 'local note')],
      );
      expect(updated.changeId, 'phone:2');
      expect(updated.context, {'phone': 1});
      expect(updated.lamport, 2);
      expect(
        (await db.select(db.transactions).getSingle()).notes,
        'local note',
      );

      await store.authorLocalChange(ops: [_op(r'$exists', false)]);
      expect(await db.select(db.transactions).getSingleOrNull(), isNull);
      final state = await db.select(db.syncReplicaState).getSingle();
      expect(state.nextSequence, 4);
      expect(state.lamport, 3);
      expect(
        (await db.select(db.syncChanges).get()).map((row) => row.outboxState),
        everyElement('pending'),
      );
    },
  );

  test('empty bootstrap cannot manufacture a non-zero cursor', () async {
    await expectLater(
      store.bootstrapEmptyReplica(epoch: 'epoch', pullCursor: 1),
      throwsA(
        isA<CrdtStoreException>().having(
          (error) => error.message,
          'message',
          contains('verified checkpoint'),
        ),
      ),
    );
    expect((await db.select(db.syncReplicaState).getSingle()).pullCursor, 0);
  });

  test(
    'verified server replay restores this actor sequence after reset',
    () async {
      final acceptedBeforeReset = _remote(
        actor: 'phone',
        resource: 'tags',
        entityId: 'tag-1',
        ops: _tagCreate(),
      );

      final replay = await store.integrateRemoteChange(
        acceptedBeforeReset,
        serverCursor: 1,
        source: 'verified-checkpoint-tail',
      );
      expect(replay.accepted, 1);
      expect(
        (await db.select(db.syncReplicaState).getSingle()).nextSequence,
        2,
      );

      final next = await store.authorLocalChange(
        ops: [_rawOp('tags', 'tag-1', 'name', 'after recovery')],
      );
      expect(next.changeId, 'phone:2');
      expect(next.context, {'phone': 1});
      expect(next.lamport, 2);
    },
  );

  test(
    'unsupported schema is rejected locally and quarantined remotely',
    () async {
      await expectLater(
        store.authorLocalChange(ops: _transactionCreate(), schemaVersion: 2),
        throwsA(isA<CrdtStoreException>()),
      );
      expect(await db.select(db.syncChanges).get(), isEmpty);

      final future = _remote(
        actor: 'future',
        schemaVersion: 2,
        resource: 'future_resource',
        entityId: 'future-1',
        ops: [_rawOp('future_resource', 'future-1', 'futureField', 'opaque')],
      );
      final result = await store.integrateRemoteChange(future, serverCursor: 1);
      expect(result.quarantined, 1);
      expect(
        (await db.select(db.syncQuarantine).getSingle()).reasonCode,
        'unsupported_schema',
      );
      expect(await db.select(db.tags).get(), isEmpty);
    },
  );

  test(
    'independent stale field edits survive and materialize together',
    () async {
      await store.authorLocalChange(ops: _transactionCreate());
      final note = _remote(
        actor: 'a',
        context: const {'phone': 1},
        lamport: 2,
        ops: [_op('notes', 'from a')],
      );
      final payee = _remote(
        actor: 'b',
        context: const {'phone': 1},
        lamport: 2,
        ops: [_op('payeeName', 'from b')],
      );

      await store.integrateRemotePage(
        changes: [
          RemoteCrdtChange(envelope: payee, serverCursor: 11),
          RemoteCrdtChange(envelope: note, serverCursor: 10),
        ],
        nextCursor: 12,
      );

      final row = await db.select(db.transactions).getSingle();
      expect(row.notes, 'from a');
      expect(row.payeeName, 'from b');
    },
  );

  test(
    'same-field concurrency is retained with deterministic projection',
    () async {
      await store.authorLocalChange(ops: _transactionCreate());
      final a = _remote(
        actor: 'a',
        context: const {'phone': 1},
        lamport: 2,
        ops: [_op('notes', 'A')],
      );
      final b = _remote(
        actor: 'b',
        context: const {'phone': 1},
        lamport: 2,
        ops: [_op('notes', 'B')],
      );
      final result = await store.integrateRemotePage(
        changes: [
          RemoteCrdtChange(envelope: b, serverCursor: 2),
          RemoteCrdtChange(envelope: a, serverCursor: 1),
        ],
        nextCursor: 3,
      );

      expect((await db.select(db.transactions).getSingle()).notes, 'B');
      final register = await (db.select(
        db.syncRegisters,
      )..where((row) => row.field.equals('notes'))).getSingle();
      expect(
        (jsonDecode(register.candidatesJson)['candidates'] as List),
        hasLength(2),
      );
      expect(result.conflicts, isNotEmpty);
    },
  );

  test(
    'causal events may arrive reordered and exact duplicates are safe',
    () async {
      final first = _remote(
        actor: 'server',
        ops: _tagCreate(),
        entityId: 'tag-1',
        resource: 'tags',
      );
      final second = _remote(
        actor: 'server',
        sequence: 2,
        context: const {'server': 1},
        lamport: 2,
        ops: [_rawOp('tags', 'tag-1', 'name', 'renamed')],
      );
      final page = await store.integrateRemotePage(
        changes: [
          RemoteCrdtChange(envelope: second, serverCursor: 2),
          RemoteCrdtChange(envelope: first, serverCursor: 1),
        ],
        nextCursor: 2,
      );
      expect(page.accepted, 2);
      expect((await db.select(db.tags).getSingle()).name, 'renamed');

      final duplicate = await store.integrateRemoteChange(
        second,
        serverCursor: 2,
      );
      expect(duplicate.duplicates, 1);
      expect(await db.select(db.syncChanges).get(), hasLength(2));
    },
  );

  test(
    'missing actor sequence or dependency is retryable and holds cursor',
    () async {
      final gap = _remote(
        actor: 'server',
        sequence: 2,
        context: const {'server': 1},
        lamport: 2,
        ops: [_rawOp('tags', 'tag-1', 'name', 'late')],
      );
      await expectLater(
        store.integrateRemotePage(
          changes: [RemoteCrdtChange(envelope: gap, serverCursor: 8)],
          nextCursor: 9,
        ),
        throwsA(isA<CrdtRetryableGap>()),
      );
      expect((await db.select(db.syncReplicaState).getSingle()).pullCursor, 0);
      expect(await db.select(db.syncQuarantine).get(), isEmpty);
      expect(await db.select(db.syncChanges).get(), isEmpty);
    },
  );

  test(
    'remote context must include its transitive three-actor closure',
    () async {
      final b = _remote(actor: 'b', ops: _transactionCreate());
      await store.integrateRemoteChange(b, serverCursor: 1);
      final a = _remote(
        actor: 'a',
        context: const {'b': 1},
        lamport: 2,
        ops: [_op('notes', 'a observed b')],
      );
      await store.integrateRemoteChange(a, serverCursor: 2);

      final invalid = _remote(
        actor: 'c',
        context: const {'a': 1},
        lamport: 3,
        ops: [_op('notes', 'c omitted b')],
      );
      final quarantined = await store.integrateRemoteChange(
        invalid,
        serverCursor: 3,
      );
      expect(quarantined.quarantined, 1);
      expect(
        (await db.select(db.syncQuarantine).getSingle()).reasonCode,
        'invalid_context',
      );
      expect(
        (await db.select(db.transactions).getSingle()).notes,
        'a observed b',
      );

      final valid = _remote(
        actor: 'c',
        context: const {'a': 1, 'b': 1},
        lamport: 3,
        ops: [_op('notes', 'closed context')],
      );
      final accepted = await store.integrateRemoteChange(
        valid,
        serverCursor: 4,
      );
      expect(accepted.accepted, 1);
      expect(
        (await db.select(db.transactions).getSingle()).notes,
        'closed context',
      );
    },
  );

  test(
    'inflated Lamport is quarantined and does not wedge page cursor',
    () async {
      final inflated = _remote(
        actor: 'evil',
        lamport: 9007199254740991,
        ops: _tagCreate(),
        entityId: 'bad-tag',
        resource: 'tags',
      );
      final result = await store.integrateRemoteChange(
        inflated,
        serverCursor: 5,
      );
      expect(result.quarantined, 1);
      expect(result.pullCursor, 5);
      expect(
        (await db.select(db.syncQuarantine).getSingle()).reasonCode,
        'invalid_lamport',
      );
      expect(await db.select(db.tags).get(), isEmpty);
    },
  );

  test(
    'identity reuse with different canonical bytes is quarantined',
    () async {
      final accepted = _remote(
        actor: 'server',
        ops: _tagCreate(),
        resource: 'tags',
        entityId: 'tag-1',
      );
      await store.integrateRemoteChange(accepted, serverCursor: 1);
      final reused = ChangeEnvelope(
        epoch: accepted.epoch,
        changeId: accepted.changeId,
        actorId: accepted.actorId,
        sequence: accepted.sequence,
        context: accepted.context,
        lamport: accepted.lamport,
        wallTimeMs: 99,
        schemaVersion: accepted.schemaVersion,
        ops: accepted.ops,
      );
      final result = await store.integrateRemoteChange(reused, serverCursor: 2);
      expect(result.quarantined, 1);
      expect(
        (await db.select(db.syncQuarantine).getSingle()).reasonCode,
        'identity_reuse',
      );
      expect(await db.select(db.syncChanges).get(), hasLength(1));
    },
  );

  test(
    'explicit null is assigned while absent fields remain untouched',
    () async {
      await store.authorLocalChange(ops: _transactionCreate());
      await store.authorLocalChange(
        ops: [_op('notes', 'before'), _op('locationName', 'keep me')],
      );
      final clearNote = _remote(
        actor: 'server',
        context: const {'phone': 2},
        lamport: 3,
        ops: [_op('notes', null)],
      );
      await store.integrateRemoteChange(clearNote, serverCursor: 1);
      final row = await db.select(db.transactions).getSingle();
      expect(row.notes, isNull);
      expect(row.locationName, 'keep me');
      final register = await (db.select(
        db.syncRegisters,
      )..where((row) => row.field.equals('notes'))).getSingle();
      expect(register.visibleValueJson, 'null');
    },
  );

  test('projection poison is quarantined without partial CRDT state', () async {
    final incompleteCreate = _remote(
      actor: 'server',
      resource: 'tags',
      entityId: 'incomplete',
      ops: [_rawOp('tags', 'incomplete', r'$exists', true)],
    );
    final result = await store.integrateRemoteChange(
      incompleteCreate,
      serverCursor: 1,
    );
    expect(result.quarantined, 1);
    expect(await db.select(db.tags).get(), isEmpty);
    expect(await db.select(db.syncChanges).get(), isEmpty);
    expect(await db.select(db.syncRegisters).get(), isEmpty);
    expect((await db.select(db.syncReplicaState).getSingle()).pullCursor, 1);
  });

  test('remove-wins delete and causal restore drive row lifecycle', () async {
    await store.authorLocalChange(ops: _transactionCreate());
    final concurrentDelete = _remote(
      actor: 'server',
      ops: [_op(r'$exists', false)],
    );
    await store.integrateRemoteChange(concurrentDelete, serverCursor: 1);
    expect(await db.select(db.transactions).getSingleOrNull(), isNull);

    await store.authorLocalChange(ops: [_op(r'$exists', true)]);
    expect(
      (await db.select(db.transactions).getSingle()).payeeName,
      'Original',
    );
  });

  test(
    'transaction tag membership is add-wins until causally removed',
    () async {
      final identity = transactionTagEntityId('txn-1', 'tag-1');
      await store.authorLocalChange(
        ops: [
          _rawOp('transaction_tags', identity, r'$member', true),
          _rawOp('transaction_tags', identity, 'transactionId', 'txn-1'),
          _rawOp('transaction_tags', identity, 'tagId', 'tag-1'),
          _rawOp('transaction_tags', identity, 'updatedAt', 1),
        ],
      );
      final concurrentRemove = _remote(
        actor: 'server',
        resource: 'transaction_tags',
        entityId: identity,
        ops: [_rawOp('transaction_tags', identity, r'$member', false)],
      );
      await store.integrateRemoteChange(concurrentRemove, serverCursor: 1);
      expect(await db.select(db.transactionTags).getSingleOrNull(), isNotNull);

      final observedRemove = _remote(
        actor: 'server',
        sequence: 2,
        context: const {'phone': 1, 'server': 1},
        lamport: 2,
        resource: 'transaction_tags',
        entityId: identity,
        ops: [_rawOp('transaction_tags', identity, r'$member', false)],
      );
      await store.integrateRemoteChange(observedRemove, serverCursor: 2);
      expect(await db.select(db.transactionTags).getSingleOrNull(), isNull);
    },
  );

  test('whole remote page rolls back when a retryable gap remains', () async {
    final valid = _remote(
      actor: 'a',
      ops: _tagCreate(),
      entityId: 'would-rollback',
      resource: 'tags',
    );
    final gap = _remote(
      actor: 'b',
      sequence: 2,
      context: const {'b': 1},
      lamport: 2,
      ops: [_rawOp('tags', 'missing', 'name', 'gap')],
    );
    await expectLater(
      store.integrateRemotePage(
        changes: [
          RemoteCrdtChange(envelope: valid, serverCursor: 1),
          RemoteCrdtChange(envelope: gap, serverCursor: 2),
        ],
        nextCursor: 3,
      ),
      throwsA(isA<CrdtRetryableGap>()),
    );
    expect(await db.select(db.tags).get(), isEmpty);
    expect(await db.select(db.syncChanges).get(), isEmpty);
    expect((await db.select(db.syncReplicaState).getSingle()).pullCursor, 0);
  });

  test('injected crash rolls local projection and allocator back', () async {
    for (final faultPoint in const [
      'local.after_change',
      'local.after_materialize',
      'local.before_commit',
    ]) {
      final isolated = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(isolated.close);
      final crashing = CrdtStore(
        isolated,
        nowMs: () => now++,
        faultInjector: (point) {
          if (point == faultPoint) throw StateError('crash at $point');
        },
      );
      await crashing.bootstrapEmptyReplica(epoch: 'epoch', actorId: 'phone');
      await expectLater(
        crashing.authorLocalChange(ops: _transactionCreate()),
        throwsStateError,
        reason: faultPoint,
      );
      expect(await isolated.select(isolated.transactions).get(), isEmpty);
      expect(await isolated.select(isolated.syncChanges).get(), isEmpty);
      expect(
        (await isolated.select(isolated.syncReplicaState).getSingle())
            .nextSequence,
        1,
      );
    }
  });

  test('every remote commit boundary rolls page and cursor back', () async {
    for (final faultPoint in const [
      'remote.after_change',
      'remote.after_materialize',
      'remote.before_cursor_commit',
    ]) {
      final isolated = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(isolated.close);
      final crashing = CrdtStore(
        isolated,
        nowMs: () => now++,
        faultInjector: (point) {
          if (point == faultPoint) throw StateError('crash at $point');
        },
      );
      await crashing.bootstrapEmptyReplica(epoch: 'epoch', actorId: 'phone');
      await expectLater(
        crashing.integrateRemotePage(
          changes: [
            RemoteCrdtChange(
              envelope: _remote(
                actor: 'server',
                resource: 'tags',
                entityId: 'tag-boundary',
                ops: _tagCreate(),
              ),
              serverCursor: 1,
            ),
          ],
          nextCursor: 1,
        ),
        throwsStateError,
        reason: faultPoint,
      );
      expect(await isolated.select(isolated.tags).get(), isEmpty);
      expect(await isolated.select(isolated.syncChanges).get(), isEmpty);
      expect(
        (await isolated.select(isolated.syncReplicaState).getSingle())
            .pullCursor,
        0,
      );
    }
  });

  test(
    'unknown future field is retained but ignored by materializer',
    () async {
      await store.authorLocalChange(
        ops: [
          ..._transactionCreate(),
          _op('futureMetadata', const {'nullable': null, 'version': 7}),
        ],
      );
      final register = await (db.select(
        db.syncRegisters,
      )..where((row) => row.field.equals('futureMetadata'))).getSingle();
      expect(register.visibleValueJson, '{"nullable":null,"version":7}');
      expect(await db.select(db.transactions).getSingleOrNull(), isNotNull);
    },
  );

  test(
    'rules are permanently quarantined and unrelated events progress',
    () async {
      final rule = _remote(
        actor: 'legacy',
        resource: 'rules',
        entityId: 'rule-1',
        ops: [_rawOp('rules', 'rule-1', r'$exists', true)],
      );
      final valid = _remote(
        actor: 'server',
        resource: 'tags',
        entityId: 'tag-1',
        ops: _tagCreate(),
      );
      final result = await store.integrateRemotePage(
        changes: [
          RemoteCrdtChange(envelope: rule, serverCursor: 1),
          RemoteCrdtChange(envelope: valid, serverCursor: 2),
        ],
        nextCursor: 3,
      );
      expect(result.quarantined, 1);
      expect(result.accepted, 1);
      expect(result.pullCursor, 3);
      expect((await db.select(db.tags).getSingle()).name, 'Tag');
      expect(
        (await db.select(db.syncQuarantine).getSingle()).reasonCode,
        'invalid_projection',
      );
    },
  );

  test(
    'a poisoned actor chain is cascaded to quarantine, not wedged',
    () async {
      final poison = _remote(
        actor: 'server',
        resource: 'rules',
        entityId: 'rule-1',
        ops: [_rawOp('rules', 'rule-1', r'$exists', true)],
      );
      final dependent = _remote(
        actor: 'server',
        sequence: 2,
        context: const {'server': 1},
        lamport: 2,
        resource: 'tags',
        entityId: 'tag-1',
        ops: [_rawOp('tags', 'tag-1', 'name', 'cannot safely apply')],
      );
      final unrelated = _remote(
        actor: 'other',
        resource: 'tags',
        entityId: 'tag-2',
        ops: _tagCreate()
            .map((op) => _rawOp('tags', 'tag-2', op.field, op.value))
            .toList(),
      );
      final result = await store.integrateRemotePage(
        changes: [
          RemoteCrdtChange(envelope: dependent, serverCursor: 2),
          RemoteCrdtChange(envelope: poison, serverCursor: 1),
          RemoteCrdtChange(envelope: unrelated, serverCursor: 3),
        ],
        nextCursor: 3,
      );
      expect(result.quarantined, 2);
      expect(result.accepted, 1);
      expect((await db.select(db.syncReplicaState).getSingle()).pullCursor, 3);
      expect((await db.select(db.tags).getSingle()).id, 'tag-2');
      expect(
        (await db.select(db.syncQuarantine).get()).map((row) => row.reasonCode),
        contains('quarantined_dependency'),
      );
    },
  );
}

List<AssignOp> _transactionCreate() => [
  _op(r'$exists', true),
  _op('accountId', 'account-1'),
  _op('amountCents', -129900),
  _op('date', '2026-07-22'),
  _op('cleared', false),
  _op('reconciled', false),
  _op('origin', 'manual'),
  _op('isGroupParent', false),
  _op('createdAt', 100),
  _op('updatedAt', 100),
  _op('payeeName', 'Original'),
];

List<AssignOp> _tagCreate() => [
  _rawOp('tags', 'tag-1', r'$exists', true),
  _rawOp('tags', 'tag-1', 'name', 'Tag'),
  _rawOp('tags', 'tag-1', 'archived', false),
  _rawOp('tags', 'tag-1', 'createdAt', 100),
  _rawOp('tags', 'tag-1', 'updatedAt', 100),
];

AssignOp _op(String field, Object? value) =>
    _rawOp('transactions', 'txn-1', field, value);

AssignOp _rawOp(
  String resource,
  String entityId,
  String field,
  Object? value,
) => AssignOp(
  resource: resource,
  entityId: entityId,
  field: field,
  value: value,
);

ChangeEnvelope _remote({
  required String actor,
  int sequence = 1,
  Map<String, int> context = const {},
  int lamport = 1,
  int schemaVersion = 1,
  String resource = 'transactions',
  String entityId = 'txn-1',
  required List<AssignOp> ops,
}) => ChangeEnvelope(
  epoch: 'epoch',
  changeId: '$actor:$sequence',
  actorId: actor,
  sequence: sequence,
  context: context,
  lamport: lamport,
  wallTimeMs: 0,
  schemaVersion: schemaVersion,
  ops: ops
      .map(
        (op) => AssignOp(
          resource: resource == 'transactions' ? op.resource : resource,
          entityId: entityId == 'txn-1' ? op.entityId : entityId,
          field: op.field,
          value: op.value,
        ),
      )
      .toList(),
);
