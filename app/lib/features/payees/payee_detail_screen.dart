import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../entry/quick_entry.dart';
import '../transactions/data/transaction_repository.dart';
import 'data/payee_repository.dart';

/// Tap a payee → their full history plus "total paid" for Today / This Week /
/// This Month / This Year / All Time.
///
/// "Paid" = sum of spend rows only (negative amounts), excluding transfers and
/// split children — the same rule [TransactionRepository.sumSpendInRange] uses,
/// so the header and the list below it stay consistent. Income/refunds from
/// this payee don't count toward "paid". The query matches both the payee FK
/// and the free-text name, so SMS-captured rows aren't missed.
class PayeeDetailScreen extends ConsumerWidget {
  const PayeeDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payeeAsync = ref.watch(payeeByIdProvider(id));

    return payeeAsync.when(
      loading: () => const _Scaffolded(title: 'Payee', child: _Loading()),
      error: (e, _) =>
          _Scaffolded(title: 'Payee', child: Center(child: Text('Error: $e'))),
      data: (payee) {
        if (payee == null) {
          return const _Scaffolded(
            title: 'Payee',
            child: EmptyState(
              icon: Icons.person_off_outlined,
              title: 'Payee not found',
              body: 'It may have been deleted.',
            ),
          );
        }
        final prefs = ref.watch(prefsProvider);
        final txAsync = ref.watch(
          transactionsListProvider(
            TransactionListQuery(payeeId: id, payeeName: payee.name),
          ),
        );
        return _Scaffolded(
          title: payee.name,
          child: txAsync.when(
            loading: () => const _Loading(),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (rows) {
              final totals = _PaidTotals.from(rows);
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
                        ? const EmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: 'No transactions',
                            body: 'Spends with this payee will show here.',
                          )
                        : ListView.builder(
                            itemCount: rows.length,
                            itemBuilder: (_, i) {
                              final r = rows[i];
                              return ListTile(
                                title: Text(
                                  r.categoryName ??
                                      (r.isTransfer
                                          ? 'Transfer'
                                          : 'Uncategorised'),
                                ),
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
          ),
        );
      },
    );
  }
}

/// Total paid (positive) for each period, derived from the watched row list.
class _PaidTotals {
  const _PaidTotals({
    required this.today,
    required this.week,
    required this.month,
    required this.year,
    required this.allTime,
  });

  final int today;
  final int week;
  final int month;
  final int year;
  final int allTime;

  factory _PaidTotals.from(List<TransactionListItem> rows) {
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    // Calendar week, Monday start — consistent with Today/Month/Year being
    // calendar periods rather than rolling windows.
    final weekStart = todayStart.subtract(
      Duration(days: todayStart.weekday - DateTime.monday),
    );
    final monthStart = DateTime(now.year, now.month, 1);
    final yearStart = DateTime(now.year, 1, 1);

    int paidSince(DateTime start) {
      final s = _ymd(start);
      return rows
          .where(
            (t) =>
                t.amountCents < 0 &&
                !t.isTransfer &&
                t.date.compareTo(s) >= 0,
          )
          .fold(0, (sum, t) => sum - t.amountCents);
    }

    final all = rows
        .where((t) => t.amountCents < 0 && !t.isTransfer)
        .fold(0, (sum, t) => sum - t.amountCents);

    return _PaidTotals(
      today: paidSince(todayStart),
      week: paidSince(weekStart),
      month: paidSince(monthStart),
      year: paidSince(yearStart),
      allTime: all,
    );
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

class _TotalsHeader extends StatelessWidget {
  const _TotalsHeader({
    required this.totals,
    required this.symbol,
    required this.minorDigits,
  });

  final _PaidTotals totals;
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
            'Total paid · all time',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: cs.onSurfaceVariant,
            ),
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
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: cs.onSurfaceVariant,
            ),
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

class _Scaffolded extends StatelessWidget {
  const _Scaffolded({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: AppBar(title: Text(title)), body: child);
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}
