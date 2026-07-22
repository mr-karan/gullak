import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/budgets/data/budget_repository.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/features/payees/data/payee_repository.dart';
import 'package:gullak/features/recurrences/data/recurrence_repository.dart';
import 'package:gullak/features/rules/data/rule_repository.dart';
import 'package:gullak/features/tags/data/tag_repository.dart';
import 'package:gullak/features/transactions/data/transaction_repository.dart';
import 'package:gullak/sync/sync_writer.dart';
import 'package:gullak/sync/crdt.dart';
import 'package:gullak/sync/crdt_resources.dart';
import 'package:gullak/sync/crdt_store.dart';

void main() {
  late AppDatabase db;
  late CrdtStore store;
  late SyncWriter writer;
  late AccountRepository accounts;
  late TransactionRepository transactions;
  late String accountId;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    store = CrdtStore(db, nowMs: () => 1700000000000);
    await store.bootstrapEmptyReplica(epoch: 'epoch', actorId: 'phone');
    writer = SyncWriter(db, crdtStore: store);
    accounts = AccountRepository(db, changes: writer);
    transactions = TransactionRepository(db, changes: writer);
    accountId = await accounts.create(name: 'Bank', kind: AccountKind.savings);
  });

  tearDown(() => db.close());

  test('an update never emits unrelated stale projection fields', () async {
    final id = await transactions.create(
      accountId: accountId,
      payeeName: 'Canonical',
      amountCents: -100,
      date: DateTime(2026, 7, 22),
    );
    await db.customStatement(
      'UPDATE transactions SET payee_name = ? WHERE id = ?',
      ['stale local cache', id],
    );

    await transactions.update(id, notes: 'only this changed');

    final changes = await (db.select(
      db.syncChanges,
    )..orderBy([(row) => OrderingTerm.asc(row.sequence)])).get();
    final envelope = ChangeEnvelope.fromJson(
      Map<String, Object?>.from(jsonDecode(changes.last.envelopeJson) as Map),
    );
    expect(envelope.ops.map((op) => op.field).toSet(), {'notes', 'updatedAt'});
    expect(
      (await transactions.byRow(id))!.payeeName,
      'Canonical',
      reason: 'materialization repairs projection drift from causal registers',
    );
  });

  test('a transfer is one envelope containing both legs', () async {
    final other = await accounts.create(
      name: 'Wallet',
      kind: AccountKind.wallet,
    );
    final before = await db.select(db.syncChanges).get();

    await transactions.createTransfer(
      fromAccountId: accountId,
      toAccountId: other,
      amountCents: 500,
      date: DateTime(2026, 7, 22),
    );

    final after = await db.select(db.syncChanges).get();
    expect(after.length, before.length + 1);
    final envelope = ChangeEnvelope.fromJson(
      Map<String, Object?>.from(jsonDecode(after.last.envelopeJson) as Map),
    );
    expect(
      envelope.ops
          .where((op) => op.resource == 'transactions')
          .map((op) => op.entityId)
          .toSet(),
      hasLength(2),
    );
  });

  test(
    'fault before commit rolls domain row and outbox back together',
    () async {
      final failingStore = CrdtStore(
        db,
        nowMs: () => 1700000000001,
        faultInjector: (point) {
          if (point == 'local.after_change') throw StateError('power loss');
        },
      );
      final failingWriter = SyncWriter(db, crdtStore: failingStore);
      final failingRepo = TransactionRepository(db, changes: failingWriter);
      final before = await db.select(db.syncChanges).get();

      await expectLater(
        failingRepo.create(
          accountId: accountId,
          amountCents: -1,
          date: DateTime(2026, 7, 22),
        ),
        throwsStateError,
      );

      expect(await db.select(db.transactions).get(), isEmpty);
      expect((await db.select(db.syncChanges).get()).length, before.length);
    },
  );

  test('coordinates and transaction-tag identities are canonical', () async {
    final transactionId = await transactions.create(
      accountId: accountId,
      amountCents: -100,
      date: DateTime(2026, 7, 22),
      latitude: 12.123456789,
      longitude: -0.000000049,
    );
    final row = (await transactions.byRow(transactionId))!;
    expect(row.latitude, 12.1234568);
    expect(row.longitude, 0.0);

    final tags = TagRepository(db, changes: writer);
    final tagId = await tags.create(name: 'Trip');
    await tags.setTransactionTags(transactionId, [tagId]);
    final link = await db.select(db.transactionTags).getSingle();
    expect(link.id, transactionTagEntityId(transactionId, tagId));
  });

  test('canonical payee and split caches are derived, never emitted', () async {
    final payees = PayeeRepository(db, changes: writer);
    final payeeId = await payees.create('Old name');
    final transactionId = await transactions.create(
      accountId: accountId,
      payeeId: payeeId,
      payeeName: 'stale denormalized name',
      amountCents: -100,
      date: DateTime(2026, 7, 22),
    );
    expect((await transactions.byRow(transactionId))!.payeeName, 'Old name');
    expect((await payees.byId(payeeId))!.useCount, 1);

    await payees.rename(payeeId, 'New name');
    expect((await transactions.byRow(transactionId))!.payeeName, 'New name');

    final splitId = await transactions.createSplit(
      accountId: accountId,
      date: DateTime(2026, 7, 22),
      splits: [
        (amountCents: -30, categoryId: null, notes: null),
        (amountCents: -70, categoryId: null, notes: null),
      ],
    );
    final children = await (db.select(
      db.transactions,
    )..where((row) => row.parentId.equals(splitId))).get();
    await transactions.update(children.first.id, amountCents: -50);
    final split = (await transactions.byRow(splitId))!;
    expect(split.amountCents, -120);
    expect(split.splitTotalCents, -120);

    final envelopes = await db.select(db.syncChanges).get();
    for (final change in envelopes) {
      final envelope = ChangeEnvelope.fromJson(
        Map<String, Object?>.from(jsonDecode(change.envelopeJson) as Map),
      );
      expect(envelope.ops.map((op) => op.field), isNot(contains('useCount')));
      expect(
        envelope.ops.map((op) => op.field),
        isNot(contains('splitTotalCents')),
      );
      expect(
        envelope.ops.where(
          (op) => op.entityId == splitId && op.field == 'amountCents',
        ),
        isEmpty,
      );
      expect(
        envelope.ops.where(
          (op) => op.entityId == transactionId && op.field == 'payeeName',
        ),
        isEmpty,
      );
    }
  });

  test(
    'a remote v2 payee update invalidates watched transaction projection',
    () async {
      final payees = PayeeRepository(db, changes: writer);
      final payeeId = await payees.create('Before');
      final transactionId = await transactions.create(
        accountId: accountId,
        payeeId: payeeId,
        amountCents: -100,
        date: DateTime(2026, 7, 22),
      );
      final state = await db.select(db.syncReplicaState).getSingle();
      final watched = transactions
          .watchRow(transactionId)
          .map((row) => row?.payeeName);
      final expectation = expectLater(
        watched,
        emitsInOrder(['Before', 'After']),
      );

      await store.integrateRemoteChange(
        ChangeEnvelope(
          epoch: 'epoch',
          changeId: 'server:1',
          actorId: 'server',
          sequence: 1,
          context: {'phone': state.nextSequence - 1},
          lamport: state.lamport + 1,
          wallTimeMs: 1700000000001,
          schemaVersion: 1,
          ops: [
            AssignOp(
              resource: 'payees',
              entityId: payeeId,
              field: 'name',
              value: 'After',
            ),
          ],
        ),
        serverCursor: 1,
      );

      await expectation;
    },
  );

  test('every synced repository authors durable command events', () async {
    final categories = CategoryRepository(db, changes: writer);
    final budgets = BudgetRepository(db, changes: writer);
    final recurrences = RecurrenceRepository(db, changes: writer);
    var expected = (await db.select(db.syncChanges).get()).length;

    Future<T> emitsOne<T>(Future<T> Function() action) async {
      final result = await action();
      expected++;
      expect((await db.select(db.syncChanges).get()).length, expected);
      return result;
    }

    final groupId = await emitsOne(
      () => categories.createGroup(name: 'Essentials'),
    );
    final categoryId = await emitsOne(
      () => categories.create(name: 'Food', groupId: groupId),
    );
    await emitsOne(() => categories.update(categoryId, name: 'Groceries'));
    await emitsOne(
      () => budgets.setTarget(
        categoryId: categoryId,
        month: '2026-07',
        targetCents: 10000,
      ),
    );
    await emitsOne(
      () => budgets.clearTarget(categoryId: categoryId, month: '2026-07'),
    );
    final recurrenceId = await emitsOne(
      () => recurrences.create(
        accountId: accountId,
        categoryId: categoryId,
        amountCents: -500,
        cadence: 'monthly',
        nextDate: DateTime(2026, 8, 1),
      ),
    );
    await emitsOne(() => recurrences.delete(recurrenceId));
    await emitsOne(() => categories.deleteCategory(categoryId));
    expect(await db.select(db.syncPendingCommands).get(), isEmpty);
  });

  test('rules and rule matches remain local-only', () async {
    final rules = RuleRepository(db);
    final before = await db.select(db.syncChanges).get();
    final id = await rules.upsertRule(
      name: 'Local rule',
      triggerType: 'contains',
      triggerPayload: {'text': 'tea'},
      actionPayload: {'categoryId': null},
    );
    await rules.recordMatch(
      ruleId: id,
      sourceType: 'sms',
      sourceId: 'sms:1',
      outcome: 'matched',
    );
    expect((await db.select(db.syncChanges).get()).length, before.length);
    expect(await db.select(db.syncPendingCommands).get(), isEmpty);
  });

  test('pre-bootstrap command atomically retains field intent', () async {
    await db.close();
    final legacyDb = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(legacyDb.close);
    final offlineWriter = SyncWriter(legacyDb);
    final legacyAccounts = AccountRepository(legacyDb, changes: offlineWriter);

    await legacyAccounts.create(name: 'Legacy', kind: AccountKind.cash);

    expect(await legacyDb.select(legacyDb.accounts).get(), hasLength(1));
    final pending = await legacyDb
        .select(legacyDb.syncPendingCommands)
        .getSingle();
    final ops = jsonDecode(pending.opsJson) as List;
    expect(
      ops,
      contains(
        predicate((Object? value) => (value as Map)['field'] == r'$exists'),
      ),
    );
    expect(
      ops,
      contains(predicate((Object? value) => (value as Map)['field'] == 'name')),
    );
    expect(await legacyDb.select(legacyDb.syncChanges).get(), isEmpty);
  });
}
