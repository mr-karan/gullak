import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show RecurrenceRow;

class RecurrenceRepository {
  RecurrenceRepository(this._db);

  final AppDatabase _db;
  static const _uuid = Uuid();

  Stream<List<RecurrenceRow>> watch() {
    return (_db.select(_db.recurrences)..orderBy([
          (t) => OrderingTerm.asc(t.nextDate),
          (t) => OrderingTerm.asc(t.payeeName),
        ]))
        .watch();
  }

  Future<List<RecurrenceRow>> list() {
    return (_db.select(_db.recurrences)..orderBy([
          (t) => OrderingTerm.asc(t.nextDate),
          (t) => OrderingTerm.asc(t.payeeName),
        ]))
        .get();
  }

  Future<String> create({
    required String accountId,
    String? categoryId,
    String? payeeId,
    String? payeeName,
    required int amountCents,
    String? notes,
    required String cadence,
    required DateTime nextDate,
  }) async {
    final id = _uuid.v4();
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db
        .into(_db.recurrences)
        .insert(
          RecurrencesCompanion.insert(
            id: id,
            accountId: accountId,
            amountCents: amountCents,
            cadence: cadence,
            nextDate: _ymd(nextDate),
            createdAt: now,
            updatedAt: now,
            categoryId: Value(categoryId),
            payeeId: Value(payeeId),
            payeeName: Value(payeeName),
            notes: Value(notes),
          ),
        );
    return id;
  }

  Future<void> delete(String id) =>
      (_db.delete(_db.recurrences)..where((t) => t.id.equals(id))).go();

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

final Provider<RecurrenceRepository> recurrenceRepoProvider =
    Provider<RecurrenceRepository>(
      (ref) => RecurrenceRepository(ref.watch(dbProvider)),
    );

final StreamProvider<List<RecurrenceRow>> recurrencesListProvider =
    StreamProvider<List<RecurrenceRow>>(
      (ref) => ref.watch(recurrenceRepoProvider).watch(),
    );
