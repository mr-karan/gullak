import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../core/clock.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../core/dates.dart';
import '../../../sync/sync_writer.dart';
import '../../../sync/crdt_resources.dart';

export '../../../data/db/database.dart' show TransactionRow;

class TransactionListItem {
  const TransactionListItem({
    required this.id,
    required this.amountCents,
    required this.date,
    required this.dateLabel,
    required this.cleared,
    this.reconciled = false,
    required this.isTransfer,
    required this.isSplit,
    this.isGroupParent = false,
    this.groupParentId,
    this.accountName,
    this.payeeName,
    this.categoryName,
    this.categoryIcon,
    this.categoryColor,
    this.transferAccountName,
    this.notes,
    this.origin,
    this.originRef,
  });

  final String id;
  final int amountCents;
  final String date;
  final String dateLabel;
  final bool cleared;
  // Reconciliation lock (#42): set when an account reconcile confirmed this
  // cleared row against the bank. Reconciled rows are frozen server-side.
  final bool reconciled;
  final bool isTransfer;
  final bool isSplit;
  // Grouping (#46): a group parent collapses N children; each child points back
  // via [groupParentId]. The parent's stored amount is 0 — its shown total is
  // derived from its children so aggregates never double-count.
  final bool isGroupParent;
  final String? groupParentId;
  final String? accountName;
  final String? payeeName;
  final String? categoryName;
  final String? categoryIcon;
  final int? categoryColor;
  final String? transferAccountName;
  final String? notes;
  final String? origin;
  final String? originRef;
}

class TransactionRepository {
  TransactionRepository(this._db, {SyncWriter? changes}) : _changes = changes;
  final AppDatabase _db;
  final SyncWriter? _changes;
  static const _uuid = Uuid();

  Future<T> _command<T>(Future<T> Function() callback) =>
      _changes?.command(callback) ?? _db.transaction(callback);

