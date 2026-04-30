import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../core/clock.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show TransactionRow;

/// View-model row for lists, joining payee + category + date label.
class TransactionListItem {
  const TransactionListItem({
    required this.id,
    required this.amountCents,
    required this.date,
    required this.dateLabel,
    required this.cleared,
    required this.syncStatus,
    this.accountName,
    this.payeeName,
    this.categoryName,
    this.notes,
  });

  final String id;
  final int amountCents;
  final String date;
  final String dateLabel;
  final bool cleared;
  final String syncStatus;
  final String? accountName;
  final String? payeeName;
  final String? categoryName;
  final String? notes;
}

class TransactionRepository {
  TransactionRepository(this._db);
  final AppDatabase _db;

  static const _uuid = Uuid();

  Future<void> insertDraft({
    required String accountId,
    String? categoryId,
    String? payeeId,
    String? payeeName,
    required int amountCents,
    required DateTime date,
    String? notes,
    bool cleared = false,
    String origin = 'manual',
    String? originRef,
  }) async {
    final id = _uuid.v4();
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db.into(_db.transactions).insert(
          TransactionsCompanion.insert(
            id: id,
            accountId: accountId,
            amountCents: amountCents,
            date: _ymd(date),
            createdAt: now,
            updatedAt: now,
            categoryId: Value(categoryId),
            payeeId: Value(payeeId),
            payeeName: Value(payeeName),
            notes: Value(notes),
            cleared: Value(cleared),
            origin: Value(origin),
            originRef: Value(originRef),
            syncStatus: const Value('pending_push'),
          ),
        );
  }

  Future<void> markSynced(String localId, String actualId) async {
    await (_db.update(_db.transactions)..where((t) => t.id.equals(localId))).write(
      TransactionsCompanion(
        actualId: Value(actualId),
        syncStatus: const Value('synced'),
        syncError: const Value(null),
      ),
    );
  }

  Future<void> markPushFailed(String localId, String error) async {
    await (_db.update(_db.transactions)..where((t) => t.id.equals(localId))).write(
      TransactionsCompanion(
        syncStatus: const Value('failed'),
        syncError: Value(error),
      ),
    );
  }

