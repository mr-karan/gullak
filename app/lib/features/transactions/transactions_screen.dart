import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/clock.dart';
import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/widgets/category_swatch.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import 'data/transaction_repository.dart';

class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final listAsync = ref.watch(transactionsListProvider(
      TransactionListQuery(search: _query.isEmpty ? null : _query),
    ));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Activity'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _searchCtrl,
              decoration: const InputDecoration(
                hintText: 'Search payee, notes…',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => _query = v.trim()),
            ),
          ),
        ),
      ),
      body: listAsync.when(
        data: (rows) {
          if (rows.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [
                SizedBox(height: 80),
                EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'No transactions',
                  body: 'Tap + to add your first.',
                ),
              ],
            );
          }
          // Group by date string (YYYY-MM-DD).
          final groups = <String, List<TransactionListItem>>{};
          for (final r in rows) {
            groups.putIfAbsent(r.date, () => []).add(r);
          }
          final orderedDates = groups.keys.toList()..sort((a, b) => b.compareTo(a));
          return ListView.builder(
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: orderedDates.length,
            itemBuilder: (_, gi) {
              final date = orderedDates[gi];
              final entries = groups[date]!;
              final daySpend = entries
                  .where((e) => !e.isTransfer)
                  .fold<int>(0, (s, e) => s + e.amountCents);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _DateHeader(
                    date: date,
                    netCents: daySpend,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                  ),
                  for (final r in entries) _TxRow(row: r, prefs: prefs),
                ],
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _DateHeader extends StatelessWidget {
  const _DateHeader({
    required this.date,
    required this.netCents,
    required this.symbol,
    required this.minorDigits,
  });

  final String date;
  final int netCents;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final d = DateTime.parse(date);
    final today = clock.today();
    final diff = today.difference(DateTime(d.year, d.month, d.day)).inDays;
    final label = diff == 0
        ? 'Today'
        : diff == 1
            ? 'Yesterday'
            : DateFormat('EEE, d MMM').format(d);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: cs.onSurfaceVariant,
                    letterSpacing: 1.2,
                  ),
            ),
          ),
          Text(
            Money.format(netCents, symbol: symbol, minorDigits: minorDigits),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: cs.onSurfaceVariant,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
        ],
      ),
    );
  }
}

Future<void> _deleteWithUndo(
  BuildContext context,
  WidgetRef ref,
  String id,
) async {
  final repo = ref.read(transactionRepoProvider);
  final snap = await repo.delete(id);
  if (snap.isEmpty || !context.mounted) return;
  final messenger = ScaffoldMessenger.of(context);
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: const Text('Transaction deleted'),
        duration: const Duration(seconds: 4),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => repo.restore(snap),
        ),
      ),
    );
}

class _TxRow extends ConsumerWidget {
  const _TxRow({required this.row, required this.prefs});

  final TransactionListItem row;
  final dynamic prefs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final swatchLabel = row.categoryName ??
        (row.isTransfer ? 'Transfer' : 'Other');
    final amountColor = row.isTransfer
        ? cs.onSurfaceVariant
        : row.amountCents < 0
            ? cs.onSurface
            : cs.tertiary;
    return Slidable(
      key: ValueKey(row.id),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: 0.55,
        children: [
          SlidableAction(
            onPressed: (_) => context.go('/transactions/${row.id}'),
            backgroundColor: cs.surfaceContainerHigh,
            foregroundColor: cs.onSurface,
            icon: Icons.edit_outlined,
            label: 'Edit',
          ),
          SlidableAction(
            onPressed: (ctx) => _deleteWithUndo(ctx, ref, row.id),
            backgroundColor: cs.errorContainer,
            foregroundColor: cs.onErrorContainer,
            icon: Icons.delete_outline,
            label: 'Delete',
          ),
        ],
      ),
      child: InkWell(
        onTap: () => context.go('/transactions/${row.id}'),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            children: [
              CategorySwatch(
                label: swatchLabel,
                icon: row.isTransfer
                    ? Icons.swap_horiz
                    : row.isSplit
                        ? Icons.call_split
                        : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.isTransfer
                          ? '${row.accountName ?? '—'} → ${row.transferAccountName ?? '—'}'
                          : (row.payeeName ?? row.categoryName ?? '—'),
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        row.categoryName ?? (row.isTransfer ? 'Transfer' : 'Uncategorised'),
                        row.accountName ?? '',
                      ].where((e) => e.isNotEmpty).join(' · '),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: cs.onSurfaceVariant,
                          ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              MoneyText(
                amountCents: row.amountCents,
                minorDigits: prefs.currencyMinorDigits,
                symbol: prefs.currencySymbol,
                color: amountColor,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
