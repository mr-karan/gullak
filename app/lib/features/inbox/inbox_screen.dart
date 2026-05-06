import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../core/snackbars.dart';
import '../../data/ai/pi_ai_client.dart';
import '../../data/sms/sms_pipeline.dart';
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
          IconButton(
            tooltip: 'Refresh SMS',
            icon: const Icon(Icons.refresh),
            onPressed: () => _refreshSms(context, ref),
          ),
          asyncRows.maybeWhen(
            data: (rows) {
              final ready = rows.where((r) => r.hasCandidate).length;
              if (ready == 0) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: TextButton.icon(
                  onPressed: () => _confirmAll(context, ref, ready),
                  icon: const Icon(Icons.done_all, size: 18),
                  label: Text('Confirm all ($ready)'),
                ),
              );
            },
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

  void _refreshSms(BuildContext context, WidgetRef ref) {
    final messenger = ScaffoldMessenger.of(context);
    showTimedSnackBar(
      messenger,
      const SnackBar(content: Text('Scanning SMS inbox…')),
      duration: const Duration(seconds: 2),
    );
    ref
        .read(smsPipelineProvider)
        .retryFailedBackfill()
        .then((added) {
          showTimedSnackBar(
            messenger,
            SnackBar(content: Text('SMS refresh complete — $added new.')),
          );
        })
        .catchError((Object e) {
          showTimedSnackBar(
            messenger,
            SnackBar(content: Text('SMS refresh failed: $e')),
          );
        });
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
      showTimedSnackBar(
        messenger,
        SnackBar(
          content: Text(
            result.failed == 0
                ? 'Confirmed ${result.ok} transaction${result.ok == 1 ? '' : 's'}.'
                : 'Confirmed ${result.ok}, ${result.failed} skipped.',
          ),
        ),
      );
    } catch (e) {
      showTimedSnackBar(
        messenger,
        SnackBar(content: Text('Confirm all failed: $e')),
      );
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
            if (!item.hasCandidate) ...[
              const SizedBox(height: 8),
              Text(
                'Couldn\'t parse this one — open it manually to log.',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: cs.error),
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
                if (!item.hasCandidate)
                  IconButton(
                    tooltip: 'Parse debug',
                    icon: const Icon(Icons.smart_toy_outlined, size: 20),
                    onPressed: () => _showParseDebug(context, ref, item),
                  ),
                if (item.hasCandidate)
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

  void _showParseDebug(BuildContext context, WidgetRef ref, InboxItem item) {
    showDialog<void>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.smart_toy_outlined, size: 20),
            SizedBox(width: 8),
            Text('Parse debug'),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'This row was classified as transactional, but had no parser candidate when it was ingested.',
              ),
              const SizedBox(height: 12),
              Text('Status: ${item.status}'),
              Text('Sender: ${item.address}'),
              Text(
                'Received: ${DateTime.fromMillisecondsSinceEpoch(item.receivedAt)}',
              ),
              const SizedBox(height: 12),
              const Text('SMS body'),
              const SizedBox(height: 4),
              SelectableText(item.body),
              const SizedBox(height: 12),
              const Text(
                'After parser fixes, tap Inbox refresh. It now clears failed rows before rescanning, so stale failures are retried.',
              ),
            ],
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: () => _sendFeedback(context, dialogCtx, ref, item),
            icon: const Icon(Icons.bug_report_outlined, size: 18),
            label: const Text('Send feedback'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _sendFeedback(
    BuildContext pageContext,
    BuildContext dialogCtx,
    WidgetRef ref,
    InboxItem item,
  ) async {
    final messenger = ScaffoldMessenger.of(pageContext);
    try {
      final client = await ref.read(piAiClientProvider.future);
      if (client == null) {
        throw PiAiException('sync server is not configured');
      }
      final id = await client.sendFeedback(
        kind: 'sms_parse_failure',
        message: 'SMS parser produced no candidate for a transactional row',
        payload: {
          'smsRowId': item.id,
          'status': item.status,
          'sender': item.address,
          'body': item.body,
          'receivedAt': item.receivedAt,
          'sentAt': DateTime.now().toIso8601String(),
        },
      );
      if (dialogCtx.mounted) Navigator.of(dialogCtx).pop();
      showTimedSnackBar(
        messenger,
        SnackBar(content: Text('Feedback sent${id == null ? '' : ' #$id'}')),
      );
    } catch (e) {
      showTimedSnackBar(
        messenger,
        SnackBar(content: Text('Feedback failed: $e')),
      );
    }
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
