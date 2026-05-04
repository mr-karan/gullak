import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/theme.dart';
import '../../ui/widgets/empty_state.dart';
import 'data/sms_repository.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncRows = ref.watch(inboxItemsProvider);
    final prefs = watchPrefs(ref);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox'),
        actions: [
          asyncRows.maybeWhen(
            data: (rows) => rows.isEmpty
                ? const SizedBox.shrink()
                : Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: TextButton.icon(
                      onPressed: () => _confirmAll(context, ref, rows.length),
                      icon: const Icon(Icons.done_all, size: 18),
                      label: Text('Confirm all (${rows.length})'),
                    ),
                  ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: asyncRows.when(
        data: (rows) {
          if (rows.isEmpty) {
            return const EmptyState(
              icon: Icons.inbox_outlined,
              title: 'All caught up',
              body:
                  'New bank SMS that look like transactions will land here for review.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (_, i) => _InboxRow(
              item: rows[i],
              symbol: prefs.currencySymbol,
              minorDigits: prefs.currencyMinorDigits,
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  Future<void> _confirmAll(
    BuildContext context,
    WidgetRef ref,
    int count,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final go = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('Confirm $count candidate${count == 1 ? '' : 's'}?'),
        content: const Text(
          'Each will be added as a transaction using its parsed amount, '
          'payee, and account hint. Items without a matched account will '
          'fall back to your first account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: const Text('Confirm all'),
          ),
        ],
      ),
    );
    if (go != true) return;
    try {
      final result = await ref.read(smsRepositoryProvider).confirmAll();
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              result.failed == 0
                  ? 'Confirmed ${result.ok} transaction${result.ok == 1 ? '' : 's'}.'
                  : 'Confirmed ${result.ok}, ${result.failed} skipped.',
            ),
          ),
        );
    } catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('Confirm all failed: $e')));
    }
  }
}

class _InboxRow extends ConsumerWidget {
  const _InboxRow({
    required this.item,
    required this.symbol,
    required this.minorDigits,
  });

  final InboxItem item;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final amount = item.suggestedAmountCents;
    final title = item.suggestedPayee?.trim().isNotEmpty == true
        ? item.suggestedPayee!
        : item.address;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (amount != null)
                  Text(
                    Money.format(
                      amount,
                      symbol: symbol,
                      minorDigits: minorDigits,
                    ),
                    style: moneyStyle(context, size: 16),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              item.body,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (item.suggestedAccountName != null ||
                item.suggestedCategoryName != null) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (item.suggestedAccountName != null)
                    _Chip(
                      icon: Icons.account_balance_outlined,
                      label: item.suggestedAccountName!,
                    ),
                  if (item.suggestedCategoryName != null)
                    _Chip(
                      icon: Icons.label_outline,
                      label: item.suggestedCategoryName!,
                    ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Text(
                  _formatTime(item.receivedAt),
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () =>
                      ref.read(smsRepositoryProvider).dismiss(item.id),
                  child: const Text('Dismiss'),
                ),
                const SizedBox(width: 4),
                FilledButton.tonal(
                  onPressed: () =>
                      ref.read(smsRepositoryProvider).confirm(item.id),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: const Text('Confirm'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _formatTime(int epochMs) {
    final now = DateTime.now();
    final t = DateTime.fromMillisecondsSinceEpoch(epochMs);
    final diff = now.difference(t);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${t.day}/${t.month}/${t.year % 100}';
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: cs.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: cs.onSecondaryContainer),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: cs.onSecondaryContainer,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
