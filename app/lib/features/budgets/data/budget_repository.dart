import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/clock.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../sync/sync_writer.dart';
import '../../categories/data/category_repository.dart';
import '../../transactions/data/transaction_repository.dart';

export '../../../data/db/database.dart' show BudgetRow;

class BudgetSummary {
  const BudgetSummary({
    required this.categoryId,
    required this.categoryName,
    required this.groupName,
    required this.targetCents,
    required this.spentCents,
  });

  final String categoryId;
  final String categoryName;
  final String groupName;
  final int targetCents;
  final int spentCents; // negative number when there's spend

  /// Positive = unspent, negative = overspent.
  int get availableCents => targetCents + spentCents;
  bool get isOverspent => availableCents < 0;
  double get progress {
    if (targetCents <= 0) return 0;
    final used = -spentCents;
    return (used / targetCents).clamp(0.0, 1.0);
  }
}

class BudgetMonthOverview {
  const BudgetMonthOverview({
    required this.month,
    required this.entries,
    required this.totalAssigned,
    required this.totalSpent,
  });

  final String month; // YYYY-MM
  final List<BudgetSummary> entries;
  final int totalAssigned;
  final int totalSpent; // negative
}

class BudgetRepository {
  BudgetRepository(this._db, {SyncWriter? changes}) : _changes = changes;
  final AppDatabase _db;
  final SyncWriter? _changes;
  static const _uuid = Uuid();

  Future<T> _command<T>(Future<T> Function() callback) =>
      _changes?.command(callback) ?? _db.transaction(callback);

  Future<void> _logRow(String id, {Set<String>? changedFields}) async {
    if (_changes == null) return;
    final row = await (_db.select(
      _db.budgets,
    )..where((b) => b.id.equals(id))).getSingleOrNull();
    if (row != null) {
      await _changes.upsert(
        'budgets',
        id,
        row.toJson(),
        changedFields: changedFields,
      );
    }
  }

  static String monthOf(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';

  static String currentMonth() => monthOf(clock.now());

  static String shiftMonth(String month, int by) {
    final d = DateTime.parse('$month-01');
    return monthOf(DateTime(d.year, d.month + by, 1));
  }

  Future<void> setTarget({
    required String categoryId,
    required String month,
    required int targetCents,
  }) async {
    return _command(() async {
      final now = DateTime.now().millisecondsSinceEpoch;
      final existing =
          await (_db.select(_db.budgets)..where(
                (b) => b.categoryId.equals(categoryId) & b.month.equals(month),
              ))
              .getSingleOrNull();
      final String id;
      if (existing == null) {
        id = _uuid.v4();
        await _db
            .into(_db.budgets)
            .insert(
              BudgetsCompanion.insert(
                id: id,
                categoryId: categoryId,
                month: month,
                targetCents: targetCents,
                updatedAt: now,
              ),
            );
      } else {
        id = existing.id;
        await (_db.update(
          _db.budgets,
        )..where((b) => b.id.equals(existing.id))).write(
          BudgetsCompanion(
            targetCents: Value(targetCents),
            updatedAt: Value(now),
          ),
        );
      }
      await _logRow(
        id,
        changedFields: existing == null ? null : {'targetCents', 'updatedAt'},
      );
    });
  }

  Future<void> clearTarget({
    required String categoryId,
    required String month,
  }) async {
    return _command(() async {
      final affected =
          (await (_db.select(_db.budgets)..where(
                    (b) =>
                        b.categoryId.equals(categoryId) & b.month.equals(month),
                  ))
                  .get())
              .map((b) => b.id)
              .toList();
      await (_db.delete(_db.budgets)..where(
            (b) => b.categoryId.equals(categoryId) & b.month.equals(month),
          ))
          .go();
      if (_changes != null) {
        for (final id in affected) {
          await _changes.delete('budgets', id);
        }
      }
    });
  }

  Future<int> copyTargetsFromPreviousMonth(String month) async {
    return _command(() async {
      final previousMonth = shiftMonth(month, -1);
      final previousTargets = await (_db.select(
        _db.budgets,
      )..where((b) => b.month.equals(previousMonth))).get();
      if (previousTargets.isEmpty) return 0;

      var copied = 0;
      for (final target in previousTargets) {
        await setTarget(
          categoryId: target.categoryId,
          month: month,
          targetCents: target.targetCents,
        );
        copied++;
      }
      return copied;
    });
  }

  /// Drift stream over the entire budgets table. Used by providers that
  /// derive views from budgets so they re-run when any target is added,
  /// edited, or removed.
  Stream<List<BudgetRow>> watchAll() => _db.select(_db.budgets).watch();

  /// Compose a list of all categories with their budget + spend for the
  /// month. Categories without a target appear with target=0.
  Future<BudgetMonthOverview> summary(String month) async {
    final categories =
        await (_db.select(_db.categories)
              ..where((c) => c.hidden.equals(false))
              ..orderBy([
                (c) => OrderingTerm.asc(c.sortOrder),
                (c) => OrderingTerm.asc(c.name),
              ]))
            .get();
    final groups = await _db.select(_db.categoryGroups).get();
    final groupName = {for (final g in groups) g.id: g.name};
    final budgets = await (_db.select(
      _db.budgets,
    )..where((b) => b.month.equals(month))).get();
    final targetByCat = {for (final b in budgets) b.categoryId: b.targetCents};

    final txRepo = TransactionRepository(_db);
    // One grouped query instead of one SUM per category (was an N+1 that made
    // the Budget screen lag on large histories).
    final spentByCat = await txRepo.sumByCategoryForMonth(month);
    final entries = <BudgetSummary>[];
    var totalAssigned = 0;
    var totalSpent = 0;
    for (final c in categories) {
      final spent = spentByCat[c.id] ?? 0;
      final target = targetByCat[c.id] ?? 0;
      totalAssigned += target;
      totalSpent += spent;
      entries.add(
        BudgetSummary(
          categoryId: c.id,
          categoryName: c.name,
          groupName: groupName[c.groupId] ?? 'Other',
          targetCents: target,
          spentCents: spent,
        ),
      );
    }
    return BudgetMonthOverview(
      month: month,
      entries: entries,
      totalAssigned: totalAssigned,
      totalSpent: totalSpent,
    );
  }
}

final Provider<BudgetRepository> budgetRepoProvider =
    Provider<BudgetRepository>(
      (ref) => BudgetRepository(
        ref.watch(dbProvider),
        changes: ref.watch(syncWriterProvider),
      ),
    );

final budgetsListProvider = StreamProvider<List<BudgetRow>>(
  (ref) => ref.watch(budgetRepoProvider).watchAll(),
);

final budgetMonthProvider = FutureProvider.family<BudgetMonthOverview, String>((
  ref,
  month,
) {
  // Re-derive when transactions, budgets, or categories change. Without
  // the budget/category watchers the overview stayed cached after the
  // user edited a target or hid a category until pull-to-refresh.
  ref.watch(recentTransactionsProvider);
  ref.watch(budgetsListProvider);
  ref.watch(categoriesListProvider);
  return ref.watch(budgetRepoProvider).summary(month);
});
