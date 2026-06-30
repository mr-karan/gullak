import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../entry/quick_entry.dart';
import 'data/transaction_repository.dart';

/// Which dimension is fixed for this scoped view — decides what each row leads
/// with (a payee view rows by category; a category view rows by payee).
enum TxnScope { payee, category }

/// Total *spent* (positive magnitude) per period, derived from a watched txn
/// list. "Spent" = negative amounts only, transfers excluded — consistent with
/// the rest of the app. Shared by the payee and category detail screens.
class SpendPeriodTotals {
  const SpendPeriodTotals({
    required this.today,
    required this.week,
    required this.month,
    required this.year,
    required this.allTime,
  });

  final int today, week, month, year, allTime;

  factory SpendPeriodTotals.from(List<TransactionListItem> rows) {
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    // Calendar week, Monday start.
    final weekStart = todayStart.subtract(
      Duration(days: todayStart.weekday - DateTime.monday),
    );
    final monthStart = DateTime(now.year, now.month, 1);
    final yearStart = DateTime(now.year, 1, 1);

    int since(DateTime start) {
      final s = _ymd(start);
      return rows
          .where(
            (t) =>
                t.amountCents < 0 && !t.isTransfer && t.date.compareTo(s) >= 0,
          )
          .fold(0, (sum, t) => sum - t.amountCents);
    }

    return SpendPeriodTotals(
      today: since(todayStart),
      week: since(weekStart),
      month: since(monthStart),
      year: since(yearStart),
      allTime: rows
          .where((t) => t.amountCents < 0 && !t.isTransfer)
          .fold(0, (sum, t) => sum - t.amountCents),
    );
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

/// Period-totals header + the full transaction list for a scoped view (one
/// payee, one category, …). The caller supplies the already-scoped, watched
/// txn list; this widget owns the shared presentation.
class ScopedTransactionsView extends ConsumerWidget {
  const ScopedTransactionsView({
    required this.txAsync,
    required this.scope,
    this.emptyBody = 'Spends in this view will show here.',
    super.key,
  });

  final AsyncValue<List<TransactionListItem>> txAsync;
  final TxnScope scope;
  final String emptyBody;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    return txAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (rows) {
        final totals = SpendPeriodTotals.from(rows);
        return Column(
          children: [
            _TotalsHeader(
              totals: totals,
              symbol: prefs.currencySymbol,
              minorDigits: prefs.currencyMinorDigits,
            ),
            const Divider(height: 1),
            Expanded(
              child: rows.isEmpty
                  ? EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'No transactions',
                      body: emptyBody,
                    )
                  : ListView.builder(
                      itemCount: rows.length,
                      itemBuilder: (_, i) {
                        final r = rows[i];
                        final primary = switch (scope) {
                          TxnScope.payee =>
                            r.categoryName ??
                                (r.isTransfer ? 'Transfer' : 'Uncategorised'),
                          TxnScope.category => r.payeeName ?? '—',
                        };
                        return ListTile(
                          title: Text(primary),
                          subtitle: Text(
                            [
                              if (r.accountName != null) r.accountName!,
                              r.dateLabel,
                            ].join(' · '),
                          ),
                          trailing: MoneyText(
                            amountCents: r.amountCents,
                            minorDigits: prefs.currencyMinorDigits,
                            symbol: prefs.currencySymbol,
                          ),
                          onTap: () => openQuickEntry(
                            context,
                            editingTransactionId: r.id,
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }
}

class _TotalsHeader extends StatelessWidget {
  const _TotalsHeader({
    required this.totals,
    required this.symbol,
    required this.minorDigits,
  });

  final SpendPeriodTotals totals;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Total spent · all time',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 4),
          MoneyText(
            amountCents: totals.allTime,
            symbol: symbol,
            minorDigits: minorDigits,
            size: MoneySize.hero,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _MetricTile(
                label: 'Today',
                amountCents: totals.today,
                symbol: symbol,
                minorDigits: minorDigits,
              ),
              _MetricTile(
                label: 'This week',
                amountCents: totals.week,
                symbol: symbol,
                minorDigits: minorDigits,
              ),
              _MetricTile(
                label: 'This month',
                amountCents: totals.month,
                symbol: symbol,
                minorDigits: minorDigits,
              ),
              _MetricTile(
                label: 'This year',
                amountCents: totals.year,
                symbol: symbol,
                minorDigits: minorDigits,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.amountCents,
    required this.symbol,
    required this.minorDigits,
  });

  final String label;
  final int amountCents;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 2),
          Text(
            Money.format(amountCents, symbol: symbol, minorDigits: minorDigits),
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
