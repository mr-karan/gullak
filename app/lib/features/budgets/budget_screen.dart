import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import 'data/budget_repository.dart';

class BudgetScreen extends ConsumerStatefulWidget {
  const BudgetScreen({super.key});

  @override
  ConsumerState<BudgetScreen> createState() => _BudgetScreenState();
}

class _BudgetScreenState extends ConsumerState<BudgetScreen> {
  late String _month = BudgetRepository.currentMonth();

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final async = ref.watch(budgetMonthProvider(_month));
    final monthDate = DateTime.parse('$_month-01');
    final monthLabel = DateFormat('MMMM yyyy').format(monthDate);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Budget'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: () => _shiftMonth(-1),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: () => _shiftMonth(1),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (overview) {
          final groups = <String, List<BudgetSummary>>{};
          for (final e in overview.entries) {
            groups.putIfAbsent(e.groupName, () => []).add(e);
          }
          if (overview.entries.isEmpty) {
            return const EmptyState(
              icon: Icons.pie_chart_outline,
              title: 'No categories yet',
              body: 'Add categories from Settings → Categories before assigning a budget.',
            );
          }
          return ListView(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            monthLabel,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Assigned ${Money.format(
                              overview.totalAssigned,
                              symbol: prefs.currencySymbol,
                              minorDigits: prefs.currencyMinorDigits,
                            )} · spent ${Money.format(
                              -overview.totalSpent,
                              symbol: prefs.currencySymbol,
                              minorDigits: prefs.currencyMinorDigits,
                            )}',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              for (final group in groups.entries) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 4),
                  child: Text(
                    group.key.toUpperCase(),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          letterSpacing: 1.2,
                        ),
                  ),
                ),
                for (final e in group.value)
                  _BudgetRow(
                    entry: e,
                    month: _month,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                  ),
              ],
              const SizedBox(height: 32),
            ],
          );
        },
      ),
    );
  }

  void _shiftMonth(int by) {
    final d = DateTime.parse('$_month-01');
    final next = DateTime(d.year, d.month + by, 1);
    setState(() => _month = BudgetRepository.monthOf(next));
  }
}

class _BudgetRow extends ConsumerWidget {
  const _BudgetRow({
    required this.entry,
    required this.month,
    required this.symbol,
    required this.minorDigits,
  });

  final BudgetSummary entry;
  final String month;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final color = entry.isOverspent
        ? cs.error
        : entry.targetCents == 0
            ? cs.onSurfaceVariant
            : cs.primary;
    return InkWell(
      onTap: () => _editTarget(context, ref),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    entry.categoryName,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                MoneyText(
                  amountCents: entry.availableCents,
                  symbol: symbol,
                  minorDigits: minorDigits,
                  color: color,
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: entry.progress,
                minHeight: 6,
                backgroundColor: cs.surfaceContainerHighest,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            DefaultTextStyle.merge(
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: cs.onSurfaceVariant,
                  ),
              child: Row(
                children: [
                  Text(
                    'Target ${Money.format(entry.targetCents, symbol: symbol, minorDigits: minorDigits)}',
                  ),
                  const Spacer(),
                  Text(
                    'Spent ${Money.format(-entry.spentCents, symbol: symbol, minorDigits: minorDigits)}',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _editTarget(BuildContext context, WidgetRef ref) async {
    final ctrl = TextEditingController(
      text: entry.targetCents == 0
          ? ''
          : Money.formatDigitsOnly(entry.targetCents, minorDigits: minorDigits),
    );
    try {
      final v = await showDialog<int?>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text('Budget for ${entry.categoryName}'),
          content: TextField(
            controller: ctrl,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(prefixText: '$symbol '),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(0),
              child: const Text('Clear'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(
                Money.parseToMinor(ctrl.text, minorDigits: minorDigits),
              ),
              child: const Text('Save'),
            ),
          ],
        ),
      );
      if (v == null) return;
      final repo = ref.read(budgetRepoProvider);
      if (v <= 0) {
        await repo.clearTarget(categoryId: entry.categoryId, month: month);
      } else {
        await repo.setTarget(
          categoryId: entry.categoryId,
          month: month,
          targetCents: v,
        );
      }
      ref.invalidate(budgetMonthProvider(month));
    } finally {
      ctrl.dispose();
    }
  }
}
