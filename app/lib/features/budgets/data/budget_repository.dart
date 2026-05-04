import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/clock.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';
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
  BudgetRepository(this._db);
  final AppDatabase _db;
  static const _uuid = Uuid();

  static String monthOf(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';

  static String currentMonth() => monthOf(clock.now());

  Future<void> setTarget({
    required String categoryId,
    required String month,
    required int targetCents,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing =
        await (_db.select(_db.budgets)..where(
              (b) => b.categoryId.equals(categoryId) & b.month.equals(month),
            ))
            .getSingleOrNull();
    if (existing == null) {
      await _db
          .into(_db.budgets)
          .insert(
            BudgetsCompanion.insert(
              id: _uuid.v4(),
              categoryId: categoryId,
              month: month,
              targetCents: targetCents,
              updatedAt: now,
            ),
          );
    } else {
      await (_db.update(
        _db.budgets,
      )..where((b) => b.id.equals(existing.id))).write(
        BudgetsCompanion(
          targetCents: Value(targetCents),
          updatedAt: Value(now),
        ),
      );
    }
  }

  Future<void> clearTarget({
    required String categoryId,
    required String month,
  }) async {
    await (_db.delete(_db.budgets)..where(
          (b) => b.categoryId.equals(categoryId) & b.month.equals(month),
        ))
        .go();
  }

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
    final entries = <BudgetSummary>[];
    var totalAssigned = 0;
    var totalSpent = 0;
    for (final c in categories) {
      final spent = await txRepo.sumByCategoryInMonth(c.id, month);
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
      (ref) => BudgetRepository(ref.watch(dbProvider)),
    );

final budgetMonthProvider = FutureProvider.family<BudgetMonthOverview, String>((
  ref,
  month,
) {
  // Re-derive when transactions or categories change.
  ref.watch(recentTransactionsProvider);
  return ref.watch(budgetRepoProvider).summary(month);
});
