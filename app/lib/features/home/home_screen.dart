import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
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
    ref.invalidate(todaySpendProvider);
    ref.invalidate(recentTransactionsProvider);
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final symbol = prefs.currencySymbol;
    final minorDigits = prefs.currencyMinorDigits;

    final monthAsync = ref.watch(monthSpendProvider);
    final todayAsync = ref.watch(todaySpendProvider);
    final recentAsync = ref.watch(recentTransactionsProvider);

    final monthLabel = DateFormat('MMMM yyyy').format(DateTime.now());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gullak'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 96),
          children: [
            _SummaryCard(
              monthLabel: monthLabel,
              spent: monthAsync.value ?? 0,
              loading: monthAsync.isLoading,
              symbol: symbol,
              minorDigits: minorDigits,
            ),
            _TodayCard(
              spent: todayAsync.value ?? 0,
              loading: todayAsync.isLoading,
              symbol: symbol,
              minorDigits: minorDigits,
            ),
            const SectionHeader('Recent'),
            recentAsync.when(
              data: (rows) {
                if (rows.isEmpty) {
                  return const _RecentEmpty();
                }
                return Column(
                  children: [
                    for (final r in rows.take(8)) _RecentRow(row: r),
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.monthLabel,
    required this.spent,
    required this.loading,
    required this.symbol,
    required this.minorDigits,
  });

  final String monthLabel;
  final int spent;
  final bool loading;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                monthLabel,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: cs.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                'Spent this month',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (loading)
                const SizedBox(
                  height: 36,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                )
              else
                MoneyText(
                  amountCents: spent.abs(),
                  minorDigits: minorDigits,
                  symbol: symbol,
                  size: MoneySize.hero,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({
    required this.spent,
    required this.loading,
    required this.symbol,
    required this.minorDigits,
  });

  final int spent;
  final bool loading;
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
            if (loading)
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
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
    return ListTile(
      title: Text(row.payeeName ?? '—'),
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
        color: row.amountCents < 0 ? cs.onSurface : cs.tertiary,
      ),
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
