import 'package:drift/drift.dart' show Variable;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/category_palette.dart';
import '../../ui/charts/bar_chart.dart';
import '../../ui/charts/category_bars.dart';
import '../../ui/charts/heatmap_calendar.dart';
import '../../ui/widgets/count_up_money.dart';
import '../../ui/widgets/error_state.dart';
import '../../ui/widgets/money_text.dart';
import '../../ui/widgets/section_header.dart';
import '../budgets/data/budget_repository.dart';
import '../transactions/data/transaction_repository.dart';

/// Insights: one scrolling screen per month. A headline stat row, a daily-spend
/// bar chart, a category breakdown, a 6-month income-vs-spend comparison, and a
/// spend heatmap — all on the shared chart kit, each paired with the numbers as
/// text (charts never carry information alone).
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
    final cs = Theme.of(context).colorScheme;
    final symbol = prefs.currencySymbol;
    final digits = prefs.currencyMinorDigits;
    final monthDate = DateTime.parse('$_month-01');
    final monthLabel = DateFormat('MMMM yyyy').format(monthDate);
    final async = ref.watch(budgetMonthProvider(_month));
    final daily = ref.watch(_dailySpendProvider(_month));
    final incomeSpending = ref.watch(_incomeSpendingProvider);
    final monthIncome =
        incomeSpending.value
            ?.where((v) => v.month == _month)
            .fold<int>(0, (s, v) => s + v.incomeCents) ??
        0;

    String money(int v) => Money.format(v, symbol: symbol, minorDigits: digits);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Insights'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Previous month',
            onPressed: () => _shift(-1),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Next month',
            onPressed: () => _shift(1),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 96),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              monthLabel,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ),

          // 1. Headline stats.
          async.when(
            loading: () => const _Loading(),
            error: (e, _) => ErrorState(
              message: e.toString(),
              compact: true,
              onRetry: () => ref.invalidate(budgetMonthProvider(_month)),
            ),
            data: (overview) {
              final spent = -overview.totalSpent;
              final net = monthIncome - spent;
              return Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: _Stat(
                        label: 'Spent',
                        value: spent,
                        symbol: symbol,
                        digits: digits,
                      ),
                    ),
                    Expanded(
                      child: _Stat(
                        label: 'Income',
                        value: monthIncome,
                        symbol: symbol,
                        digits: digits,
                        color: cs.tertiary,
                      ),
                    ),
                    Expanded(
                      child: _Stat(
                        label: 'Net',
                        value: net,
                        symbol: symbol,
                        digits: digits,
                        color: net >= 0 ? cs.tertiary : cs.error,
                        showSign: true,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),

          // 2. Daily rhythm.
          const SectionHeader('Daily rhythm'),
          daily.when(
            loading: () => const SizedBox(height: 160),
            error: (e, _) => ErrorState(message: e.toString(), compact: true),
            data: (values) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: values.every((v) => v == 0)
                  ? _empty(context, 'No spending this month yet.')
                  : BarChart(
                      data: [
                        for (var i = 0; i < values.length; i++)
                          BarDatum(
                            label: '${i + 1}',
                            spend: values[i].toDouble(),
                          ),
                      ],
                      highlightIndex: _todayIndex(),
                      tooltipFor: (i) => money(-values[i]),
                      semanticsLabel: 'Daily spend for $monthLabel',
                    ),
            ),
          ),

          // 3. By category.
          const SectionHeader('By category'),
          async.when(
            loading: () => const _Loading(),
            error: (_, _) => const SizedBox.shrink(),
            data: (overview) {
              final entries =
                  overview.entries.where((e) => e.spentCents != 0).toList()
                    ..sort((a, b) => a.spentCents.compareTo(b.spentCents));
              if (entries.isEmpty) {
                return _empty(context, 'No spending recorded this month.');
              }
              final total = entries.fold<int>(0, (s, e) => s + -e.spentCents);
              final maxSpent = entries
                  .map((e) => -e.spentCents)
                  .reduce((a, b) => a > b ? a : b);
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: CategoryBars(
                  data: [
                    for (final e in entries)
                      CategoryBarDatum(
                        label: e.categoryName,
                        amountText: money(-e.spentCents),
                        color: categoryColor(cs, e.categoryId),
                        fraction: maxSpent > 0 ? -e.spentCents / maxSpent : 0,
                        percentText: total > 0
                            ? '${(-e.spentCents / total * 100).round()}%'
                            : null,
                        onTap: () =>
                            context.push('/categories/${e.categoryId}'),
                      ),
                  ],
                ),
              );
            },
          ),

          // 4. Month vs month.
          const SectionHeader('Last 6 months'),
          incomeSpending.when(
            loading: () => const SizedBox(height: 160),
            error: (e, _) => ErrorState(message: e.toString(), compact: true),
            data: (values) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: BarChart(
                data: [
                  for (final v in values)
                    BarDatum(
                      label: DateFormat(
                        'MMM',
                      ).format(DateTime.parse('${v.month}-01')),
                      spend: v.spendingCents.toDouble(),
                      income: v.incomeCents.toDouble(),
                    ),
                ],
                tooltipFor: (i) =>
                    '${money(-values[i].spendingCents)} spent · '
                    '${money(values[i].incomeCents)} in',
                semanticsLabel: 'Income versus spending, last 6 months',
              ),
            ),
          ),

          // 5. Heatmap.
          const SectionHeader('Spend heatmap'),
          daily.when(
            loading: () => const SizedBox(height: 200),
            error: (_, _) => const SizedBox.shrink(),
            data: (values) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: HeatmapCalendar(
                year: monthDate.year,
                month: monthDate.month,
                valueByDay: {
                  for (var i = 0; i < values.length; i++)
                    if (values[i] > 0) i + 1: values[i].toDouble(),
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Index of today within the current month's daily series, or null when
  /// viewing a different month.
  int? _todayIndex() {
    final now = DateTime.now();
    return BudgetRepository.monthOf(now) == _month ? now.day - 1 : null;
  }

  Widget _empty(BuildContext context, String text) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
    child: Text(
      text,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );

  void _shift(int by) {
    final d = DateTime.parse('$_month-01');
    final next = DateTime(d.year, d.month + by, 1);
    setState(() => _month = BudgetRepository.monthOf(next));
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(28),
    child: Center(child: CircularProgressIndicator()),
  );
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    required this.symbol,
    required this.digits,
    this.color,
    this.showSign = false,
  });
  final String label;
  final int value;
  final String symbol;
  final int digits;
  final Color? color;
  final bool showSign;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
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
          // Scale the amount down to fit the narrow card on one line rather
          // than wrapping mid-number.
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: CountUpMoney(
              amountCents: value,
              symbol: symbol,
              minorDigits: digits,
              size: MoneySize.medium,
              color: color,
              showSign: showSign,
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
        readsFrom: {db.transactions},
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
