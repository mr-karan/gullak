import 'package:drift/drift.dart' show Variable;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/widgets/money_text.dart';
import '../budgets/data/budget_repository.dart';
import '../transactions/data/transaction_repository.dart';

/// A read-only monthly report. We intentionally don't pull in a chart
/// library; numbers + a daily sparkline are enough at v1.
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  late String _month = BudgetRepository.currentMonth();

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final monthDate = DateTime.parse('$_month-01');
    final monthLabel = DateFormat('MMMM yyyy').format(monthDate);
    final async = ref.watch(budgetMonthProvider(_month));
    final daily = ref.watch(_dailySpendProvider(_month));
    final incomeSpending = ref.watch(_incomeSpendingProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: () => _shift(-1),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: () => _shift(1),
          ),
        ],
      ),
      body: ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              monthLabel,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ),
          async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
            data: (overview) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: _Stat(
                      label: 'Spent',
                      value: -overview.totalSpent,
                      symbol: prefs.currencySymbol,
                      digits: prefs.currencyMinorDigits,
                    ),
                  ),
                  Expanded(
                    child: _Stat(
                      label: 'Assigned',
                      value: overview.totalAssigned,
                      symbol: prefs.currencySymbol,
                      digits: prefs.currencyMinorDigits,
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Text(
              'Income vs spending',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          incomeSpending.when(
            loading: () => const SizedBox(height: 96),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
            data: (values) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: _IncomeSpendingChart(values: values),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              'Daily',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          daily.when(
            loading: () => const SizedBox(height: 80),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
            data: (values) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: _Sparkline(values: values),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              'By category',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          async.when(
            loading: () => const SizedBox(height: 0),
            error: (_, _) => const SizedBox(height: 0),
            data: (overview) {
              final entries =
                  overview.entries.where((e) => e.spentCents != 0).toList()
                    ..sort((a, b) => a.spentCents.compareTo(b.spentCents));
              if (entries.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 24),
                  child: Text('No spending recorded for this month yet.'),
                );
              }
              return Column(
                children: [
                  for (final e in entries)
                    ListTile(
                      title: Text(e.categoryName),
                      subtitle: Text(e.groupName),
                      trailing: MoneyText(
                        amountCents: e.spentCents,
                        symbol: prefs.currencySymbol,
                        minorDigits: prefs.currencyMinorDigits,
                      ),
                    ),
                  const SizedBox(height: 24),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  void _shift(int by) {
    final d = DateTime.parse('$_month-01');
    final next = DateTime(d.year, d.month + by, 1);
    setState(() => _month = BudgetRepository.monthOf(next));
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    required this.symbol,
    required this.digits,
  });
  final String label;
  final int value;
  final String symbol;
  final int digits;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: cs.onSurfaceVariant,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            Money.format(value, symbol: symbol, minorDigits: digits),
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ],
      ),
    );
  }
}

class _Sparkline extends StatelessWidget {
  const _Sparkline({required this.values});
  final List<int> values;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    if (values.isEmpty) return const SizedBox.shrink();
    final maxV = values
        .reduce((a, b) => a > b ? a : b)
        .clamp(1, double.infinity)
        .toInt();
    return SizedBox(
      height: 60,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final v in values)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 1),
                child: FractionallySizedBox(
                  heightFactor: v <= 0 ? 0.05 : (v / maxV).clamp(0.05, 1.0),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: cs.primary,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _IncomeSpendingMonth {
  const _IncomeSpendingMonth({
    required this.month,
    required this.incomeCents,
    required this.spendingCents,
  });

  final String month;
  final int incomeCents;
  final int spendingCents;
}

class _IncomeSpendingChart extends StatelessWidget {
  const _IncomeSpendingChart({required this.values});

  final List<_IncomeSpendingMonth> values;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    if (values.isEmpty) return const Text('No spending history yet.');
    final maxV = values
        .expand((v) => [v.incomeCents, v.spendingCents])
        .reduce((a, b) => a > b ? a : b)
        .clamp(1, double.infinity)
        .toInt();
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final v in values)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: FractionallySizedBox(
                              heightFactor: (v.incomeCents / maxV).clamp(
                                0.04,
                                1.0,
                              ),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: cs.tertiary,
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 3),
                          Expanded(
                            child: FractionallySizedBox(
                              heightFactor: (v.spendingCents / maxV).clamp(
                                0.04,
                                1.0,
                              ),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: cs.primary,
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      v.month.substring(5),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Daily *spend* per day-of-month, length = days in that month.
final _dailySpendProvider = FutureProvider.family<List<int>, String>((
  ref,
  month,
) async {
  ref.watch(recentTransactionsProvider);
  final db = ref.watch(dbProvider);
  final parts = month.split('-');
  final y = int.parse(parts[0]);
  final m = int.parse(parts[1]);
  final daysInMonth = DateTime(y, m + 1, 0).day;
  final out = List<int>.filled(daysInMonth, 0);
  final start = '$month-01';
  final end = '$month-${daysInMonth.toString().padLeft(2, '0')}';
  final rows = await db
      .customSelect(
        'SELECT date, SUM(amount_cents) AS s '
        'FROM transactions '
        'WHERE amount_cents < 0 AND parent_id IS NULL AND transfer_group_id IS NULL '
        'AND date BETWEEN ? AND ? GROUP BY date',
        variables: [Variable.withString(start), Variable.withString(end)],
      )
      .get();
  for (final r in rows) {
    final date = r.read<String>('date');
    final s = r.read<int>('s');
    final day = int.parse(date.split('-')[2]) - 1;
    if (day >= 0 && day < out.length) out[day] = -s;
  }
  return out;
});

final _incomeSpendingProvider = FutureProvider<List<_IncomeSpendingMonth>>((
  ref,
) async {
  ref.watch(recentTransactionsProvider);
  final db = ref.watch(dbProvider);
  final now = DateTime.now();
  final months = [
    for (var i = 5; i >= 0; i--) DateTime(now.year, now.month - i, 1),
  ];
  final out = [
    for (final d in months)
      _IncomeSpendingMonth(
        month: BudgetRepository.monthOf(d),
        incomeCents: 0,
        spendingCents: 0,
      ),
  ];
  final start = out.first.month;
  final rows = await db
      .customSelect(
        'SELECT substr(date, 1, 7) AS month, '
        'SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) AS income, '
        'SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END) AS spending '
        'FROM transactions '
        'WHERE parent_id IS NULL AND transfer_group_id IS NULL '
        'AND substr(date, 1, 7) >= ? '
        'GROUP BY month',
        variables: [Variable.withString(start)],
        readsFrom: {db.transactions},
      )
      .get();
  final byMonth = {
    for (final r in rows)
      r.read<String>('month'): _IncomeSpendingMonth(
        month: r.read<String>('month'),
        incomeCents: r.read<int?>('income') ?? 0,
        spendingCents: r.read<int?>('spending') ?? 0,
      ),
  };
  return [for (final v in out) byMonth[v.month] ?? v];
});
