import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../core/snackbars.dart';
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
                  const SizedBox(height: 12),
                  _ReconciliationPanel(
                    account: account,
                    ledgerBalanceCents: balanceAsync.value ?? 0,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
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

class _ReconciliationPanel extends ConsumerWidget {
  const _ReconciliationPanel({
    required this.account,
    required this.ledgerBalanceCents,
    required this.symbol,
    required this.minorDigits,
  });

  final AccountRow account;
  final int ledgerBalanceCents;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final actual = account.reconciledBalanceCents;
    final diff = actual == null ? null : actual - ledgerBalanceCents;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(Icons.fact_check_outlined, color: cs.onSurfaceVariant),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    actual == null
                        ? 'Not reconciled'
                        : 'Difference ${Money.format(diff!, symbol: symbol, minorDigits: minorDigits, showSign: true)}',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    actual == null
                        ? 'Enter the balance shown by your bank.'
                        : 'Actual ${Money.format(actual, symbol: symbol, minorDigits: minorDigits)}',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () => _showReconcileDialog(context, ref),
              child: const Text('Reconcile'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showReconcileDialog(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(
      text: account.reconciledBalanceCents == null
          ? ''
          : Money.formatDigitsOnly(
              account.reconciledBalanceCents!,
              minorDigits: minorDigits,
            ),
    );
    final messenger = ScaffoldMessenger.of(context);
    final value = await showDialog<int>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Reconcile account'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Actual balance',
            prefixIcon: Icon(Icons.currency_rupee),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogCtx).pop(
              Money.parseToMinor(controller.text, minorDigits: minorDigits),
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value == null) return;
    await ref.read(accountRepoProvider).reconcile(account.id, value);
    showTimedSnackBar(
      messenger,
      const SnackBar(content: Text('Account reconciled.')),
    );
  }
}
