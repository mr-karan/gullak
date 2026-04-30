import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../state/providers.dart';
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
          return ListView.builder(
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: rows.length,
            itemBuilder: (_, i) {
              final r = rows[i];
              return ListTile(
                leading: r.isTransfer
                    ? const Icon(Icons.swap_horiz)
                    : r.isSplit
                        ? const Icon(Icons.call_split)
                        : null,
                title: Text(
                  r.isTransfer
                      ? '→ ${r.transferAccountName ?? '—'}'
                      : (r.payeeName ?? '—'),
                ),
                subtitle: Text(
                  [
                    r.accountName ?? '',
                    r.categoryName ??
                        (r.isTransfer ? 'Transfer' : 'Uncategorised'),
                    r.dateLabel,
                  ].where((e) => e.isNotEmpty).join(' · '),
                  maxLines: 1,
                ),
                trailing: MoneyText(
                  amountCents: r.amountCents,
                  minorDigits: prefs.currencyMinorDigits,
                  symbol: prefs.currencySymbol,
                ),
                onTap: () => context.go('/transactions/${r.id}'),
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
