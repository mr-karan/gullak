import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/actual/actual_dto.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show PayeeRow;

class PayeeRepository {
  PayeeRepository(this._db);
  final AppDatabase _db;

  Future<List<PayeeRow>> list() {
    return (_db.select(_db.payees)
          ..orderBy([(t) => OrderingTerm.desc(t.useCount), (t) => OrderingTerm.asc(t.name)]))
        .get();
  }

  Future<PayeeRow?> byActualId(String actualId) {
    return (_db.select(_db.payees)..where((t) => t.actualId.equals(actualId))).getSingleOrNull();
  }

  Future<PayeeRow?> byNameInsensitive(String name) async {
    final lower = name.toLowerCase();
    final all = await list();
    for (final p in all) {
      if (p.name.toLowerCase() == lower) return p;
    }
    return null;
  }

  Future<void> upsertFromServer(List<ActualPayeeDto> remote) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db.batch((batch) {
      for (final r in remote) {
        batch.insert(
          _db.payees,
          PayeesCompanion.insert(
            id: r.id,
            actualId: Value(r.id),
            name: r.name,
            transferAcct: Value(r.transferAcct),
            updatedAt: now,
            syncStatus: const Value('synced'),
          ),
          mode: InsertMode.insertOrReplace,
        );
      }
    });
  }

  Future<void> bumpUseCount(String id) async {
    await _db.customStatement(
      'UPDATE payees SET use_count = use_count + 1 WHERE id = ?',
      [id],
    );
  }
}

final Provider<PayeeRepository> payeeRepoProvider =
    Provider<PayeeRepository>((ref) => PayeeRepository(ref.watch(dbProvider)));

final FutureProvider<List<PayeeRow>> payeesListProvider =
    FutureProvider<List<PayeeRow>>((ref) => ref.watch(payeeRepoProvider).list());
