import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/core/secure_store.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/payees/data/payee_repository.dart';
import 'package:gullak/features/transactions/data/transaction_repository.dart';
import 'package:gullak/sync/changelog_writer.dart';
import 'package:gullak/sync/crdt_store.dart';
import 'package:gullak/sync/sync_v2_client.dart';

const _enabled = bool.fromEnvironment('GULLAK_HTTP_E2E');
const _baseUrl = String.fromEnvironment(
  'GULLAK_HTTP_E2E_URL',
  defaultValue: 'http://127.0.0.1:18787',
);
const _epoch = String.fromEnvironment(
  'GULLAK_HTTP_E2E_EPOCH',
  defaultValue: 'e2e-epoch-1',
);

void main() {
  test(
    'two offline replicas merge intent and retain same-field concurrency',
    () async {
      final run = DateTime.now().microsecondsSinceEpoch;
      final a = await _Replica.open('e2e-$run-a');
      final b = await _Replica.open('e2e-$run-b');
      addTearDown(a.close);
      addTearDown(b.close);

      await a.sync();
      await b.sync();
      final payeeId = await a.payees.create('Payu Retail $run');
      final transactionId = await a.transactions.create(
        accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payeeId: payeeId,
        payeeName: 'Payu Retail $run',
        amountCents: -45000,
        date: DateTime(2026, 7, 22),
        notes: 'baseline $run',
      );
      await a.sync();
      await b.sync();
      expect(
        (await b.transactions.byRow(transactionId))?.notes,
        'baseline $run',
      );

      // Both actions happen offline from the same checkpoint. B's unrelated
      // note edit must not carry or restore the stale linked payee cache.
      await a.payees.rename(payeeId, 'Dyson V15 $run');
      await b.transactions.update(transactionId, notes: 'offline note from B');
      await b.sync();
      await a.sync();
      await b.sync();

      for (final replica in [a, b]) {
        expect((await replica.payees.byId(payeeId))?.name, 'Dyson V15 $run');
        final transaction = await replica.transactions.byRow(transactionId);
        expect(transaction, isNot(equals(null)));
        expect(transaction!.notes, 'offline note from B');
        expect(transaction.payeeName, 'Dyson V15 $run');
      }

      // Now edit the same field concurrently. Neither fact is destroyed; all
      // replicas project the same deterministic winner after exchanging the
      // immutable union.
      await a.transactions.update(transactionId, notes: 'concurrent A');
      await b.transactions.update(transactionId, notes: 'concurrent B');
      await a.sync();
      await b.sync();
      await a.sync();

      expect(
        (await a.transactions.byRow(transactionId))?.notes,
        'concurrent B',
      );
      expect(
        (await b.transactions.byRow(transactionId))?.notes,
        'concurrent B',
      );
      for (final replica in [a, b]) {
        final register =
            await (replica.db.select(replica.db.syncRegisters)..where(
                  (row) =>
                      row.resource.equals('transactions') &
                      row.entityId.equals(transactionId) &
                      row.field.equals('notes'),
                ))
                .getSingle();
        expect(
          (jsonDecode(register.candidatesJson)['candidates'] as List),
          hasLength(2),
        );
      }

      // Structural rows must also replay from immutable facts. The parent has
      // no authored amount register; both server and clean replica derive it
      // from the children after applying the whole envelope.
      final splitId = await a.transactions.createSplit(
        accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        date: DateTime(2026, 7, 22),
        splits: const [
          (amountCents: -300, categoryId: null, notes: 'part A'),
          (amountCents: -700, categoryId: null, notes: 'part B'),
        ],
      );
      await a.sync();
      await b.sync();
      for (final replica in [a, b]) {
        final parent = await replica.transactions.byRow(splitId);
        expect(parent, isNot(equals(null)));
        expect(parent!.amountCents, -1000);
        expect(parent.splitTotalCents, -1000);
        final children = await (replica.db.select(
          replica.db.transactions,
        )..where((row) => row.parentId.equals(splitId))).get();
        expect(children, hasLength(2));
        expect(
          children.fold<int>(0, (sum, row) => sum + row.amountCents),
          -1000,
        );
      }
    },
    skip: _enabled ? false : 'set GULLAK_HTTP_E2E=true for local-server E2E',
  );
}

final class _Replica {
  _Replica({
    required this.db,
    required this.client,
    required this.payees,
    required this.transactions,
  });

  static Future<_Replica> open(String actorId) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    await db.kvSet('sync.v2.actorId', actorId);
    final store = CrdtStore(db);
    final writer = ChangeLogWriter(db, crdtStore: store);
    return _Replica(
      db: db,
      client: SyncV2Client(db, _MemorySecureStore(), store),
      payees: PayeeRepository(db, changes: writer),
      transactions: TransactionRepository(db, changes: writer),
    );
  }

  final AppDatabase db;
  final SyncV2Client client;
  final PayeeRepository payees;
  final TransactionRepository transactions;

  Future<SyncV2Stats> sync() => client.sync(baseUrl: _baseUrl, epoch: _epoch);

  Future<void> close() => db.close();
}

final class _MemorySecureStore extends SecureStore {
  String? _actorId;
  String? _token;

  @override
  Future<String?> readSyncActorToken(String actorId) async =>
      _actorId == actorId ? _token : null;

  @override
  Future<void> writeSyncActorCredential({
    required String actorId,
    required String actorToken,
  }) async {
    _actorId = actorId;
    _token = actorToken;
  }
}
