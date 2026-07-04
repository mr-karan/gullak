import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/budgets/data/budget_repository.dart';

/// The month (`YYYY-MM`) currently being viewed, shared across Activity,
/// Insights, and Budget so the period follows the user between tabs — look at
/// March's spending in Insights, switch to Budget, and you're still on March.
class ActiveMonth extends Notifier<String> {
  @override
  String build() => BudgetRepository.currentMonth();

  /// Jump to a specific `YYYY-MM`.
  void set(String month) => state = month;

  /// Move by whole months (negative = earlier).
  void shift(int by) => state = BudgetRepository.shiftMonth(state, by);
}

final activeMonthProvider = NotifierProvider<ActiveMonth, String>(
  ActiveMonth.new,
);
