import 'package:drift/drift.dart' show Variable;
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
import '../budgets/data/budget_repository.dart';
import '../categories/data/category_repository.dart';
import '../inbox/data/sms_repository.dart';
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
    ref.invalidate(dailyReviewProvider);
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
    final review = ref.watch(dailyReviewProvider);

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
            review.when(
              data: (snapshot) => _DailyReviewCard(
                snapshot: snapshot,
                symbol: symbol,
                minorDigits: minorDigits,
              ),
              loading: () => const _DailyReviewLoading(),
              error: (_, _) => const SizedBox.shrink(),
            ),
            const SectionHeader('Recent'),
            recent.when(
              data: (rows) {
                if (rows.isEmpty) return const _RecentEmpty();
                return Column(
                  children: [for (final r in rows.take(8)) _RecentRow(row: r)],
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
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: cs.onPrimaryContainer),
            ),
            const SizedBox(height: 4),
            Text(
              _formatNet(net, symbol: symbol, minorDigits: minorDigits),
              style: moneyStyle(
                context,
                size: 36,
                weight: FontWeight.w700,
              ).copyWith(color: cs.onPrimaryContainer),
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

  static String _formatNet(
    int net, {
    required String symbol,
    required int minorDigits,
  }) {
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
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(color: cs.onSurfaceVariant),
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

class _DailyReviewCard extends StatelessWidget {
  const _DailyReviewCard({
    required this.snapshot,
    required this.symbol,
    required this.minorDigits,
  });

  final DailyReviewSnapshot snapshot;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final items = snapshot.items;
    if (items.isEmpty) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: cs.surfaceContainerLow,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.5)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Daily review',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (snapshot.todaySpendCents < 0)
                    MoneyText(
                      amountCents: snapshot.todaySpendCents.abs(),
                      symbol: symbol,
                      minorDigits: minorDigits,
                    ),
                ],
              ),
              const SizedBox(height: 10),
              for (final item in items) _ReviewActionRow(item: item),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReviewActionRow extends StatelessWidget {
  const _ReviewActionRow({required this.item});

  final DailyReviewItem item;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: item.route == null ? null : () => context.go(item.route!),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Icon(item.icon, size: 20, color: item.color.resolve(cs)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                item.label,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            if (item.route != null)
              Icon(Icons.chevron_right, size: 20, color: cs.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _DailyReviewLoading extends StatelessWidget {
  const _DailyReviewLoading();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: SizedBox(
        height: 72,
        child: Center(
          child: SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
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
        [
          row.categoryName ?? 'Uncategorised',
          row.dateLabel,
        ].where((e) => e.isNotEmpty).join(' · '),
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

enum ReviewColor {
  primary,
  error,
  warning;

  Color resolve(ColorScheme cs) {
    return switch (this) {
      ReviewColor.primary => cs.primary,
      ReviewColor.error => cs.error,
      ReviewColor.warning => cs.tertiary,
    };
  }
}

class DailyReviewItem {
  const DailyReviewItem({
    required this.icon,
    required this.label,
    required this.color,
    this.route,
  });

  final IconData icon;
  final String label;
  final ReviewColor color;
  final String? route;
}

class DailyReviewSnapshot {
  const DailyReviewSnapshot({
    required this.todaySpendCents,
    required this.pendingSms,
    required this.failedSms,
    required this.uncategorizedToday,
    required this.budgetWarnings,
  });

  final int todaySpendCents;
  final int pendingSms;
  final int failedSms;
  final int uncategorizedToday;
  final List<BudgetSummary> budgetWarnings;

  List<DailyReviewItem> get items {
    final out = <DailyReviewItem>[];
    if (pendingSms > 0) {
      out.add(
        DailyReviewItem(
          icon: Icons.sms_outlined,
          label: '$pendingSms SMS ready to confirm',
          color: ReviewColor.primary,
          route: '/inbox',
        ),
      );
    }
    if (failedSms > 0) {
      out.add(
        DailyReviewItem(
          icon: Icons.rule_folder_outlined,
          label: '$failedSms SMS need review',
          color: ReviewColor.warning,
          route: '/inbox',
        ),
      );
    }
    if (uncategorizedToday > 0) {
      out.add(
        DailyReviewItem(
          icon: Icons.label_off_outlined,
          label:
              '$uncategorizedToday transaction${uncategorizedToday == 1 ? '' : 's'} need category',
          color: ReviewColor.warning,
          route: '/transactions',
        ),
      );
    }
    for (final b in budgetWarnings.take(2)) {
      out.add(
        DailyReviewItem(
          icon: b.isOverspent
              ? Icons.warning_amber_outlined
              : Icons.trending_up_outlined,
          label: b.isOverspent
              ? '${b.categoryName} is over budget'
              : '${b.categoryName} is close to budget',
          color: b.isOverspent ? ReviewColor.error : ReviewColor.warning,
          route: '/budgets',
        ),
      );
    }
    if (out.isEmpty && todaySpendCents != 0) {
      out.add(
        const DailyReviewItem(
          icon: Icons.check_circle_outline,
          label: 'Today is up to date',
          color: ReviewColor.primary,
        ),
      );
    }
    return out;
  }
}

final dailyReviewProvider = FutureProvider<DailyReviewSnapshot>((ref) async {
  ref.watch(recentTransactionsProvider);
  // Re-run when SMS arrive or move buckets (confirm/dismiss/error). Without
  // this the pending/failed counts stayed cached until pull-to-refresh.
  ref.watch(inboxItemsProvider);
  // Budget warnings depend on category list and budget targets too.
  ref.watch(budgetsListProvider);
  ref.watch(categoriesListProvider);
  final db = ref.watch(dbProvider);
  final txRepo = ref.watch(transactionRepoProvider);
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final month = BudgetRepository.currentMonth();

  final pendingRow = await db
      .customSelect(
        "SELECT COUNT(*) AS c FROM sms_messages WHERE candidate_status = 'inbox'",
      )
      .getSingle();
  final failedRow = await db
      .customSelect(
        "SELECT COUNT(*) AS c FROM sms_messages WHERE candidate_status = 'error'",
      )
      .getSingle();
  final uncategorizedRow = await db
      .customSelect(
        'SELECT COUNT(*) AS c FROM transactions '
        'WHERE date = ? AND category_id IS NULL '
        'AND parent_id IS NULL AND transfer_group_id IS NULL',
        variables: [Variable.withString(today)],
      )
      .getSingle();

  final overview = await ref.watch(budgetRepoProvider).summary(month);
  final warnings =
      overview.entries
          .where(
            (e) =>
                e.targetCents > 0 &&
                (-e.spentCents >= (e.targetCents * 0.8).round()),
          )
          .toList()
        ..sort((a, b) {
          if (a.isOverspent != b.isOverspent) return a.isOverspent ? -1 : 1;
          return a.availableCents.compareTo(b.availableCents);
        });

  return DailyReviewSnapshot(
    todaySpendCents: await txRepo.sumSpendInRange(
      from: DateTime.now(),
      to: DateTime.now(),
    ),
    pendingSms: pendingRow.read<int>('c'),
    failedSms: failedRow.read<int>('c'),
    uncategorizedToday: uncategorizedRow.read<int>('c'),
    budgetWarnings: warnings,
  );
});
