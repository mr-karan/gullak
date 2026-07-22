import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/sync/crdt.dart';
import 'package:gullak/sync/crdt_checkpoint.dart';
import 'package:gullak/sync/crdt_resources.dart';
import 'package:gullak/sync/crdt_store.dart';

void main() {
  late AppDatabase db;
  late CrdtStore store;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    store = CrdtStore(db, nowMs: () => 1000);
  });

  tearDown(() => db.close());

  test(
    'verified bootstrap atomically replaces the synced projection',
    () async {
      await db
          .into(db.accounts)
          .insert(
            AccountsCompanion.insert(
              id: 'stale',
              name: 'Stale local row',
              createdAt: 1,
              updatedAt: 1,
            ),
          );
      final bundle = _accountBundle();
      final state = await CrdtCheckpointInstaller(
        db,
        store,
      ).install(bundle, actorId: 'phone');

      expect(state.epoch, 'epoch');
      expect(state.pullCursor, 1);
      expect(state.checkpointId, 'epoch:genesis');
      final accounts = await db.select(db.accounts).get();
      expect(accounts, hasLength(1));
      expect(accounts.single.id, 'a1');
      expect(accounts.single.name, 'Server truth');
      expect(
        await crdtProjectionHash(db),
        '93131f3de39c38a539e86559c04131c17ae99721e0d5ef73737c67fa5eba7194',
      );
    },
  );

  test('pre-bootstrap field commands survive checkpoint installation', () async {
    await db
        .into(db.accounts)
        .insert(
          AccountsCompanion.insert(
            id: 'local',
            name: 'Unsynced',
            createdAt: 1,
            updatedAt: 1,
          ),
        );
    await db
        .into(db.syncPendingCommands)
        .insert(
          SyncPendingCommandsCompanion.insert(
            commandId: 'pending',
            opsJson:
                '[{"kind":"assign","resource":"accounts","entityId":"local","field":"name","value":"Unsynced"}]',
            createdAt: 1,
          ),
        );
    await CrdtCheckpointInstaller(
      db,
      store,
    ).install(_accountBundle(), actorId: 'phone');
    expect(await db.select(db.syncPendingCommands).get(), hasLength(1));
    expect((await db.select(db.accounts).get()).single.name, 'Server truth');
  });

  test('tampered checkpoint fails before replacing local state', () async {
    await db
        .into(db.accounts)
        .insert(
          AccountsCompanion.insert(
            id: 'local',
            name: 'Keep me',
            createdAt: 1,
            updatedAt: 1,
          ),
        );
    final raw = _bundleJson();
    final checkpoint = Map<String, Object?>.from(raw['checkpoint']! as Map);
    checkpoint['projectionHash'] = 'f' * 64;
    raw['checkpoint'] = checkpoint;
    expect(
      () => CrdtBootstrapBundle.fromJson(raw),
      throwsA(isA<CrdtStoreException>()),
    );
    expect((await db.select(db.accounts).get()).single.name, 'Keep me');
  });

  test(
    'a self-consistent but wrong projection digest rolls back install',
    () async {
      await db
          .into(db.accounts)
          .insert(
            AccountsCompanion.insert(
              id: 'local',
              name: 'Keep me',
              createdAt: 1,
              updatedAt: 1,
            ),
          );
      final raw = _bundleJson();
      final checkpoint = Map<String, Object?>.from(raw['checkpoint']! as Map);
      checkpoint['projectionHash'] = 'f' * 64;
      checkpoint['contentHash'] = sha256
          .convert(
            utf8.encode(
              encodeCanonicalJson({
                'epoch': checkpoint['epoch'],
                'schemaVersion': checkpoint['schemaVersion'],
                'frontier': checkpoint['frontier'],
                'registers': checkpoint['registers'],
                'projectionHash': checkpoint['projectionHash'],
                'creationCursor': checkpoint['cursor'],
                'eventCount': checkpoint['eventCount'],
                'isGenesis': checkpoint['isGenesis'],
              }),
            ),
          )
          .toString();
      raw['checkpoint'] = checkpoint;

      await expectLater(
        CrdtCheckpointInstaller(
          db,
          store,
        ).install(CrdtBootstrapBundle.fromJson(raw), actorId: 'phone'),
        throwsA(isA<CrdtStoreException>()),
      );
      expect((await db.select(db.accounts).get()).single.name, 'Keep me');
    },
  );

  test('all replicated resources share the server projection hash', () async {
    await _seedCompleteProjection(db);
    expect(
      await crdtProjectionHash(db),
      '6de868ebb99baba2dcfefa188545b2d4fc1690753d7205dc08693529091f83f5',
    );
  });
}

