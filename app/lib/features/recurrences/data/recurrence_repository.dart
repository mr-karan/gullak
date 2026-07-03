import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/clock.dart';
import '../../../core/logger.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../sync/changelog_writer.dart';

export '../../../data/db/database.dart' show RecurrenceRow;

class RecurrenceRepository {
  RecurrenceRepository(this._db, {ChangeLogWriter? changes})
    : _changes = changes;

  final AppDatabase _db;
  final ChangeLogWriter? _changes;
  static const _uuid = Uuid();

  Future<void> _logRow(String id) async {
    if (_changes == null) return;
    final row = await (_db.select(
      _db.recurrences,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (row != null) await _changes.upsert('recurrences', id, row.toJson());
  }

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
            // Anchor to the chosen day so month-end schedules don't drift.
            anchorDay: Value(nextDate.day),
          ),
        );
    await _logRow(id);
    return id;
  }

  Future<void> delete(String id) async {
    await (_db.delete(_db.recurrences)..where((t) => t.id.equals(id))).go();
    await _changes?.delete('recurrences', id);
  }

  /// Post transactions for every recurrence whose `nextDate` is on or before
  /// [asOf] (default: today), advancing each schedule past today. Catches up
  /// missed periods (app not opened for weeks) by looping per occurrence.
  ///
  /// Idempotent by construction: each occurrence's transaction id is a
  /// deterministic UUIDv5 of (recurrenceId, occurrence date), so re-running —
  /// or a second device posting the same occurrence before sync — upserts the
  /// same row rather than double-booking (LWW dedups by id on sync). Returns
  /// the number of transactions posted.
  Future<int> postDue({DateTime? asOf}) async {
    final today = _dateOnly(asOf ?? clock.now());
    final todayYmd = _ymd(today);
    final due = await (_db.select(
      _db.recurrences,
    )..where((t) => t.nextDate.isSmallerOrEqualValue(todayYmd))).get();
    var posted = 0;
    for (final r in due) {
      var occ = _tryParseYmd(r.nextDate);
      if (occ == null) {
        log.w('recurrence ${r.id} has unparseable nextDate "${r.nextDate}"');
        continue;
      }
      // Anchor day drives monthly/yearly clamping so a 31st schedule doesn't
      // permanently drift to the 28th after February. Fall back to the current
      // nextDate's day for legacy rows written before the column existed.
      final anchor = r.anchorDay ?? occ.day;
      // Cap the catch-up so a corrupt far-past date can't spin forever.
      var guard = 0;
      while (!occ!.isAfter(today) && guard < 400) {
        if (await _postOccurrence(r, occ)) posted += 1;
        occ = _advance(occ, r.cadence, anchor);
        guard += 1;
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      await (_db.update(
        _db.recurrences,
      )..where((t) => t.id.equals(r.id))).write(
        RecurrencesCompanion(nextDate: Value(_ymd(occ)), updatedAt: Value(now)),
      );
      await _logRow(r.id);
    }
    if (posted > 0) log.i('recurrences: posted $posted due transaction(s)');
    return posted;
  }

  /// Insert one occurrence's transaction if it isn't already present. Returns
  /// true when a row was created (false when it already existed — idempotent).
  Future<bool> _postOccurrence(RecurrenceRow r, DateTime occ) async {
    final txId = _occurrenceId(r.id, occ);
    final existing = await (_db.select(
      _db.transactions,
    )..where((t) => t.id.equals(txId))).getSingleOrNull();
    if (existing != null) return false;
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db
        .into(_db.transactions)
        .insertOnConflictUpdate(
          TransactionsCompanion.insert(
            id: txId,
            accountId: r.accountId,
            amountCents: r.amountCents,
            date: _ymd(occ),
            createdAt: now,
            updatedAt: now,
            categoryId: Value(r.categoryId),
            payeeId: Value(r.payeeId),
            payeeName: Value(r.payeeName),
            notes: Value(r.notes),
            origin: const Value('recurrence'),
            originRef: Value(r.id),
          ),
        );
    if (_changes != null) {
      final row = await (_db.select(
        _db.transactions,
      )..where((t) => t.id.equals(txId))).getSingleOrNull();
      if (row != null) {
        await _changes.upsert('transactions', txId, row.toJson());
      }
    }
    return true;
  }

  static String _occurrenceId(String recurrenceId, DateTime occ) => const Uuid()
      .v5(Namespace.url.value, 'gullak-recurrence:$recurrenceId:${_ymd(occ)}');

  static DateTime _advance(DateTime d, String cadence, int anchor) {
    switch (cadence) {
      case 'daily':
        return d.add(const Duration(days: 1));
      case 'weekly':
        return d.add(const Duration(days: 7));
      case 'yearly':
        return _addMonths(d, 12, anchor);
      case 'monthly':
      default:
        return _addMonths(d, 1, anchor);
    }
  }

  // Advance [n] months from [d], landing on [anchor] clamped to the target
  // month's length. Clamping against the ANCHOR (not d.day) is what prevents
  // permanent drift: Feb clamps 31→28, but March recovers to 31.
  static DateTime _addMonths(DateTime d, int n, int anchor) {
    final zero = d.month - 1 + n;
    final year = d.year + (zero ~/ 12);
    final month = (zero % 12) + 1;
    final lastDay = DateTime(year, month + 1, 0).day;
    return DateTime(year, month, anchor <= lastDay ? anchor : lastDay);
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static DateTime? _tryParseYmd(String ymd) {
    final parts = ymd.split('-');
    if (parts.length != 3) return null;
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    final day = int.tryParse(parts[2]);
    if (y == null || m == null || day == null) return null;
    return DateTime(y, m, day);
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

final Provider<RecurrenceRepository> recurrenceRepoProvider =
    Provider<RecurrenceRepository>(
      (ref) => RecurrenceRepository(
        ref.watch(dbProvider),
        changes: ref.watch(changeLogWriterProvider),
      ),
    );

final StreamProvider<List<RecurrenceRow>> recurrencesListProvider =
    StreamProvider<List<RecurrenceRow>>(
      (ref) => ref.watch(recurrenceRepoProvider).watch(),
    );
