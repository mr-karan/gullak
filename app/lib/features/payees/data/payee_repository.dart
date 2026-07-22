import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../sync/changelog_writer.dart';

export '../../../data/db/database.dart' show PayeeRow;

class PayeeRepository {
  PayeeRepository(this._db, {ChangeLogWriter? changes}) : _changes = changes;
  final AppDatabase _db;
  final ChangeLogWriter? _changes;
  static const _uuid = Uuid();

  Future<T> _command<T>(Future<T> Function() callback) =>
      _changes?.command(callback) ?? _db.transaction(callback);

  Future<void> _logRow(String id, {Set<String>? changedFields}) async {
    if (_changes == null) return;
    final row = await byId(id);
    if (row != null) {
      await _changes.upsert(
        'payees',
        id,
        row.toJson(),
        changedFields: changedFields,
      );
    }
  }

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

  Stream<PayeeRow?> watchById(String id) =>
      (_db.select(_db.payees)..where((t) => t.id.equals(id))).watch().map(
        (rows) => rows.isEmpty ? null : rows.first,
      );

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
    return _command(() async {
      final id = _uuid.v4();
      final now = DateTime.now().millisecondsSinceEpoch;
      await _db
          .into(_db.payees)
          .insert(
            PayeesCompanion.insert(id: id, name: name.trim(), updatedAt: now),
          );
      await _logRow(id);
      return id;
    });
  }

  Future<void> rename(String id, String name) async {
    return _command(() async {
      final now = DateTime.now().millisecondsSinceEpoch;
      await (_db.update(_db.payees)..where((t) => t.id.equals(id))).write(
        PayeesCompanion(name: Value(name.trim()), updatedAt: Value(now)),
      );
      await _logRow(id, changedFields: {'name', 'updatedAt'});
    });
  }

  Future<void> delete(String id) async {
    return _command(() async {
      final now = DateTime.now().millisecondsSinceEpoch;
      final affected = (await (_db.select(
        _db.transactions,
      )..where((t) => t.payeeId.equals(id))).get()).map((t) => t.id).toList();
      final affectedRecurrences =
          (await (_db.select(
                _db.recurrences,
              )..where((row) => row.payeeId.equals(id))).get())
              .map((row) => row.id)
              .toList();
      await _db.transaction(() async {
        await (_db.update(
          _db.transactions,
        )..where((t) => t.payeeId.equals(id))).write(
          TransactionsCompanion(
            payeeId: const Value(null),
            updatedAt: Value(now),
          ),
        );
        await (_db.update(
          _db.recurrences,
        )..where((row) => row.payeeId.equals(id))).write(
          RecurrencesCompanion(
            payeeId: const Value(null),
            updatedAt: Value(now),
          ),
        );
        await (_db.delete(_db.payees)..where((t) => t.id.equals(id))).go();
      });
      if (_changes != null) {
        for (final tid in affected) {
          final row = await (_db.select(
            _db.transactions,
          )..where((t) => t.id.equals(tid))).getSingleOrNull();
          if (row != null) {
            await _changes.upsert(
              'transactions',
              tid,
              row.toJson(),
              changedFields: {'payeeId', 'payeeName', 'updatedAt'},
            );
          }
        }
        for (final recurrenceId in affectedRecurrences) {
          final row =
              await (_db.select(_db.recurrences)
                    ..where((recurrence) => recurrence.id.equals(recurrenceId)))
                  .getSingleOrNull();
          if (row != null) {
            await _changes.upsert(
              'recurrences',
              recurrenceId,
              row.toJson(),
              changedFields: {'payeeId', 'payeeName', 'updatedAt'},
            );
          }
        }
        await _changes.delete('payees', id);
      }
    });
  }

  Future<void> bumpUseCount(String id) async {
    // Derived local projection: never replicate a counter cache.
    await _db.customStatement(
      'UPDATE payees SET use_count = use_count + 1 WHERE id = ?',
      [id],
    );
  }
}

final Provider<PayeeRepository> payeeRepoProvider = Provider<PayeeRepository>(
  (ref) => PayeeRepository(
    ref.watch(dbProvider),
    changes: ref.watch(changeLogWriterProvider),
  ),
);

final StreamProvider<List<PayeeRow>> payeesListProvider =
    StreamProvider<List<PayeeRow>>(
      (ref) => ref.watch(payeeRepoProvider).watch(),
    );

final payeeByIdProvider = StreamProvider.family<PayeeRow?, String>(
  (ref, id) => ref.watch(payeeRepoProvider).watchById(id),
);
