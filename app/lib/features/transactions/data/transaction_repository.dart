import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../core/clock.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../sync/changelog_writer.dart';

export '../../../data/db/database.dart' show TransactionRow;

class TransactionListItem {
  const TransactionListItem({
    required this.id,
    required this.amountCents,
    required this.date,
    required this.dateLabel,
    required this.cleared,
    required this.isTransfer,
    required this.isSplit,
    this.accountName,
    this.payeeName,
    this.categoryName,
    this.categoryIcon,
    this.transferAccountName,
    this.notes,
  });

  final String id;
  final int amountCents;
  final String date;
  final String dateLabel;
  final bool cleared;
  final bool isTransfer;
  final bool isSplit;
  final String? accountName;
  final String? payeeName;
  final String? categoryName;
  final String? categoryIcon;
  final String? transferAccountName;
  final String? notes;
}

class TransactionRepository {
  TransactionRepository(this._db, {ChangeLogWriter? changes})
    : _changes = changes;
  final AppDatabase _db;
  final ChangeLogWriter? _changes;
  static const _uuid = Uuid();

  Future<void> _logRow(String id) async {
    if (_changes == null) return;
    final row = await byRow(id);
    if (row != null) await _changes.upsert('transactions', id, row.toJson());
  }

  // ── inserts ──────────────────────────────────────────────────────────

  /// Create a normal expense or income.
  Future<String> create({
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
    await _db
        .into(_db.transactions)
        .insert(
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
          ),
        );
    await _logRow(id);
    return id;
  }

  /// Create a transfer. We always store the *outgoing* leg as negative
  /// on the source account and the *incoming* leg as positive on the
  /// destination — caller passes a positive amount.
  Future<String> createTransfer({
    required String fromAccountId,
    required String toAccountId,
    required int amountCents,
    required DateTime date,
    String? notes,
    bool cleared = false,
  }) async {
    if (amountCents <= 0) {
      throw ArgumentError('transfer amount must be positive');
    }
    if (fromAccountId == toAccountId) {
      throw ArgumentError('transfer source and destination differ');
    }
    final group = _uuid.v4();
    final outId = _uuid.v4();
    final inId = _uuid.v4();
    final now = DateTime.now().millisecondsSinceEpoch;
    final ymd = _ymd(date);
    await _db.batch((batch) {
      batch.insert(
        _db.transactions,
        TransactionsCompanion.insert(
          id: outId,
          accountId: fromAccountId,
          amountCents: -amountCents,
          date: ymd,
          createdAt: now,
          updatedAt: now,
          notes: Value(notes),
          cleared: Value(cleared),
          origin: const Value('transfer'),
          transferAccountId: Value(toAccountId),
          transferGroupId: Value(group),
        ),
      );
      batch.insert(
        _db.transactions,
        TransactionsCompanion.insert(
          id: inId,
          accountId: toAccountId,
          amountCents: amountCents,
          date: ymd,
          createdAt: now,
          updatedAt: now,
          notes: Value(notes),
          cleared: Value(cleared),
          origin: const Value('transfer'),
          transferAccountId: Value(fromAccountId),
          transferGroupId: Value(group),
        ),
      );
    });
    await _logRow(outId);
    await _logRow(inId);
    return group;
  }

  /// Create a split transaction. The parent has [splits.fold].sum amount;
  /// each child contributes its own categoryId.
  Future<String> createSplit({
    required String accountId,
    String? payeeId,
    String? payeeName,
    required DateTime date,
    String? notes,
    bool cleared = false,
    required List<({int amountCents, String? categoryId, String? notes})>
    splits,
  }) async {
    if (splits.isEmpty) {
      throw ArgumentError('splits cannot be empty');
    }
    final total = splits.fold<int>(0, (s, x) => s + x.amountCents);
    final parentId = _uuid.v4();
    final childIds = <String>[];
    final now = DateTime.now().millisecondsSinceEpoch;
    final ymd = _ymd(date);
    await _db.batch((batch) {
      batch.insert(
        _db.transactions,
        TransactionsCompanion.insert(
          id: parentId,
          accountId: accountId,
          amountCents: total,
          date: ymd,
          createdAt: now,
          updatedAt: now,
          payeeId: Value(payeeId),
          payeeName: Value(payeeName),
          notes: Value(notes),
          cleared: Value(cleared),
          origin: const Value('split'),
          splitTotalCents: Value(total),
        ),
      );
      for (final s in splits) {
        final childId = _uuid.v4();
        childIds.add(childId);
        batch.insert(
          _db.transactions,
          TransactionsCompanion.insert(
            id: childId,
            accountId: accountId,
            amountCents: s.amountCents,
            date: ymd,
            createdAt: now,
            updatedAt: now,
            categoryId: Value(s.categoryId),
            payeeId: Value(payeeId),
            payeeName: Value(payeeName),
            notes: Value(s.notes),
            cleared: Value(cleared),
            origin: const Value('split_child'),
            parentId: Value(parentId),
          ),
        );
      }
    });
    await _logRow(parentId);
    for (final cid in childIds) {
      await _logRow(cid);
    }
    return parentId;
  }

