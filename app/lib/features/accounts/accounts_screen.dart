import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import 'account_form_sheet.dart';
import 'data/account_repository.dart';

class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncAccounts = ref.watch(accountsListProvider);
    final prefs = ref.watch(prefsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Accounts'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New account',
            onPressed: () => _newAccount(context),
          ),
        ],
      ),
      body: asyncAccounts.when(
        data: (accounts) {
          if (accounts.isEmpty) {
            return EmptyState(
              icon: Icons.account_balance_outlined,
              title: 'No accounts',
              body: 'Add your first one — bank, card, cash, anything you spend from.',
              action: FilledButton.icon(
                onPressed: () => _newAccount(context),
                icon: const Icon(Icons.add),
                label: const Text('New account'),
              ),
            );
          }
          return ListView.builder(
            itemCount: accounts.length,
            itemBuilder: (_, i) {
              final a = accounts[i];
              return ListTile(
                leading: Icon(_iconFor(AccountKind.fromId(a.kind))),
                title: Text(a.name),
                subtitle: Text(
                  [
                    AccountKind.fromId(a.kind).label,
                    if (!a.onBudget) 'Off-budget',
                  ].join(' · '),
                ),
                trailing: _Balance(
                  accountId: a.id,
                  symbol: prefs.currencySymbol,
                  minorDigits: prefs.currencyMinorDigits,
                ),
                onTap: () => context.go('/accounts/${a.id}'),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  Future<void> _newAccount(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const AccountFormSheet(),
    );
  }

  IconData _iconFor(AccountKind k) => switch (k) {
        AccountKind.checking => Icons.account_balance_outlined,
        AccountKind.savings => Icons.savings_outlined,
        AccountKind.creditCard => Icons.credit_card_outlined,
        AccountKind.cash => Icons.payments_outlined,
        AccountKind.wallet => Icons.account_balance_wallet_outlined,
        AccountKind.investment => Icons.show_chart_outlined,
        AccountKind.loan => Icons.handshake_outlined,
      };
}

class _Balance extends ConsumerWidget {
  const _Balance({
    required this.accountId,
    required this.symbol,
    required this.minorDigits,
  });

  final String accountId;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(accountBalanceProvider(accountId));
    final cents = async.value ?? 0;
    return MoneyText(
      amountCents: cents,
      symbol: symbol,
      minorDigits: minorDigits,
    );
  }
}
