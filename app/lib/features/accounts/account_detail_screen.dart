import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../entry/quick_entry.dart';
import '../transactions/data/transaction_repository.dart';
import 'account_form_sheet.dart';
import 'data/account_repository.dart';

class AccountDetailScreen extends ConsumerWidget {
  const AccountDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final accountAsync = ref.watch(accountsListProvider);
    final txAsync = ref.watch(
      transactionsListProvider(TransactionListQuery(accountId: id)),
    );
    final balanceAsync = ref.watch(accountBalanceProvider(id));
    final account = accountAsync.value?.cast<AccountRow?>().firstWhere(
      (a) => a?.id == id,
      orElse: () => null,
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(account?.name ?? 'Account'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: account == null
                ? null
                : () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    useSafeArea: true,
                    builder: (_) => AccountFormSheet(accountId: id),
                  ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (account != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Balance',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 4),
                  MoneyText(
                    amountCents: balanceAsync.value ?? 0,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                    size: MoneySize.hero,
                  ),
                ],
              ),
            ),
          Expanded(
            child: txAsync.when(
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
                      title: Text(
                        r.isTransfer
                            ? '→ ${r.transferAccountName ?? '—'}'
                            : (r.payeeName ?? '—'),
                      ),
                      subtitle: Text(
                        [
                          r.categoryName ??
                              (r.isTransfer ? 'Transfer' : 'Uncategorised'),
                          r.dateLabel,
                        ].where((e) => e.isNotEmpty).join(' · '),
                      ),
                      trailing: MoneyText(
                        amountCents: r.amountCents,
                        minorDigits: prefs.currencyMinorDigits,
                        symbol: prefs.currencySymbol,
                      ),
                      onTap: () =>
                          openQuickEntry(context, editingTransactionId: r.id),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
    );
  }
}