Future<void> _seedCompleteProjection(AppDatabase db) async {
  const at = 1800000000000;
  await db.customStatement(
    'INSERT INTO accounts (id,name,kind,opening_balance_cents,'
    'reconciled_balance_cents,reconciled_at,on_budget,archived,sort_order,'
    'created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [
      'account-1',
      'Checking',
      'checking',
      50000,
      49000,
      at - 10,
      1,
      0,
      1,
      at - 100,
      at - 10,
    ],
  );
  await db.customStatement(
    'INSERT INTO category_groups (id,name,is_income,sort_order) VALUES (?,?,?,?)',
    ['group-1', 'Everyday', 0, 1],
  );
  await db.customStatement(
    'INSERT INTO categories (id,name,group_id,parent_id,color,icon,hidden,'
    'sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [
      'category-1',
      'Shopping',
      'group-1',
      null,
      0xff112233,
      'bag',
      0,
      1,
      at - 9,
    ],
  );
  await db.customStatement(
    'INSERT INTO payees (id,name,use_count,learn_categories,updated_at) '
    'VALUES (?,?,?,?,?)',
    ['payee-1', 'Dyson', 99, 1, at - 8],
  );
  await db.customStatement(
    'INSERT INTO transactions (id,account_id,category_id,payee_id,payee_name,'
    'amount_cents,date,notes,latitude,longitude,location_name,cleared,reconciled,'
    'origin,origin_ref,imported_id,transfer_account_id,transfer_group_id,'
    'parent_id,split_total_cents,group_parent_id,is_group_parent,'
    'original_amount_cents,original_currency,created_at,updated_at) '
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      'transaction-1',
      'account-1',
      'category-1',
      'payee-1',
      'Dyson',
      -45000,
      '2026-07-21',
      'vacuum',
      12.9716,
      77.5946,
      'Bengaluru',
      1,
      0,
      'manual',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      at - 7,
      at - 6,
    ],
  );
  await db.customStatement(
    'INSERT INTO tags (id,name,color,archived,created_at,updated_at) '
    'VALUES (?,?,?,?,?,?)',
    ['tag-1', 'Home', 0xff445566, 0, at - 5, at - 4],
  );
  await db.customStatement(
    'INSERT INTO transaction_tags (id,transaction_id,tag_id,updated_at) '
    'VALUES (?,?,?,?)',
    ['transaction-tag-1', 'transaction-1', 'tag-1', at - 3],
  );
  await db.customStatement(
    'INSERT INTO budgets (id,category_id,month,target_cents,rollover_cents,'
    'updated_at) VALUES (?,?,?,?,?,?)',
    ['budget-1', 'category-1', '2026-07', 100000, 5000, at - 2],
  );
  await db.customStatement(
    'INSERT INTO recurrences (id,account_id,category_id,payee_id,payee_name,'
    'amount_cents,notes,cadence,next_date,anchor_day,created_at,updated_at) '
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      'recurrence-1',
      'account-1',
      'category-1',
      'payee-1',
      'Dyson',
      -5000,
      'filter replacement',
      'yearly',
      '2027-07-21',
      21,
      at - 2,
      at - 1,
    ],
  );
}

CrdtBootstrapBundle _accountBundle() =>
    CrdtBootstrapBundle.fromJson(_bundleJson());

Map<String, Object?> _bundleJson() {
  final envelope = ChangeEnvelope(
    epoch: 'epoch',
    changeId: 'genesis:1',
    actorId: 'genesis',
    sequence: 1,
    context: const {},
    lamport: 1,
    wallTimeMs: 10,
    schemaVersion: 1,
    ops: [
      AssignOp(
        resource: 'accounts',
        entityId: 'a1',
        field: r'$exists',
        value: true,
      ),
      for (final entry in <String, Object?>{
        'name': 'Server truth',
        'kind': 'checking',
        'openingBalanceCents': 0,
        'reconciledBalanceCents': null,
        'reconciledAt': null,
        'onBudget': true,
        'archived': false,
        'sortOrder': 0,
        'createdAt': 10,
        'updatedAt': 10,
      }.entries)
        AssignOp(
          resource: 'accounts',
          entityId: 'a1',
          field: entry.key,
          value: entry.value,
        ),
    ],
  );
  final registers = envelope.candidates.map((candidate) {
    final lifecycle = candidate.field == r'$exists';
    return <String, Object?>{
      'resource': candidate.resource,
      'entityId': candidate.entityId,
      'field': candidate.field,
      'policy': lifecycle ? 'remove_wins' : 'mvr',
      'candidates': {
        'candidates': [candidate.toRegisterJson()],
      },
      'visibleValue': candidate.value,
      'updatedCursor': 1,
    };
  }).toList();
  final projectionHash = sha256
      .convert(
        utf8.encode(
          encodeCanonicalJson([
            {
              'resource': 'accounts',
              'lifecycle': r'$exists',
              'entities': [
                {
                  'id': 'a1',
                  'fields': {
                    'name': 'Server truth',
                    'kind': 'checking',
                    'openingBalanceCents': 0,
                    'reconciledBalanceCents': null,
                    'reconciledAt': null,
                    'onBudget': true,
                    'archived': false,
                    'sortOrder': 0,
                    'createdAt': 10,
                    'updatedAt': 10,
                  },
                },
              ],
            },
            for (final resource in const [
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
  final checkpointBody = <String, Object?>{
    'epoch': 'epoch',
    'schemaVersion': 1,
    'frontier': {'genesis': 1},
    'registers': registers,
    'projectionHash': projectionHash,
    'creationCursor': 1,
    'eventCount': 1,
    'isGenesis': true,
  };
  final checkpointHash = sha256
      .convert(utf8.encode(encodeCanonicalJson(checkpointBody)))
      .toString();
  return {
    'protocol': 2,
    'epoch': 'epoch',
    'checkpoint': {
      'id': 'epoch:genesis',
      'epoch': 'epoch',
      'schemaVersion': 1,
      'frontier': {'genesis': 1},
      'registers': registers,
      'projectionHash': projectionHash,
      'contentHash': checkpointHash,
      'cursor': 1,
      'eventCount': 1,
      'isGenesis': true,
      'createdAt': 10,
    },
    'changesThroughCheckpoint': [
      {
        'cursor': 1,
        'contentHash': sha256
            .convert(utf8.encode(envelope.canonicalJson()))
            .toString(),
        'envelope': envelope.toJson(),
      },
    ],
  };
}
