import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chavanni/data/db/database.dart';
import 'package:chavanni/sync/remote_applier.dart';

/// Direct coverage of the last-write-wins applier — the phone side of sync,
/// previously untested. Applies raw server change-log maps to an in-memory DB.
void main() {
  late AppDatabase db;
  late RemoteApplier applier;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    applier = RemoteApplier(db);
  });
  tearDown(() => db.close());

  Map<String, dynamic> accountChange({
    required String id,
    required String name,
    required int updatedAt,
    String op = 'upsert',
    int? at,
  }) => {
    'resource': 'accounts',
    'resourceId': id,
    'op': op,
    'at': at ?? updatedAt,
    'payload': op == 'delete'
        ? null
        : {
            'id': id,
            'name': name,
            'kind': 'checking',
            'openingBalanceCents': 0,
            'onBudget': true,
            'archived': false,
            'sortOrder': 0,
            'createdAt': updatedAt,
            'updatedAt': updatedAt,
          },
  };

  Future<AccountRow?> readAccount(String id) =>
      (db.select(db.accounts)..where((t) => t.id.equals(id))).getSingleOrNull();

  test('applies an upsert and returns true', () async {
    final ok = await applier.apply(
      accountChange(id: 'a1', name: 'Checking', updatedAt: 1000),
    );
    expect(ok, isTrue);
    expect((await readAccount('a1'))?.name, 'Checking');
  });

  test('a newer updatedAt wins; an older one is ignored (LWW)', () async {
    await applier.apply(
      accountChange(id: 'a1', name: 'Original', updatedAt: 2000),
    );
    // Older remote write must not clobber the newer local row.
    await applier.apply(
      accountChange(id: 'a1', name: 'Stale', updatedAt: 1000),
    );
    expect((await readAccount('a1'))?.name, 'Original');
    // Newer remote write applies.
    await applier.apply(
      accountChange(id: 'a1', name: 'Fresh', updatedAt: 3000),
    );
    expect((await readAccount('a1'))?.name, 'Fresh');
  });

  test('equal updatedAt lets the incoming write win (>=)', () async {
    await applier.apply(
      accountChange(id: 'a1', name: 'First', updatedAt: 2000),
    );
    await applier.apply(
      accountChange(id: 'a1', name: 'Second', updatedAt: 2000),
    );
    expect((await readAccount('a1'))?.name, 'Second');
  });

  test(
    'a delete tombstone removes the row when not older than local',
    () async {
      await applier.apply(
        accountChange(id: 'a1', name: 'Doomed', updatedAt: 1000),
      );
      final ok = await applier.apply(
        accountChange(id: 'a1', name: '', updatedAt: 0, op: 'delete', at: 2000),
      );
      expect(ok, isTrue);
      expect(await readAccount('a1'), isNull);
    },
  );

  test('a stale delete loses to a newer local edit', () async {
    await applier.apply(accountChange(id: 'a1', name: 'Kept', updatedAt: 5000));
    // Tombstone stamped earlier than the local row → must not delete.
    await applier.apply(
      accountChange(id: 'a1', name: '', updatedAt: 0, op: 'delete', at: 1000),
    );
    expect((await readAccount('a1'))?.name, 'Kept');
  });

  test('a malformed change (missing op) is skipped, not fatal', () async {
    final ok = await applier.apply({
      'resource': 'accounts',
      'resourceId': 'a1',
      // no 'op'
      'payload': {'id': 'a1'},
    });
    expect(ok, isTrue); // skipping must let the cursor advance
    expect(await readAccount('a1'), isNull);
  });

  test(
    'an unknown resource is skipped (forward-compat), returns true',
    () async {
      final ok = await applier.apply({
        'resource': 'future_thing',
        'resourceId': 'x',
        'op': 'upsert',
        'payload': {'id': 'x'},
      });
      expect(ok, isTrue);
    },
  );

  test(
    'a null payload on an upsert (server poison-pill marker) is skipped',
    () async {
      // The server sends payload:null + payloadError:true for a corrupt row.
      final ok = await applier.apply({
        'resource': 'accounts',
        'resourceId': 'a1',
        'op': 'upsert',
        'payload': null,
        'payloadError': true,
        'at': 1000,
      });
      expect(ok, isTrue); // must advance past it, not wedge
      expect(await readAccount('a1'), isNull);
    },
  );
}
