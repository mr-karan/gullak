import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';
import '../../ui/widgets/money_text.dart';
import 'data/transaction_repository.dart';

class TransactionDetailScreen extends ConsumerWidget {
  const TransactionDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncTx = ref.watch(transactionByIdProvider(id));
    final prefs = ref.watch(prefsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: () => _confirmDelete(context, ref),
          ),
        ],
      ),
      body: asyncTx.when(
        data: (tx) {
          if (tx == null) {
            return const Center(child: Text('Not found'));
          }
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Center(
                child: MoneyText(
                  amountCents: tx.amountCents,
                  minorDigits: prefs.currencyMinorDigits,
                  symbol: prefs.currencySymbol,
                  size: MoneySize.hero,
                ),
              ),
              const SizedBox(height: 24),
              _row('Payee', tx.payeeName ?? '—'),
              _row('Category', tx.categoryName ?? 'Uncategorised'),
              _row('Account', tx.accountName ?? '—'),
              _row('Date', tx.dateLabel),
              _row('Cleared', tx.cleared ? 'Yes' : 'No'),
              _row('Sync', _statusLabel(tx.syncStatus)),
              if (tx.notes != null && tx.notes!.isNotEmpty) _row('Notes', tx.notes!),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 100,
              child: Text(
                label,
                style: const TextStyle(fontWeight: FontWeight.w500),
              ),
            ),
            Expanded(child: Text(value)),
          ],
        ),
      );

  String _statusLabel(String s) => switch (s) {
        'synced' => 'Synced',
        'pending_push' => 'Waiting to sync',
        'pending_delete' => 'Pending delete',
        'failed' => 'Sync failed',
        _ => s,
      };

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete this transaction?'),
        content: const Text('It will be removed from Actual on the next sync.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(transactionRepoProvider).markDeletePending(id);
    invalidateTransactionLists(ref);
    if (!context.mounted) return;
    context.pop();
    unawaited(ref.read(syncControllerProvider.notifier).sync());
  }
}