  Future<void> markDeletePending(String localId) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (_db.update(_db.transactions)..where((t) => t.id.equals(localId))).write(
      TransactionsCompanion(
        deletedAt: Value(now),
        syncStatus: const Value('pending_delete'),
        updatedAt: Value(now),
      ),
    );
  }

  Future<void> hardDelete(String localId) async {
    await (_db.delete(_db.transactions)..where((t) => t.id.equals(localId))).go();
  }

  Future<int> sumSpendInRange({DateTime? from, DateTime? to}) async {
    final q = _db.selectOnly(_db.transactions)
      ..addColumns([_db.transactions.amountCents.sum()])
      ..where(_db.transactions.deletedAt.isNull() &
          _db.transactions.amountCents.isSmallerThanValue(0));
    if (from != null) {
      q.where(_db.transactions.date.isBiggerOrEqualValue(_ymd(from)));
    }
    if (to != null) {
      q.where(_db.transactions.date.isSmallerOrEqualValue(_ymd(to)));
    }
    final r = await q.getSingle();
    final v = r.read(_db.transactions.amountCents.sum());
    return v ?? 0;
  }

  Future<List<TransactionListItem>> listRecent({int limit = 25}) async {
    final q = _db.select(_db.transactions).join([
      leftOuterJoin(_db.payees, _db.payees.id.equalsExp(_db.transactions.payeeId)),
      leftOuterJoin(_db.categories, _db.categories.id.equalsExp(_db.transactions.categoryId)),
      leftOuterJoin(_db.accounts, _db.accounts.id.equalsExp(_db.transactions.accountId)),
    ])
      ..where(_db.transactions.deletedAt.isNull())
      ..orderBy([
        OrderingTerm.desc(_db.transactions.date),
        OrderingTerm.desc(_db.transactions.createdAt),
      ])
      ..limit(limit);
    final rows = await q.get();
    return rows.map(_mapRow).toList();
  }

  Future<List<TransactionListItem>> listAll({String? accountId, String? search}) async {
    final q = _db.select(_db.transactions).join([
      leftOuterJoin(_db.payees, _db.payees.id.equalsExp(_db.transactions.payeeId)),
      leftOuterJoin(_db.categories, _db.categories.id.equalsExp(_db.transactions.categoryId)),
      leftOuterJoin(_db.accounts, _db.accounts.id.equalsExp(_db.transactions.accountId)),
    ])
      ..where(_db.transactions.deletedAt.isNull())
      ..orderBy([
        OrderingTerm.desc(_db.transactions.date),
        OrderingTerm.desc(_db.transactions.createdAt),
      ]);
    if (accountId != null) {
      q.where(_db.transactions.accountId.equals(accountId));
    }
    if (search != null && search.isNotEmpty) {
      final s = '%$search%';
      q.where(
        _db.transactions.notes.like(s) |
            _db.transactions.payeeName.like(s) |
            _db.payees.name.like(s) |
            _db.categories.name.like(s),
      );
    }
    final rows = await q.get();
    return rows.map(_mapRow).toList();
  }

  Future<TransactionListItem?> byId(String id) async {
    final q = _db.select(_db.transactions).join([
      leftOuterJoin(_db.payees, _db.payees.id.equalsExp(_db.transactions.payeeId)),
      leftOuterJoin(_db.categories, _db.categories.id.equalsExp(_db.transactions.categoryId)),
      leftOuterJoin(_db.accounts, _db.accounts.id.equalsExp(_db.transactions.accountId)),
    ])
      ..where(_db.transactions.id.equals(id));
    final r = await q.getSingleOrNull();
    if (r == null) return null;
    return _mapRow(r);
  }

  Future<TransactionRow?> rowById(String id) async {
    return (_db.select(_db.transactions)..where((t) => t.id.equals(id))).getSingleOrNull();
  }

  Future<void> updateLocal({
    required String id,
    String? accountId,
    String? categoryId,
    String? payeeId,
    String? payeeName,
    int? amountCents,
    DateTime? date,
    String? notes,
    bool? cleared,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (_db.update(_db.transactions)..where((t) => t.id.equals(id))).write(
      TransactionsCompanion(
        accountId: accountId == null ? const Value.absent() : Value(accountId),
        categoryId: categoryId == null ? const Value.absent() : Value(categoryId),
        payeeId: payeeId == null ? const Value.absent() : Value(payeeId),
        payeeName: payeeName == null ? const Value.absent() : Value(payeeName),
        amountCents: amountCents == null ? const Value.absent() : Value(amountCents),
        date: date == null ? const Value.absent() : Value(_ymd(date)),
        notes: notes == null ? const Value.absent() : Value(notes),
        cleared: cleared == null ? const Value.absent() : Value(cleared),
        syncStatus: const Value('pending_push'),
        updatedAt: Value(now),
      ),
    );
  }

  /// Pre-write near-duplicate finder. See plan/10.
  Future<TransactionListItem?> findNearDuplicate({
    required String accountId,
    required int amountCents,
    required DateTime date,
    String? payeeName,
  }) async {
    final lo = date.subtract(const Duration(days: 2));
    final hi = date.add(const Duration(days: 2));
    final q = _db.select(_db.transactions).join([
      leftOuterJoin(_db.payees, _db.payees.id.equalsExp(_db.transactions.payeeId)),
      leftOuterJoin(_db.categories, _db.categories.id.equalsExp(_db.transactions.categoryId)),
      leftOuterJoin(_db.accounts, _db.accounts.id.equalsExp(_db.transactions.accountId)),
    ])
      ..where(_db.transactions.deletedAt.isNull() &
          _db.transactions.accountId.equals(accountId) &
          _db.transactions.amountCents.equals(amountCents) &
          _db.transactions.date.isBetweenValues(_ymd(lo), _ymd(hi)));
    final rows = await q.get();
    if (rows.isEmpty) return null;
    if (payeeName == null) return _mapRow(rows.first);
    final wanted = payeeName.toLowerCase();
    rows.sort((a, b) {
      final pa = (a.readTableOrNull(_db.payees)?.name ??
              a.readTable(_db.transactions).payeeName ??
              '')
          .toLowerCase();
      final pb = (b.readTableOrNull(_db.payees)?.name ??
              b.readTable(_db.transactions).payeeName ??
              '')
          .toLowerCase();
      return _editDist(pa, wanted).compareTo(_editDist(pb, wanted));
    });
    return _mapRow(rows.first);
  }

  TransactionListItem _mapRow(TypedResult r) {
    final t = r.readTable(_db.transactions);
    final p = r.readTableOrNull(_db.payees);
    final c = r.readTableOrNull(_db.categories);
    final a = r.readTableOrNull(_db.accounts);
    return TransactionListItem(
      id: t.id,
      amountCents: t.amountCents,
      date: t.date,
      dateLabel: _humanDate(t.date),
      cleared: t.cleared,
      syncStatus: t.syncStatus,
      accountName: a?.name,
      payeeName: p?.name ?? t.payeeName,
      categoryName: c?.name,
      notes: t.notes,
    );
  }

  static String _ymd(DateTime d) {
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final dd = d.day.toString().padLeft(2, '0');
    return '$y-$m-$dd';
  }

  static String _humanDate(String ymd) {
    try {
      final d = DateTime.parse(ymd);
      final today = clock.today();
      final diff = today.difference(DateTime(d.year, d.month, d.day)).inDays;
      if (diff == 0) return 'Today';
      if (diff == 1) return 'Yesterday';
      if (diff > 1 && diff < 7) return DateFormat('EEEE').format(d);
      return DateFormat('d MMM').format(d);
    } catch (_) {
      return ymd;
    }
  }

  static int _editDist(String a, String b) {
    if (a.isEmpty) return b.length;
    if (b.isEmpty) return a.length;
    final v0 = List<int>.generate(b.length + 1, (i) => i);
    final v1 = List<int>.filled(b.length + 1, 0);
    for (var i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      for (var j = 0; j < b.length; j++) {
        final cost = a[i] == b[j] ? 0 : 1;
        v1[j + 1] = [
          v1[j] + 1,
          v0[j + 1] + 1,
          v0[j] + cost,
        ].reduce((a, b) => a < b ? a : b);
      }
      for (var j = 0; j <= b.length; j++) {
        v0[j] = v1[j];
      }
    }
    return v0[b.length];
  }
}

