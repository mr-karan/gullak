import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../ui/theme.dart';
import '../../ui/widgets/category_swatch.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../../ui/widgets/section_header.dart';
import '../transactions/data/transaction_repository.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  Future<void> _refresh() async {
    ref.invalidate(monthSpendProvider);
    ref.invalidate(monthIncomeProvider);
    ref.invalidate(todaySpendProvider);
    ref.invalidate(recentTransactionsProvider);
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final symbol = prefs.currencySymbol;
    final minorDigits = prefs.currencyMinorDigits;

    final monthSpend = ref.watch(monthSpendProvider);
    final monthIncome = ref.watch(monthIncomeProvider);
    final todaySpend = ref.watch(todaySpendProvider);
    final recent = ref.watch(recentTransactionsProvider);

    final monthLabel = DateFormat('MMMM yyyy').format(DateTime.now());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gullak'),
        actions: [
          IconButton(
            icon: const Icon(Icons.bar_chart_outlined),
            tooltip: 'Reports',
            onPressed: () => context.go('/reports'),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
            onPressed: () => context.go('/settings'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 96),
          children: [
            _MonthHeroCard(
              monthLabel: monthLabel,
              spent: monthSpend.value ?? 0,
              income: monthIncome.value ?? 0,
              symbol: symbol,
              minorDigits: minorDigits,
            ),
            _TodayChip(
              spent: todaySpend.value ?? 0,
              symbol: symbol,
              minorDigits: minorDigits,
            ),
            const SectionHeader('Recent'),
            recent.when(
              data: (rows) {
                if (rows.isEmpty) return const _RecentEmpty();
                return Column(
                  children: [
                    for (final r in rows.take(8))
                      _RecentRow(row: r),
                  ],
                );
              },
              loading: () => const _RecentSkeleton(),
              error: (e, _) => _RecentError(message: e.toString()),
            ),
          ],
        ),
      ),
    );
  }
}

class _MonthHeroCard extends StatelessWidget {
  const _MonthHeroCard({
    required this.monthLabel,
    required this.spent,
    required this.income,
    required this.symbol,
    required this.minorDigits,
  });

  final String monthLabel;
  final int spent;
  final int income;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final net = income + spent; // spent is negative
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
        decoration: BoxDecoration(
          color: cs.primaryContainer.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              monthLabel.toUpperCase(),
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: cs.onPrimaryContainer,
                    letterSpacing: 1.2,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Net',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: cs.onPrimaryContainer,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              _formatNet(net, symbol: symbol, minorDigits: minorDigits),
              style: moneyStyle(context, size: 36, weight: FontWeight.w700)
                  .copyWith(color: cs.onPrimaryContainer),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _StatTile(
                    label: 'Income',
                    value: income,
                    color: cs.tertiary,
                    symbol: symbol,
                    minorDigits: minorDigits,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _StatTile(
                    label: 'Spent',
                    value: -spent, // display unsigned
                    color: cs.onPrimaryContainer,
                    symbol: symbol,
                    minorDigits: minorDigits,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _formatNet(int net, {required String symbol, required int minorDigits}) {
    final scale = _pow10(minorDigits);
    final whole = (net.abs()) ~/ scale;
    final formatted = NumberFormat('#,##,###').format(whole);
    final frac = net.abs() % scale;
    final fracStr = minorDigits == 0
        ? ''
        : '.${frac.toString().padLeft(minorDigits, '0')}';
    final sign = net < 0 ? '-' : '';
    return '$sign$symbol$formatted$fracStr';
  }

  static int _pow10(int n) {
    var r = 1;
    for (var i = 0; i < n; i++) {
      r *= 10;
    }
    return r;
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    required this.color,
    required this.symbol,
    required this.minorDigits,
  });

  final String label;
  final int value;
  final Color color;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: color.withValues(alpha: 0.85),
                letterSpacing: 1.2,
              ),
        ),
        const SizedBox(height: 4),
        MoneyText(
          amountCents: value,
          symbol: symbol,
          minorDigits: minorDigits,
          color: color,
          size: MoneySize.large,
        ),
      ],
    );
  }
}

class _TodayChip extends StatelessWidget {
  const _TodayChip({
    required this.spent,
    required this.symbol,
    required this.minorDigits,
  });

  final int spent;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
        decoration: BoxDecoration(
          color: cs.surfaceContainerLow,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'Today',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: cs.onSurfaceVariant,
                    ),
              ),
            ),
            MoneyText(
              amountCents: spent.abs(),
              minorDigits: minorDigits,
              symbol: symbol,
              size: MoneySize.large,
            ),
          ],
        ),
      ),
    );
  }
}

class _RecentRow extends ConsumerWidget {
  const _RecentRow({required this.row});

  final TransactionListItem row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final prefs = ref.watch(prefsProvider);
    final amountColor = row.isTransfer
        ? cs.onSurfaceVariant
        : row.amountCents < 0
            ? cs.onSurface
            : cs.tertiary;
    return ListTile(
      leading: CategorySwatch(
        label: row.categoryName ?? (row.isTransfer ? 'Transfer' : 'Other'),
        icon: row.isTransfer
            ? Icons.swap_horiz
            : row.isSplit
                ? Icons.call_split
                : null,
      ),
      title: Text(
        row.isTransfer
            ? '${row.accountName ?? '—'} → ${row.transferAccountName ?? '—'}'
            : (row.payeeName ?? row.categoryName ?? '—'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        [row.categoryName ?? 'Uncategorised', row.dateLabel]
            .where((e) => e.isNotEmpty)
            .join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: MoneyText(
        amountCents: row.amountCents,
        minorDigits: prefs.currencyMinorDigits,
        symbol: prefs.currencySymbol,
        color: amountColor,
      ),
      onTap: () => context.go('/transactions/${row.id}'),
    );
  }
}

class _RecentEmpty extends StatelessWidget {
  const _RecentEmpty();
  @override
  Widget build(BuildContext context) {
    return const EmptyState(
      icon: Icons.savings_outlined,
      title: 'Nothing logged yet',
      body: 'Tap + to add your first expense.',
    );
  }
}

class _RecentSkeleton extends StatelessWidget {
  const _RecentSkeleton();
  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 24),
      child: Center(
        child: SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}

class _RecentError extends StatelessWidget {
  const _RecentError({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Text(
        'Could not load: $message',
        style: TextStyle(color: cs.error),
      ),
    );
  }
}
