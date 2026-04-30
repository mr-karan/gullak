import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import 'data/account_repository.dart';

class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncAccounts = ref.watch(accountsListProvider);
    final prefs = ref.watch(prefsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Accounts')),
      body: asyncAccounts.when(
        data: (accounts) {
          if (accounts.isEmpty) {
            return const EmptyState(
              icon: Icons.account_balance_outlined,
              title: 'No accounts yet',
              body: 'Sync your Actual budget from settings.',
            );
          }
          return ListView.builder(
            itemCount: accounts.length,
            itemBuilder: (_, i) {
              final a = accounts[i];
              return ListTile(
                title: Text(a.name),
                subtitle: a.offbudget ? const Text('Off-budget') : null,
                trailing: a.balanceCents == null
                    ? null
                    : MoneyText(
                        amountCents: a.balanceCents!,
                        minorDigits: prefs.currencyMinorDigits,
                        symbol: prefs.currencySymbol,
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
}