final Provider<TransactionRepository> transactionRepoProvider =
    Provider<TransactionRepository>((ref) {
  return TransactionRepository(ref.watch(dbProvider));
});

final FutureProvider<int> monthSpendProvider = FutureProvider<int>((ref) async {
  final repo = ref.watch(transactionRepoProvider);
  final now = clock.now();
  final from = DateTime(now.year, now.month, 1);
  final to = DateTime(now.year, now.month + 1, 0);
  final sum = await repo.sumSpendInRange(from: from, to: to);
  return sum;
});

final FutureProvider<int> todaySpendProvider = FutureProvider<int>((ref) async {
  final repo = ref.watch(transactionRepoProvider);
  final today = clock.today();
  return repo.sumSpendInRange(from: today, to: today);
});

final FutureProvider<List<TransactionListItem>> recentTransactionsProvider =
    FutureProvider<List<TransactionListItem>>((ref) async {
  final repo = ref.watch(transactionRepoProvider);
  return repo.listRecent();
});

final transactionsListProvider =
    FutureProvider.family<List<TransactionListItem>, TransactionListQuery>(
        (ref, query) {
  final repo = ref.watch(transactionRepoProvider);
  return repo.listAll(accountId: query.accountId, search: query.search);
});

class TransactionListQuery {
  const TransactionListQuery({this.accountId, this.search});
  final String? accountId;
  final String? search;

  @override
  bool operator ==(Object other) =>
      other is TransactionListQuery &&
      other.accountId == accountId &&
      other.search == search;

  @override
  int get hashCode => Object.hash(accountId, search);
}

final transactionByIdProvider =
    FutureProvider.family<TransactionListItem?, String>((ref, id) {
  final repo = ref.watch(transactionRepoProvider);
  return repo.byId(id);
});

void invalidateTransactionLists(WidgetRef ref) {
  ref.invalidate(monthSpendProvider);
  ref.invalidate(todaySpendProvider);
  ref.invalidate(recentTransactionsProvider);
  ref.invalidate(transactionsListProvider);
}
