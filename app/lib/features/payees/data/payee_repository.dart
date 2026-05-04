import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show PayeeRow;

class PayeeRepository {
  PayeeRepository(this._db);
  final AppDatabase _db;
  static const _uuid = Uuid();

  Stream<List<PayeeRow>> watch() {
    return (_db.select(_db.payees)..orderBy([
          (t) => OrderingTerm.desc(t.useCount),
          (t) => OrderingTerm.asc(t.name),
        ]))
        .watch();
  }

  Future<List<PayeeRow>> list() {
    return (_db.select(_db.payees)..orderBy([
          (t) => OrderingTerm.desc(t.useCount),
          (t) => OrderingTerm.asc(t.name),
        ]))
        .get();
  }

  Future<PayeeRow?> byId(String id) =>
      (_db.select(_db.payees)..where((t) => t.id.equals(id))).getSingleOrNull();

  Future<PayeeRow?> byName(String name) async {
    final lower = name.trim().toLowerCase();
    if (lower.isEmpty) return null;
    final all = await list();
    for (final p in all) {
      if (p.name.toLowerCase() == lower) return p;
    }
    return null;
  }

  /// Find-or-create. Returns the payee id either way.
  Future<String> ensure(String name) async {
    final existing = await byName(name);
    if (existing != null) return existing.id;
    return create(name.trim());
  }

  Future<String> create(String name) async {
    final id = _uuid.v4();
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db
        .into(_db.payees)
        .insert(
          PayeesCompanion.insert(id: id, name: name.trim(), updatedAt: now),
        );
    return id;
  }

  Future<void> rename(String id, String name) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (_db.update(_db.payees)..where((t) => t.id.equals(id))).write(
      PayeesCompanion(name: Value(name.trim()), updatedAt: Value(now)),
    );
  }

  Future<void> delete(String id) async {
    await _db.transaction(() async {
      await (_db.update(_db.transactions)..where((t) => t.payeeId.equals(id)))
          .write(const TransactionsCompanion(payeeId: Value(null)));
      await (_db.delete(_db.payees)..where((t) => t.id.equals(id))).go();
    });
  }

  Future<void> bumpUseCount(String id) async {
    await _db.customStatement(
      'UPDATE payees SET use_count = use_count + 1 WHERE id = ?',
      [id],
    );
  }
}

final Provider<PayeeRepository> payeeRepoProvider = Provider<PayeeRepository>(
  (ref) => PayeeRepository(ref.watch(dbProvider)),
);

final StreamProvider<List<PayeeRow>> payeesListProvider =
    StreamProvider<List<PayeeRow>>(
      (ref) => ref.watch(payeeRepoProvider).watch(),
    );