  // ── updates / deletes ────────────────────────────────────────────────

  Future<void> update(
    String id, {
    String? accountId,
    Object? categoryId = _Sentinel.value,
    Object? payeeId = _Sentinel.value,
    Object? payeeName = _Sentinel.value,
    int? amountCents,
    DateTime? date,
    Object? notes = _Sentinel.value,
    bool? cleared,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (_db.update(_db.transactions)..where((t) => t.id.equals(id))).write(
      TransactionsCompanion(
        accountId: accountId == null ? const Value.absent() : Value(accountId),
        categoryId: _v<String?>(categoryId),
        payeeId: _v<String?>(payeeId),
        payeeName: _v<String?>(payeeName),
        amountCents: amountCents == null
            ? const Value.absent()
            : Value(amountCents),
        date: date == null ? const Value.absent() : Value(_ymd(date)),
        notes: _v<String?>(notes),
        cleared: cleared == null ? const Value.absent() : Value(cleared),
        updatedAt: Value(now),
      ),
    );
    await _logRow(id);
  }

  /// Hard-delete a transaction (and its split children / transfer pair).
  /// Returns a snapshot suitable for [restore] to put it back.
  Future<DeletedTransactionSnapshot> delete(String id) async {
    final row = await byRow(id);
    if (row == null) return DeletedTransactionSnapshot._empty();
    final children = row.splitTotalCents != null
        ? await (_db.select(
            _db.transactions,
          )..where((t) => t.parentId.equals(id))).get()
        : <TransactionRow>[];
    final transferPair = row.transferGroupId != null
        ? await (_db.select(_db.transactions)..where(
                (t) =>
                    t.transferGroupId.equals(row.transferGroupId!) &
                    t.id.isNotValue(id),
              ))
              .getSingleOrNull()
        : null;
    await _db.transaction(() async {
      if (row.splitTotalCents != null) {
        await (_db.delete(
          _db.transactions,
        )..where((t) => t.parentId.equals(id))).go();
      }
      if (row.transferGroupId != null) {
        await (_db.delete(
          _db.transactions,
        )..where((t) => t.transferGroupId.equals(row.transferGroupId!))).go();
        return;
      }
      await (_db.delete(_db.transactions)..where((t) => t.id.equals(id))).go();
    });
    if (_changes != null) {
      for (final child in children) {
        await _changes.delete('transactions', child.id);
      }
      if (transferPair != null) {
        await _changes.delete('transactions', transferPair.id);
      }
      await _changes.delete('transactions', id);
    }
    return DeletedTransactionSnapshot._(
      parent: row,
      splitChildren: children,
      transferPair: transferPair,
    );
  }

  /// Re-insert a row that came out of [delete]. Used for the Undo
  /// snackbar after a swipe-delete. Uses upsert so a stale Undo tap
  /// after the row has already come back doesn't throw on the PK.
  Future<void> restore(DeletedTransactionSnapshot snap) async {
    final p = snap.parent;
    if (p == null) return;
    await _db.transaction(() async {
      await _db.into(_db.transactions).insertOnConflictUpdate(p);
      for (final c in snap.splitChildren) {
        await _db.into(_db.transactions).insertOnConflictUpdate(c);
      }
      final pair = snap.transferPair;
      if (pair != null) {
        await _db.into(_db.transactions).insertOnConflictUpdate(pair);
      }
    });
    await _logRow(p.id);
    for (final c in snap.splitChildren) {
      await _logRow(c.id);
    }
    final pair = snap.transferPair;
    if (pair != null) await _logRow(pair.id);
  }

  // ── reads ────────────────────────────────────────────────────────────

  Future<TransactionRow?> byRow(String id) => (_db.select(
    _db.transactions,
  )..where((t) => t.id.equals(id))).getSingleOrNull();

  Future<TransactionListItem?> byId(String id) async {
    final rows = await _select(idEquals: id).get();
    if (rows.isEmpty) return null;
    return _mapRow(rows.first);
  }

  Stream<List<TransactionListItem>> watchRecent({int limit = 25}) {
    return _select(
      visibleOnly: true,
      limit: limit,
    ).watch().map((rows) => rows.map(_mapRow).toList());
  }

  Stream<List<TransactionListItem>> watchAll({
    String? accountId,
    String? search,
  }) {
    return _select(
      visibleOnly: true,
      accountId: accountId,
      search: search,
    ).watch().map((rows) => rows.map(_mapRow).toList());
  }

  Future<int> sumSpendInRange({DateTime? from, DateTime? to}) async {
    final sumExpr = _db.transactions.amountCents.sum();
    final q = _db.selectOnly(_db.transactions)
      ..addColumns([sumExpr])
      ..where(
        _db.transactions.amountCents.isSmallerThanValue(0) &
            _db.transactions.parentId.isNull() &
            _db.transactions.transferGroupId.isNull(),
      );
    if (from != null) {
      q.where(_db.transactions.date.isBiggerOrEqualValue(_ymd(from)));
    }
    if (to != null) {
      q.where(_db.transactions.date.isSmallerOrEqualValue(_ymd(to)));
    }
    final r = await q.getSingle();
    return r.read(sumExpr) ?? 0;
  }

  Future<int> sumIncomeInRange({DateTime? from, DateTime? to}) async {
    final sumExpr = _db.transactions.amountCents.sum();
    final q = _db.selectOnly(_db.transactions)
      ..addColumns([sumExpr])
      ..where(
        _db.transactions.amountCents.isBiggerThanValue(0) &
            _db.transactions.parentId.isNull() &
            _db.transactions.transferGroupId.isNull(),
      );
    if (from != null) {
      q.where(_db.transactions.date.isBiggerOrEqualValue(_ymd(from)));
    }
    if (to != null) {
      q.where(_db.transactions.date.isSmallerOrEqualValue(_ymd(to)));
    }
    final r = await q.getSingle();
    return r.read(sumExpr) ?? 0;
  }

  Future<int> sumByCategoryInMonth(String categoryId, String yyyymm) async {
    final start = '$yyyymm-01';
    final end = _lastDayOfMonth(yyyymm);
    final sumExpr = _db.transactions.amountCents.sum();
    final r =
        await (_db.selectOnly(_db.transactions)
              ..addColumns([sumExpr])
              ..where(
                _db.transactions.categoryId.equals(categoryId) &
                    _db.transactions.date.isBiggerOrEqualValue(start) &
                    _db.transactions.date.isSmallerOrEqualValue(end),
              ))
            .getSingle();
    return r.read(sumExpr) ?? 0;
  }

  // ── duplicate detection ──────────────────────────────────────────────

  Future<TransactionListItem?> findNearDuplicate({
    required String accountId,
    required int amountCents,
    required DateTime date,
    String? payeeName,
  }) async {
    final lo = _ymd(date.subtract(const Duration(days: 2)));
    final hi = _ymd(date.add(const Duration(days: 2)));
    final rows = await _select(
      accountId: accountId,
      amountEquals: amountCents,
      dateBetween: (lo, hi),
    ).get();
    if (rows.isEmpty) return null;
    if (payeeName == null) return _mapRow(rows.first);
    final wanted = payeeName.toLowerCase();
    rows.sort((a, b) {
      final pa =
          (a.readTableOrNull(_db.payees)?.name ??
                  a.readTable(_db.transactions).payeeName ??
                  '')
              .toLowerCase();
      final pb =
          (b.readTableOrNull(_db.payees)?.name ??
                  b.readTable(_db.transactions).payeeName ??
                  '')
              .toLowerCase();
      return _editDistance(pa, wanted).compareTo(_editDistance(pb, wanted));
    });
    return _mapRow(rows.first);
  }

  // ── plumbing ────────────────────────────────────────────────────────

  JoinedSelectStatement<HasResultSet, dynamic> _select({
    bool visibleOnly = false,
    String? idEquals,
    String? accountId,
    String? search,
    int? amountEquals,
    (String, String)? dateBetween,
    int? limit,
  }) {
    final transferAccount = _db.alias(_db.accounts, 'transferAccount');
    final q =
        _db.select(_db.transactions).join([
          leftOuterJoin(
            _db.payees,
            _db.payees.id.equalsExp(_db.transactions.payeeId),
          ),
          leftOuterJoin(
            _db.categories,
            _db.categories.id.equalsExp(_db.transactions.categoryId),
          ),
          leftOuterJoin(
            _db.accounts,
            _db.accounts.id.equalsExp(_db.transactions.accountId),
          ),
          leftOuterJoin(
            transferAccount,
            transferAccount.id.equalsExp(_db.transactions.transferAccountId),
          ),
        ])..orderBy([
          OrderingTerm.desc(_db.transactions.date),
          OrderingTerm.desc(_db.transactions.createdAt),
        ]);
    if (visibleOnly) {
      // Hide split *children* — the parent header represents the row in lists.
      q.where(_db.transactions.parentId.isNull());
    }
    if (idEquals != null) q.where(_db.transactions.id.equals(idEquals));
    if (accountId != null) {
      q.where(_db.transactions.accountId.equals(accountId));
    }
    if (amountEquals != null) {
      q.where(_db.transactions.amountCents.equals(amountEquals));
    }
    if (dateBetween != null) {
      q.where(
        _db.transactions.date.isBetweenValues(dateBetween.$1, dateBetween.$2),
      );
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
    if (limit != null) q.limit(limit);
    return q;
  }

  TransactionListItem _mapRow(TypedResult r) {
    final t = r.readTable(_db.transactions);
    final p = r.readTableOrNull(_db.payees);
    final c = r.readTableOrNull(_db.categories);
    final a = r.readTableOrNull(_db.accounts);
    final transferAccount = _db.alias(_db.accounts, 'transferAccount');
    final tA = r.readTableOrNull(transferAccount);
    return TransactionListItem(
      id: t.id,
      amountCents: t.amountCents,
      date: t.date,
      dateLabel: _humanDate(t.date),
      cleared: t.cleared,
      isTransfer: t.transferGroupId != null,
      isSplit: t.splitTotalCents != null,
      accountName: a?.name,
      payeeName: p?.name ?? t.payeeName,
      categoryName: c?.name,
      categoryIcon: c?.icon,
      transferAccountName: tA?.name,
      notes: t.notes,
    );
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  static String _lastDayOfMonth(String yyyymm) {
    final parts = yyyymm.split('-');
    final y = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    final last = DateTime(y, m + 1, 0).day;
    return '$yyyymm-${last.toString().padLeft(2, '0')}';
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

  static int _editDistance(String a, String b) {
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

  static Value<T?> _v<T>(Object? v) =>
      identical(v, _Sentinel.value) ? const Value.absent() : Value(v as T?);
}

enum _Sentinel { value }

/// Snapshot of a deleted transaction so [TransactionRepository.restore]
/// can undo a swipe-delete. Carries the parent row plus any split
/// children or the paired transfer leg.
class DeletedTransactionSnapshot {
  const DeletedTransactionSnapshot._({
    required this.parent,
    required this.splitChildren,
    this.transferPair,
  });

  factory DeletedTransactionSnapshot._empty() =>
      const DeletedTransactionSnapshot._(
        parent: null,
        splitChildren: <TransactionRow>[],
      );

  final TransactionRow? parent;
  final List<TransactionRow> splitChildren;
  final TransactionRow? transferPair;

  bool get isEmpty => parent == null;
}

final Provider<TransactionRepository> transactionRepoProvider =
    Provider<TransactionRepository>(
      (ref) => TransactionRepository(
        ref.watch(dbProvider),
        changes: ref.watch(changeLogWriterProvider),
      ),
    );

final StreamProvider<List<TransactionListItem>> recentTransactionsProvider =
    StreamProvider<List<TransactionListItem>>(
      (ref) => ref.watch(transactionRepoProvider).watchRecent(),
    );

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

final transactionsListProvider =
    StreamProvider.family<List<TransactionListItem>, TransactionListQuery>(
      (ref, q) => ref
          .watch(transactionRepoProvider)
          .watchAll(accountId: q.accountId, search: q.search),
    );

final transactionByIdProvider =
    FutureProvider.family<TransactionListItem?, String>(
      (ref, id) => ref.watch(transactionRepoProvider).byId(id),
    );

final FutureProvider<int> monthSpendProvider = FutureProvider<int>((ref) async {
  ref.watch(recentTransactionsProvider);
  final now = clock.now();
  final from = DateTime(now.year, now.month, 1);
  final to = DateTime(now.year, now.month + 1, 0);
  return ref.watch(transactionRepoProvider).sumSpendInRange(from: from, to: to);
});

final FutureProvider<int> monthIncomeProvider = FutureProvider<int>((
  ref,
) async {
  ref.watch(recentTransactionsProvider);
  final now = clock.now();
  final from = DateTime(now.year, now.month, 1);
  final to = DateTime(now.year, now.month + 1, 0);
  return ref
      .watch(transactionRepoProvider)
      .sumIncomeInRange(from: from, to: to);
});

final FutureProvider<int> todaySpendProvider = FutureProvider<int>((ref) async {
  ref.watch(recentTransactionsProvider);
  final today = clock.today();
  return ref
      .watch(transactionRepoProvider)
      .sumSpendInRange(from: today, to: today);
});
