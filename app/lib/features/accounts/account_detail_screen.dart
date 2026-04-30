import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../transactions/data/transaction_repository.dart';
import 'data/account_repository.dart';

class AccountDetailScreen extends ConsumerWidget {
  const AccountDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final accountAsync = ref.watch(accountsListProvider);
    final txAsync = ref.watch(transactionsListProvider(
      TransactionListQuery(accountId: id),
    ));
    return Scaffold(
      appBar: AppBar(
        title: accountAsync.maybeWhen(
          data: (list) {
            final a = list.firstWhere(
              (x) => x.id == id,
              orElse: () => list.isEmpty
                  ? AccountRow(
                      id: id,
                      actualId: null,
                      name: '—',
                      offbudget: false,
                      closed: false,
                      sortOrder: 0,
                      balanceCents: null,
                      updatedAt: 0,
                      syncStatus: 'synced',
                      syncError: null,
                    )
                  : list.first,
            );
            return Text(a.name);
          },
          orElse: () => const Text('Account'),
        ),
      ),
      body: txAsync.when(
        data: (rows) {
          if (rows.isEmpty) {
            return const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No transactions',
              body: 'Add an expense — it will show here.',
            );
          }
          return ListView.builder(
            itemCount: rows.length,
            itemBuilder: (_, i) {
              final r = rows[i];
              return ListTile(
                title: Text(r.payeeName ?? '—'),
                subtitle: Text(
                  [r.categoryName ?? 'Uncategorised', r.dateLabel]
                      .where((e) => e.isNotEmpty)
                      .join(' · '),
                ),
                trailing: MoneyText(
                  amountCents: r.amountCents,
                  minorDigits: prefs.currencyMinorDigits,
                  symbol: prefs.currencySymbol,
                ),
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