  Future<void> _logRow(String id, {Set<String>? changedFields}) async {
    if (_changes == null) return;
    final row = await byRow(id);
    if (row != null) {
      await _changes.upsert(
        'transactions',
        id,
        row.toJson(),
        changedFields: changedFields,
      );
    }
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
    double? latitude,
    double? longitude,
    String? locationName,
    bool cleared = false,
    String origin = 'manual',
    String? originRef,
    int? originalAmountCents,
    String? originalCurrency,
  }) async {
    return _command(() async {
      final id = _uuid.v4();
      final now = DateTime.now().millisecondsSinceEpoch;
      await _db
          .into(_db.transactions)
          .insert(
            TransactionsCompanion.insert(
              id: id,
              accountId: accountId,
              amountCents: amountCents,
              date: ymd(date),
              createdAt: now,
              updatedAt: now,
              categoryId: Value(categoryId),
              payeeId: Value(payeeId),
              payeeName: Value(payeeName),
              notes: Value(notes),
              latitude: Value(
                latitude == null ? null : quantizeSyncCoordinate(latitude),
              ),
              longitude: Value(
                longitude == null ? null : quantizeSyncCoordinate(longitude),
              ),
              locationName: Value(locationName),
              cleared: Value(cleared),
              origin: Value(origin),
              originRef: Value(originRef),
              originalAmountCents: Value(originalAmountCents),
              originalCurrency: Value(originalCurrency),
            ),
          );
      await _logRow(id);
      return id;
    });
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
    return _command(() async {
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
      final dateStr = ymd(date);
      await _db.batch((batch) {
        batch.insert(
          _db.transactions,
          TransactionsCompanion.insert(
            id: outId,
            accountId: fromAccountId,
            amountCents: -amountCents,
            date: dateStr,
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
            date: dateStr,
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
    });
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
    return _command(() async {
      if (splits.isEmpty) {
        throw ArgumentError('splits cannot be empty');
      }
      final total = splits.fold<int>(0, (s, x) => s + x.amountCents);
      final parentId = _uuid.v4();
      final childIds = <String>[];
      final now = DateTime.now().millisecondsSinceEpoch;
      final dateStr = ymd(date);
      await _db.batch((batch) {
        batch.insert(
          _db.transactions,
          TransactionsCompanion.insert(
            id: parentId,
            accountId: accountId,
            amountCents: total,
            date: dateStr,
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
              date: dateStr,
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
    });
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
    Object? latitude = _Sentinel.value,
    Object? longitude = _Sentinel.value,
    Object? locationName = _Sentinel.value,
    bool? cleared,
    Object? originalAmountCents = _Sentinel.value,
    Object? originalCurrency = _Sentinel.value,
  }) async {
    return _command(() async {
      final now = DateTime.now().millisecondsSinceEpoch;
      await (_db.update(_db.transactions)..where((t) => t.id.equals(id))).write(
        TransactionsCompanion(
          accountId: accountId == null
              ? const Value.absent()
              : Value(accountId),
          categoryId: _v<String?>(categoryId),
          payeeId: _v<String?>(payeeId),
          payeeName: _v<String?>(payeeName),
          amountCents: amountCents == null
              ? const Value.absent()
              : Value(amountCents),
          date: date == null ? const Value.absent() : Value(ymd(date)),
          notes: _v<String?>(notes),
          latitude: _coordinateValue(latitude),
          longitude: _coordinateValue(longitude),
          locationName: _v<String?>(locationName),
          cleared: cleared == null ? const Value.absent() : Value(cleared),
          originalAmountCents: _v<int?>(originalAmountCents),
          originalCurrency: _v<String?>(originalCurrency),
          updatedAt: Value(now),
        ),
      );
      await _logRow(
        id,
        changedFields: {
          if (accountId != null) 'accountId',
          if (!identical(categoryId, _Sentinel.value)) 'categoryId',
          if (!identical(payeeId, _Sentinel.value)) 'payeeId',
          if (!identical(payeeName, _Sentinel.value)) 'payeeName',
          if (amountCents != null) 'amountCents',
          if (date != null) 'date',
          if (!identical(notes, _Sentinel.value)) 'notes',
          if (!identical(latitude, _Sentinel.value)) 'latitude',
          if (!identical(longitude, _Sentinel.value)) 'longitude',
          if (!identical(locationName, _Sentinel.value)) 'locationName',
          if (cleared != null) 'cleared',
          if (!identical(originalAmountCents, _Sentinel.value))
            'originalAmountCents',
          if (!identical(originalCurrency, _Sentinel.value)) 'originalCurrency',
          'updatedAt',
        },
      );
    });
  }

  /// Hard-delete a transaction (and its split children / transfer pair).
  /// Returns a snapshot suitable for [restore] to put it back.
  Future<DeletedTransactionSnapshot> delete(String id) async {
    return _command(() async {
      final row = await byRow(id);
      if (row == null) return DeletedTransactionSnapshot._empty();
      final children = row.splitTotalCents != null
          ? await (_db.select(
              _db.transactions,
            )..where((t) => t.parentId.equals(id))).get()
          : <TransactionRow>[];
      final tagLinks = await (_db.select(
        _db.transactionTags,
      )..where((t) => t.transactionId.equals(id))).get();
      final transferPair = row.transferGroupId != null
          ? await (_db.select(_db.transactions)..where(
                  (t) =>
                      t.transferGroupId.equals(row.transferGroupId!) &
                      t.id.isNotValue(id),
                ))
                .getSingleOrNull()
          : null;
      final deletedIds = {
        id,
        ...children.map((child) => child.id),
        if (transferPair != null) transferPair.id,
      };
      final allDeletedLinks = await (_db.select(
        _db.transactionTags,
      )..where((link) => link.transactionId.isIn(deletedIds))).get();
      await _db.transaction(() async {
        await (_db.delete(
          _db.transactionTags,
        )..where((link) => link.transactionId.isIn(deletedIds))).go();
        await (_db.delete(
          _db.transactions,
        )..where((transaction) => transaction.id.isIn(deletedIds))).go();
      });
      if (_changes != null) {
        for (final child in children) {
          await _changes.delete('transactions', child.id);
        }
        if (transferPair != null) {
          await _changes.delete('transactions', transferPair.id);
        }
        await _changes.delete('transactions', id);
        for (final link in allDeletedLinks) {
          await _changes.delete('transaction_tags', link.id);
        }
      }
      return DeletedTransactionSnapshot._(
        parent: row,
        splitChildren: children,
        transferPair: transferPair,
        tagLinks: tagLinks,
      );
    });
  }

  /// Re-insert a row that came out of [delete]. Used for the Undo
  /// snackbar after a swipe-delete. Uses upsert so a stale Undo tap
  /// after the row has already come back doesn't throw on the PK.
  Future<void> restore(DeletedTransactionSnapshot snap) async {
    return _command(() async {
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
        for (final link in snap.tagLinks) {
          await _db
              .into(_db.transactionTags)
              .insertOnConflictUpdate(
                link.copyWith(
                  id: transactionTagEntityId(link.transactionId, link.tagId),
                ),
              );
        }
      });
      await _logRow(p.id, changedFields: const {});
      for (final c in snap.splitChildren) {
        await _logRow(c.id, changedFields: const {});
      }
      final pair = snap.transferPair;
      if (pair != null) {
        await _logRow(pair.id, changedFields: const {});
      }
      for (final link in snap.tagLinks) {
        final canonical = link.copyWith(
          id: transactionTagEntityId(link.transactionId, link.tagId),
        );
        await _changes?.upsert(
          'transaction_tags',
          canonical.id,
          canonical.toJson(),
          changedFields: const {},
        );
      }
    });
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

  Stream<TransactionListItem?> watchById(String id) => _select(
    idEquals: id,
  ).watch().map((rows) => rows.isEmpty ? null : _mapRow(rows.first));

  Stream<TransactionRow?> watchRow(String id) =>
      (_db.select(_db.transactions)
            ..where((t) => t.id.equals(id))
            ..limit(1))
          .watch()
          .map((rows) => rows.isEmpty ? null : rows.first);

  Stream<List<TransactionListItem>> watchRecent({int limit = 25}) {
    return _select(
      visibleOnly: true,
      limit: limit,
    ).watch().map((rows) => rows.map(_mapRow).toList());
  }

  Stream<List<TransactionListItem>> watchAll({
    String? accountId,
    String? categoryId,
    String? search,
    String? tagId,
    String? fromDate,
    String? toDate,
    String? origin,
    bool? cleared,
    int? minAmountCents,
    int? maxAmountCents,
    String? payeeId,
    String? payeeName,
    String? smsText,
  }) {
    final stream = _select(
      visibleOnly: true,
      accountId: accountId,
      categoryId: categoryId,
      search: search,
      tagId: tagId,
      origin: origin,
      cleared: cleared,
      minAmountCents: minAmountCents,
      maxAmountCents: maxAmountCents,
      payeeId: payeeId,
      payeeName: payeeName,
      dateBetween: fromDate != null && toDate != null
          ? (fromDate, toDate)
          : null,
    ).watch().map((rows) => rows.map(_mapRow).toList());
    if (smsText == null || smsText.trim().isEmpty) return stream;
    return stream.asyncMap((rows) => _filterBySmsText(rows, smsText));
  }

  Future<List<TransactionListItem>> _filterBySmsText(
    List<TransactionListItem> rows,
    String smsText,
  ) async {
    final wanted = smsText.trim().toLowerCase();
    // One query for every matching SMS id instead of a per-row lookup (which
    // turned this filter into an O(rows) round-trip storm). `_` and `%` are
    // LIKE wildcards; escape them so a literal query char isn't treated as one.
    final needle = wanted
        .replaceAll(r'\', r'\\')
        .replaceAll('%', r'\%')
        .replaceAll('_', r'\_');
    final idCol = _db.smsMessages.id;
    final matches =
        await (_db.selectOnly(_db.smsMessages)
              ..addColumns([idCol])
              ..where(
                _db.smsMessages.body.lower().like(
                  '%$needle%',
                  escapeChar: r'\',
                ),
              ))
            .get();
    final matchedIds = matches
        .map((r) => r.read(idCol))
        .whereType<int>()
        .toSet();
    if (matchedIds.isEmpty) return const [];
    return rows
        .where(
          (row) =>
              row.origin == 'sms' &&
              matchedIds.contains(int.tryParse(row.originRef ?? '')),
        )
        .toList();
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
      q.where(_db.transactions.date.isBiggerOrEqualValue(ymd(from)));
    }
    if (to != null) {
      q.where(_db.transactions.date.isSmallerOrEqualValue(ymd(to)));
    }
    final r = await q.getSingle();
    return r.read(sumExpr) ?? 0;
  }

  /// Daily spend magnitude for the last [days] days (oldest→newest), for the
  /// Home sparkline. One grouped query; days with no spend are 0. Excludes
  /// split children and transfer legs (same filter as [sumSpendInRange]).
  Future<List<double>> dailySpendSeries({int days = 30}) async {
    final today = clock.today();
    final start = DateTime(today.year, today.month, today.day - (days - 1));
    final dateCol = _db.transactions.date;
    final sumExpr = _db.transactions.amountCents.sum();
    final rows =
        await (_db.selectOnly(_db.transactions)
              ..addColumns([dateCol, sumExpr])
              ..where(
                _db.transactions.amountCents.isSmallerThanValue(0) &
                    _db.transactions.parentId.isNull() &
                    _db.transactions.transferGroupId.isNull() &
                    dateCol.isBiggerOrEqualValue(ymd(start)) &
                    dateCol.isSmallerOrEqualValue(ymd(today)),
              )
              ..groupBy([dateCol]))
            .get();
    final byDate = <String, int>{
      for (final r in rows) (r.read(dateCol) ?? ''): (r.read(sumExpr) ?? 0),
    };
    return [
      for (var i = 0; i < days; i++)
        (byDate[ymd(DateTime(start.year, start.month, start.day + i))] ?? 0)
            .abs()
            .toDouble(),
    ];
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
      q.where(_db.transactions.date.isBiggerOrEqualValue(ymd(from)));
    }
    if (to != null) {
      q.where(_db.transactions.date.isSmallerOrEqualValue(ymd(to)));
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

  /// One-query spend-by-category for a month: `categoryId -> summed amount`.
  /// Replaces calling [sumByCategoryInMonth] once per category (an N+1 that
  /// dominated the Budget screen). Categories with no spend are simply absent
  /// from the map; callers default those to 0.
  Future<Map<String, int>> sumByCategoryForMonth(String yyyymm) async {
    final start = '$yyyymm-01';
    final end = _lastDayOfMonth(yyyymm);
    final cat = _db.transactions.categoryId;
    final sumExpr = _db.transactions.amountCents.sum();
    final rows =
        await (_db.selectOnly(_db.transactions)
              ..addColumns([cat, sumExpr])
              ..where(
                cat.isNotNull() &
                    _db.transactions.date.isBiggerOrEqualValue(start) &
                    _db.transactions.date.isSmallerOrEqualValue(end),
              )
              ..groupBy([cat]))
            .get();
    final out = <String, int>{};
    for (final r in rows) {
      final id = r.read(cat);
      if (id != null) out[id] = r.read(sumExpr) ?? 0;
    }
    return out;
  }

  // ── duplicate detection ──────────────────────────────────────────────

  Future<TransactionListItem?> findNearDuplicate({
    required String accountId,
    required int amountCents,
    required DateTime date,
    String? payeeName,
  }) async {
    final lo = ymd(date.subtract(const Duration(days: 2)));
    final hi = ymd(date.add(const Duration(days: 2)));
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
    String? categoryId,
    String? search,
    int? amountEquals,
    (String, String)? dateBetween,
    String? tagId,
    String? origin,
    bool? cleared,
    int? minAmountCents,
    int? maxAmountCents,
    String? payeeId,
    String? payeeName,
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
          if (tagId != null)
            innerJoin(
              _db.transactionTags,
              _db.transactionTags.transactionId.equalsExp(_db.transactions.id),
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
    if (categoryId != null) {
      q.where(_db.transactions.categoryId.equals(categoryId));
    }
    // A transaction links to a payee by FK (payeeId) AND/OR free-text
    // (payeeName). SMS-created and deleted-payee rows are name-only, so match
    // either — filtering on payeeId alone silently drops history.
    final pn = payeeName?.trim().toLowerCase();
    if (payeeId != null || (pn != null && pn.isNotEmpty)) {
      Expression<bool>? pred;
      if (payeeId != null) pred = _db.transactions.payeeId.equals(payeeId);
      if (pn != null && pn.isNotEmpty) {
        final byName = _db.transactions.payeeName.lower().equals(pn);
        pred = pred == null ? byName : pred | byName;
      }
      if (pred != null) q.where(pred);
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
            _db.categories.name.like(s) |
            _db.accounts.name.like(s),
      );
    }
    if (tagId != null) q.where(_db.transactionTags.tagId.equals(tagId));
    if (origin != null) q.where(_db.transactions.origin.equals(origin));
    if (cleared != null) q.where(_db.transactions.cleared.equals(cleared));
    if (minAmountCents != null) {
      q.where(
        _db.transactions.amountCents.isBiggerOrEqualValue(minAmountCents) |
            _db.transactions.amountCents.isSmallerOrEqualValue(-minAmountCents),
      );
    }
    if (maxAmountCents != null) {
      q.where(
        _db.transactions.amountCents.isBetweenValues(
          -maxAmountCents,
          maxAmountCents,
        ),
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
      reconciled: t.reconciled,
      isTransfer: t.transferGroupId != null,
      isSplit: t.splitTotalCents != null,
      isGroupParent: t.isGroupParent,
      groupParentId: t.groupParentId,
      accountName: a?.name,
      payeeName: p?.name ?? t.payeeName,
      categoryName: c?.name,
      categoryIcon: c?.icon,
      categoryColor: c?.color,
      transferAccountName: tA?.name,
      notes: t.notes,
      origin: t.origin,
      originRef: t.originRef,
    );
  }

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

  static Value<double?> _coordinateValue(Object? value) {
    if (identical(value, _Sentinel.value)) return const Value.absent();
    final coordinate = value as double?;
    return Value(
      coordinate == null ? null : quantizeSyncCoordinate(coordinate),
    );
  }

  /// Sentinel for partial-update arguments: pass this to leave a field
  /// unchanged; pass `null` to set it to null; pass a value to set it.
  static const Object unset = _Sentinel.value;
}

enum _Sentinel { value }

/// Snapshot of a deleted transaction so [TransactionRepository.restore]
/// can undo a swipe-delete. Carries the parent row plus any split
/// children or the paired transfer leg.
class DeletedTransactionSnapshot {
  const DeletedTransactionSnapshot._({
    required this.parent,
    required this.splitChildren,
    required this.tagLinks,
    this.transferPair,
  });

  factory DeletedTransactionSnapshot._empty() =>
      const DeletedTransactionSnapshot._(
        parent: null,
        splitChildren: <TransactionRow>[],
        tagLinks: <TransactionTagRow>[],
      );

  final TransactionRow? parent;
  final List<TransactionRow> splitChildren;
  final List<TransactionTagRow> tagLinks;
  final TransactionRow? transferPair;

  bool get isEmpty => parent == null;
}

final Provider<TransactionRepository> transactionRepoProvider =
    Provider<TransactionRepository>(
      (ref) => TransactionRepository(
        ref.watch(dbProvider),
        changes: ref.watch(syncWriterProvider),
      ),
    );

final StreamProvider<List<TransactionListItem>> recentTransactionsProvider =
    StreamProvider<List<TransactionListItem>>(
      (ref) => ref.watch(transactionRepoProvider).watchRecent(),
    );

class TransactionListQuery {
  const TransactionListQuery({
    this.accountId,
    this.categoryId,
    this.search,
    this.tagId,
    this.fromDate,
    this.toDate,
    this.origin,
    this.cleared,
    this.minAmountCents,
    this.maxAmountCents,
    this.payeeId,
    this.payeeName,
    this.smsText,
  });
  final String? accountId;
  final String? categoryId;
  final String? search;
  final String? tagId;
  final String? fromDate;
  final String? toDate;
  final String? origin;
  final bool? cleared;
  final int? minAmountCents;
  final int? maxAmountCents;
  final String? payeeId;
  final String? payeeName;
  final String? smsText;

  @override
  bool operator ==(Object other) =>
      other is TransactionListQuery &&
      other.accountId == accountId &&
      other.categoryId == categoryId &&
      other.search == search &&
      other.tagId == tagId &&
      other.fromDate == fromDate &&
      other.toDate == toDate &&
      other.origin == origin &&
      other.cleared == cleared &&
      other.minAmountCents == minAmountCents &&
      other.maxAmountCents == maxAmountCents &&
      other.payeeId == payeeId &&
      other.payeeName == payeeName &&
      other.smsText == smsText;

  @override
  int get hashCode => Object.hash(
    accountId,
    categoryId,
    search,
    tagId,
    fromDate,
    toDate,
    origin,
    cleared,
    minAmountCents,
    maxAmountCents,
    payeeId,
    payeeName,
    smsText,
  );
}

final transactionsListProvider =
    StreamProvider.family<List<TransactionListItem>, TransactionListQuery>(
      (ref, q) => ref
          .watch(transactionRepoProvider)
          .watchAll(
            accountId: q.accountId,
            categoryId: q.categoryId,
            search: q.search,
            tagId: q.tagId,
            fromDate: q.fromDate,
            toDate: q.toDate,
            origin: q.origin,
            cleared: q.cleared,
            minAmountCents: q.minAmountCents,
            maxAmountCents: q.maxAmountCents,
            payeeId: q.payeeId,
            payeeName: q.payeeName,
            smsText: q.smsText,
          ),
    );

final transactionByIdProvider =
    StreamProvider.family<TransactionListItem?, String>(
      (ref, id) => ref.watch(transactionRepoProvider).watchById(id),
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

/// Last-30-day daily spend series for the Home hero sparkline.
final FutureProvider<List<double>> last30DaysSpendProvider =
    FutureProvider<List<double>>((ref) async {
      ref.watch(recentTransactionsProvider);
      return ref.watch(transactionRepoProvider).dailySpendSeries(days: 30);
    });
