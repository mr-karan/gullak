import 'package:drift/drift.dart' show Variable;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/charts/sparkline.dart';
import '../../ui/theme.dart';
import '../../ui/widgets/category_swatch.dart';
import '../../ui/widgets/count_up_money.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../../ui/widgets/section_header.dart';
import '../accounts/data/account_repository.dart';
import '../budgets/data/budget_repository.dart';
import '../categories/category_visuals.dart';
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
    final recent = ref.watch(recentTransactionsProvider);
    final review = ref.watch(dailyReviewProvider);
    final spendSeries = ref.watch(last30DaysSpendProvider);

    final monthLabel = DateFormat('MMMM').format(DateTime.now());

    return Scaffold(
      appBar: AppBar(
        title: Text(
          monthLabel,
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        actions: [
          if (prefs.smsEnabled) const _InboxBadgeAction(),
          IconButton(
            icon: const Icon(Icons.more_horiz),
            tooltip: 'More',
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
              spent: monthSpend.value ?? 0,
              income: monthIncome.value ?? 0,
              spendSeries: spendSeries.value ?? const [],
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
            const _AccountsStrip(),
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

/// App-bar Inbox entry point — an icon with a count badge. Inbox is a review
/// queue you enter when there's work, not a browse tab.
class _InboxBadgeAction extends ConsumerWidget {
  const _InboxBadgeAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final counts = ref.watch(inboxCountsProvider).value;
    final n = (counts?.pending ?? 0) + (counts?.failed ?? 0);
    final icon = IconButton(
      icon: const Icon(Icons.inbox_outlined),
      tooltip: 'Inbox',
      onPressed: () => context.go('/inbox'),
    );
    if (n == 0) return icon;
    return Badge.count(count: n, child: icon);
  }
}

/// Horizontal account-balance strip — the daily balance surface that replaces
/// the old Accounts tab. Tap a card to open that account.
class _AccountsStrip extends ConsumerWidget {
  const _AccountsStrip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(accountsListProvider).value ?? const [];
    if (accounts.isEmpty) return const SizedBox.shrink();
    final prefs = ref.watch(prefsProvider);
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader('Accounts'),
        SizedBox(
          height: 76,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: accounts.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final a = accounts[i];
              final bal = ref.watch(accountBalanceProvider(a.id)).value ?? 0;
              return InkWell(
                onTap: () => context.go('/accounts/${a.id}'),
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: 150,
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  decoration: BoxDecoration(
                    color: cs.surfaceContainer,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: cs.outlineVariant.withValues(alpha: 0.6),
                      width: 0.5,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        a.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                      MoneyText(
                        amountCents: bal,
                        symbol: prefs.currencySymbol,
                        minorDigits: prefs.currencyMinorDigits,
                        size: MoneySize.medium,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _MonthHeroCard extends StatelessWidget {
  const _MonthHeroCard({
    required this.spent,
    required this.income,
    required this.spendSeries,
    required this.symbol,
    required this.minorDigits,
  });

  final int spent; // negative
  final int income; // positive
  final List<double> spendSeries;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final spentMag = spent.abs();
    // One support line, at most two facts: income (if any) and net.
    final net = income + spent;
    final support = StringBuffer();
    if (income > 0) {
      support.write(
        '+${Money.format(income, symbol: symbol, minorDigits: minorDigits)} in',
      );
    }
    if (support.isNotEmpty) support.write(' · ');
    support.write(
      'net ${Money.format(net, symbol: symbol, minorDigits: minorDigits, showSign: true)}',
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Container(
        padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
        decoration: BoxDecoration(
          color: cs.surfaceContainer,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: cs.outlineVariant.withValues(alpha: 0.6),
            width: 0.5,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('SPENT THIS MONTH', style: eyebrowStyle(context)),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: CountUpMoney(
                    amountCents: spentMag,
                    symbol: symbol,
                    minorDigits: minorDigits,
                    size: MoneySize.hero,
                  ),
                ),
                if (spendSeries.isNotEmpty)
                  SizedBox(
                    width: 96,
                    height: 34,
                    child: Sparkline(values: spendSeries),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              support.toString(),
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
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
            : row.categoryName == null
            ? null
            : categoryIconData(row.categoryName!),
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
      onTap: () => context.push('/transactions/${row.id}'),
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
      ReviewColor.warning => warningColor(cs),
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
  // Budget warnings depend on category list and budget targets too.
  ref.watch(budgetsListProvider);
  ref.watch(categoriesListProvider);
  final db = ref.watch(dbProvider);
  final txRepo = ref.watch(transactionRepoProvider);
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final month = BudgetRepository.currentMonth();

  // Cheap SMS counts via a dedicated stream — re-runs the review when SMS
  // change without keeping the full Inbox enrichment pipeline warm on Home.
  final smsCounts = await ref.watch(inboxCountsProvider.future);

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
    pendingSms: smsCounts.pending,
    failedSms: smsCounts.failed,
    uncategorizedToday: uncategorizedRow.read<int>('c'),
    budgetWarnings: warnings,
  );
});
