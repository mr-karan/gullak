import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/money.dart';
import '../../core/snackbars.dart';
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
          IconButton(
            icon: const Icon(Icons.content_copy_outlined),
            tooltip: 'Copy previous targets',
            onPressed: () => _copyPreviousTargets(context, ref),
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
              body:
                  'Add categories from Settings → Categories before assigning a budget.',
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
                            'Assigned ${Money.format(overview.totalAssigned, symbol: prefs.currencySymbol, minorDigits: prefs.currencyMinorDigits)} · spent ${Money.format(-overview.totalSpent, symbol: prefs.currencySymbol, minorDigits: prefs.currencyMinorDigits)}',
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              _BudgetGuidanceCard(
                overview: overview,
                symbol: prefs.currencySymbol,
                minorDigits: prefs.currencyMinorDigits,
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
    setState(() => _month = BudgetRepository.shiftMonth(_month, by));
  }

  Future<void> _copyPreviousTargets(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final copied = await ref
        .read(budgetRepoProvider)
        .copyTargetsFromPreviousMonth(_month);
    ref.invalidate(budgetMonthProvider(_month));
    if (!context.mounted) return;
    showTimedSnackBar(
      messenger,
      SnackBar(
        content: Text(
          copied == 0
              ? 'No previous month targets to copy'
              : 'Copied $copied budget targets',
        ),
      ),
    );
  }
}

class _BudgetGuidanceCard extends StatelessWidget {
  const _BudgetGuidanceCard({
    required this.overview,
    required this.symbol,
    required this.minorDigits,
  });

  final BudgetMonthOverview overview;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final assigned = overview.totalAssigned;
    if (assigned <= 0) return const SizedBox.shrink();
    final spent = -overview.totalSpent;
    final left = assigned - spent;
    final overspent = overview.entries.where((e) => e.isOverspent).toList();
    final close =
        overview.entries
            .where(
              (e) =>
                  !e.isOverspent &&
                  e.targetCents > 0 &&
                  -e.spentCents >= (e.targetCents * 0.8).round(),
            )
            .toList()
          ..sort((a, b) => a.availableCents.compareTo(b.availableCents));

    final tone = left < 0
        ? cs.errorContainer
        : close.isNotEmpty
        ? cs.tertiaryContainer
        : cs.primaryContainer;
    final onTone = left < 0
        ? cs.onErrorContainer
        : close.isNotEmpty
        ? cs.onTertiaryContainer
        : cs.onPrimaryContainer;
    final headline = left < 0
        ? 'Over budget by ${Money.format(-left, symbol: symbol, minorDigits: minorDigits)}'
        : '${Money.format(left, symbol: symbol, minorDigits: minorDigits)} left this month';
    final detail = overspent.isNotEmpty
        ? '${overspent.length} categor${overspent.length == 1 ? 'y is' : 'ies are'} overspent'
        : close.isNotEmpty
        ? '${close.first.categoryName} is close to its limit'
        : 'Spending is within assigned targets';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: tone,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Row(
            children: [
              Icon(
                left < 0
                    ? Icons.warning_amber_outlined
                    : close.isNotEmpty
                    ? Icons.trending_up_outlined
                    : Icons.check_circle_outline,
                color: onTone,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      headline,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: onTone,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      detail,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: onTone),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
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
    var saving = false;
    String? errorText;
    try {
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setState) {
            Future<void> save(int targetCents) async {
              setState(() {
                saving = true;
                errorText = null;
              });
              try {
                final repo = ref.read(budgetRepoProvider);
                if (targetCents <= 0) {
                  await repo.clearTarget(
                    categoryId: entry.categoryId,
                    month: month,
                  );
                } else {
                  await repo.setTarget(
                    categoryId: entry.categoryId,
                    month: month,
                    targetCents: targetCents,
                  );
                }
                ref.invalidate(budgetMonthProvider(month));
                if (dialogContext.mounted) {
                  Navigator.of(dialogContext).pop();
                }
              } catch (e) {
                if (!context.mounted) return;
                setState(() {
                  saving = false;
                  errorText = 'Could not save budget. Please try again.';
                });
              }
            }

            return AlertDialog(
              title: Text('Budget for ${entry.categoryName}'),
              content: TextField(
                controller: ctrl,
                autofocus: true,
                enabled: !saving,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  prefixText: '$symbol ',
                  errorText: errorText,
                ),
              ),
              actions: [
                TextButton(
                  onPressed: saving ? null : () => save(0),
                  child: const Text('Clear'),
                ),
                FilledButton(
                  onPressed: saving
                      ? null
                      : () => save(
                          Money.parseToMinor(
                            ctrl.text,
                            minorDigits: minorDigits,
                          ),
                        ),
                  child: saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Save'),
                ),
              ],
            );
          },
        ),
      );
    } finally {
      ctrl.dispose();
    }
  }
}
