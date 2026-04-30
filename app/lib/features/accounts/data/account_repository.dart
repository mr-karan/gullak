import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/actual/actual_dto.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show AccountRow;

class AccountRepository {
  AccountRepository(this._db);
  final AppDatabase _db;

  Future<List<AccountRow>> list({bool includeClosed = false}) async {
    final q = _db.select(_db.accounts);
    if (!includeClosed) {
      q.where((t) => t.closed.equals(false));
    }
    q.orderBy([(t) => OrderingTerm.asc(t.sortOrder), (t) => OrderingTerm.asc(t.name)]);
    return q.get();
  }

  Future<AccountRow?> byId(String id) {
    return (_db.select(_db.accounts)..where((t) => t.id.equals(id))).getSingleOrNull();
  }

  Future<AccountRow?> byActualId(String actualId) {
    return (_db.select(_db.accounts)..where((t) => t.actualId.equals(actualId))).getSingleOrNull();
  }

  /// Replace the local set of accounts to match the server. Local-only
  /// (no actual_id) rows are preserved. Maps are keyed by `actual_id`.
  Future<void> upsertFromServer(List<ActualAccountDto> remote) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing = await list(includeClosed: true);
    final byActual = {
      for (final a in existing.where((a) => a.actualId != null)) a.actualId!: a,
    };
    await _db.batch((batch) {
      for (final r in remote) {
        final local = byActual[r.id];
        if (local == null) {
          batch.insert(
            _db.accounts,
            AccountsCompanion.insert(
              id: r.id, // reuse server id as local id when not yet known
              actualId: Value(r.id),
              name: r.name,
              offbudget: Value(r.offbudget),
              closed: Value(r.closed),
              sortOrder: Value(r.sortOrder),
              balanceCents: Value(r.balance),
              updatedAt: now,
              syncStatus: const Value('synced'),
            ),
          );
        } else {
          batch.update(
            _db.accounts,
            AccountsCompanion(
              name: Value(r.name),
              offbudget: Value(r.offbudget),
              closed: Value(r.closed),
              sortOrder: Value(r.sortOrder),
              balanceCents: Value(r.balance),
              updatedAt: Value(now),
              syncStatus: const Value('synced'),
              syncError: const Value(null),
            ),
            where: (t) => t.id.equals(local.id),
          );
        }
      }
    });
  }
}

final Provider<AccountRepository> accountRepoProvider =
    Provider<AccountRepository>((ref) => AccountRepository(ref.watch(dbProvider)));

final FutureProvider<List<AccountRow>> accountsListProvider =
    FutureProvider<List<AccountRow>>((ref) {
  return ref.watch(accountRepoProvider).list();
});
