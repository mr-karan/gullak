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
              body:
                  'Add your first one — bank, card, cash, anything you spend from.',
              action: FilledButton.icon(
                onPressed: () => _newAccount(context),
                icon: const Icon(Icons.add),
                label: const Text('New account'),
              ),
            );
          }
          // Group on-budget vs off-budget for clarity.
          final onBudget = accounts.where((a) => a.onBudget).toList();
          final offBudget = accounts.where((a) => !a.onBudget).toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            children: [
              if (onBudget.isNotEmpty) ...[
                const _GroupHeader('On budget'),
                for (final a in onBudget)
                  _AccountCard(
                    account: a,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                  ),
              ],
              if (offBudget.isNotEmpty) ...[
                const SizedBox(height: 16),
                const _GroupHeader('Tracking'),
                for (final a in offBudget)
                  _AccountCard(
                    account: a,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                  ),
              ],
            ],
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
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: cs.onSurfaceVariant,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _AccountCard extends ConsumerWidget {
  const _AccountCard({
    required this.account,
    required this.symbol,
    required this.minorDigits,
  });

  final AccountRow account;
  final String symbol;
  final int minorDigits;

  static const _kindAccent = <AccountKind, Color>{
    AccountKind.checking: Color(0xFF0A6E58),
    AccountKind.savings: Color(0xFF065F46),
    AccountKind.creditCard: Color(0xFFB45309),
    AccountKind.cash: Color(0xFF4D7C0F),
    AccountKind.wallet: Color(0xFF7C3AED),
    AccountKind.investment: Color(0xFF0E7490),
    AccountKind.loan: Color(0xFFB91C1C),
  };

  static const _kindIcon = <AccountKind, IconData>{
    AccountKind.checking: Icons.account_balance_outlined,
    AccountKind.savings: Icons.savings_outlined,
    AccountKind.creditCard: Icons.credit_card_outlined,
    AccountKind.cash: Icons.payments_outlined,
    AccountKind.wallet: Icons.account_balance_wallet_outlined,
    AccountKind.investment: Icons.show_chart_outlined,
    AccountKind.loan: Icons.handshake_outlined,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final kind = AccountKind.fromId(account.kind);
    final accent = _kindAccent[kind] ?? cs.primary;
    final balanceAsync = ref.watch(accountBalanceProvider(account.id));
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.go('/accounts/${account.id}'),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(_kindIcon[kind], color: accent),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        account.name,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        kind.label,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                MoneyText(
                  amountCents:
                      balanceAsync.value ?? account.openingBalanceCents,
                  symbol: symbol,
                  minorDigits: minorDigits,
                  size: MoneySize.large,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
