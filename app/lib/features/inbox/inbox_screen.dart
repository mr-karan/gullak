import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/snackbars.dart';
import '../../data/ai/pi_ai_client.dart';
import '../../data/sms/sms_pipeline.dart';
import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../entry/quick_entry.dart';
import 'data/sms_repository.dart';

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

enum _InboxAction { refresh, retryFailed }

enum _InboxBucket {
  ready('Ready', Icons.task_alt_outlined),
  review('Review', Icons.rate_review_outlined),
  matched('Matched', Icons.link_outlined),
  ignored('Ignored', Icons.visibility_off_outlined);

  const _InboxBucket(this.label, this.icon);
  final String label;
  final IconData icon;
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  _InboxBucket _bucket = _InboxBucket.ready;
  bool _scanning = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!ref.read(prefsProvider).smsEnabled) return;
      ref.read(smsPipelineProvider).startListening();
    });
  }

  @override
  Widget build(BuildContext context) {
    final asyncRows = switch (_bucket) {
      _InboxBucket.ignored => ref.watch(ignoredInboxItemsProvider),
      _InboxBucket.matched => ref.watch(matchedInboxItemsProvider),
      _InboxBucket.ready ||
      _InboxBucket.review => ref.watch(inboxItemsProvider),
    };
    final prefs = watchPrefs(ref);
    final pipeline = ref.watch(smsPipelineProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox'),
        actions: [
          asyncRows.maybeWhen(
            data: (rows) {
              final failed = rows.where((r) => r.status == 'error').length;
              return PopupMenuButton<_InboxAction>(
                tooltip: 'Inbox actions',
                onSelected: (action) {
                  switch (action) {
                    case _InboxAction.refresh:
                      _refreshSms(context, ref);
                    case _InboxAction.retryFailed:
                      _retryFailedSms(context, ref, failed);
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: _InboxAction.refresh,
                    child: ListTile(
                      leading: Icon(Icons.refresh),
                      title: Text('Scan SMS'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                  if (_bucket != _InboxBucket.ignored && failed > 0)
                    PopupMenuItem(
                      value: _InboxAction.retryFailed,
                      enabled: !_scanning,
                      child: ListTile(
                        leading: const Icon(Icons.replay_outlined),
                        title: Text('Retry failed ($failed)'),
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                ],
              );
            },
            orElse: () => PopupMenuButton<_InboxAction>(
              tooltip: 'Inbox actions',
              onSelected: (action) {
                switch (action) {
                  case _InboxAction.refresh:
                    _refreshSms(context, ref);
                  case _InboxAction.retryFailed:
                    break;
                }
              },
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: _InboxAction.refresh,
                  child: Text('Scan SMS'),
                ),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          ValueListenableBuilder<SmsScanState>(
            valueListenable: pipeline.scanState,
            builder: (context, scan, _) => _SmsScanBanner(scan: scan),
          ),
          asyncRows.maybeWhen(
            data: (rows) => _InboxBucketTabs(
              selected: _bucket,
              rows: rows,
              onChanged: (bucket) => setState(() => _bucket = bucket),
            ),
            orElse: () => _InboxBucketTabs(
              selected: _bucket,
              rows: const [],
              onChanged: (bucket) => setState(() => _bucket = bucket),
            ),
          ),
          if (_bucket == _InboxBucket.ready)
            asyncRows.maybeWhen(
              data: (rows) => _InboxBulkActions(
                rows: rows,
                scanning: _scanning,
                onConfirmAll: (ready) => _confirmAll(context, ref, ready),
              ),
              orElse: () => const SizedBox.shrink(),
            ),
          Expanded(
            child: asyncRows.when(
              data: (rows) {
                final visibleRows = _filterRows(rows);
                if (visibleRows.isEmpty) {
                  return EmptyState(
                    icon: _emptyIcon,
                    title: _emptyTitle,
                    body: _emptyBody,
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: visibleRows.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _InboxRow(
                    item: visibleRows[i],
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                    bucket: _bucket,
                  ),
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

  List<InboxItem> _filterRows(List<InboxItem> rows) => switch (_bucket) {
    _InboxBucket.ready => rows.where((r) => r.hasCandidate).toList(),
    _InboxBucket.review => rows.where((r) => !r.hasCandidate).toList(),
    _InboxBucket.matched || _InboxBucket.ignored => rows,
  };

  IconData get _emptyIcon => switch (_bucket) {
    _InboxBucket.ready => Icons.task_alt_outlined,
    _InboxBucket.review => Icons.rate_review_outlined,
    _InboxBucket.matched => Icons.link_outlined,
    _InboxBucket.ignored => Icons.layers_clear_outlined,
  };

  String get _emptyTitle => switch (_bucket) {
    _InboxBucket.ready => 'No ready SMS',
    _InboxBucket.review => 'No SMS need review',
    _InboxBucket.matched => 'No matched SMS yet',
    _InboxBucket.ignored => 'No ignored SMS',
  };

  String get _emptyBody => switch (_bucket) {
    _InboxBucket.ready =>
      'Parsed bank SMS that are ready to confirm will show here.',
    _InboxBucket.review =>
      'SMS with unclear amount, merchant, account, or transfer intent will show here.',
    _InboxBucket.matched =>
      'Confirmed and duplicate SMS matches will show here for audit.',
    _InboxBucket.ignored =>
      'OTPs, marketing, and dismissed messages will show here. Tap one to log it manually if needed.',
  };

  void _refreshSms(BuildContext context, WidgetRef ref) {
    if (_scanning) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _scanning = true);
    showTimedSnackBar(
      messenger,
      const SnackBar(content: Text('Scanning SMS inbox…')),
      duration: const Duration(seconds: 2),
    );
    ref
        .read(smsPipelineProvider)
        .retryFailedBackfill()
        .then((added) {
          if (!mounted) return;
          setState(() => _scanning = false);
          showTimedSnackBar(
            messenger,
            SnackBar(content: Text('SMS refresh complete — $added new.')),
          );
        })
        .catchError((Object e) {
          if (!mounted || !context.mounted) return;
          setState(() => _scanning = false);
          showTimedSnackBar(
            messenger,
            errorSnackBar(context, 'SMS refresh failed: $e'),
          );
        });
  }

  void _retryFailedSms(BuildContext context, WidgetRef ref, int count) {
    if (_scanning) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _scanning = true);
    showTimedSnackBar(
      messenger,
      const SnackBar(content: Text('Retrying failed SMS and rescanning…')),
      duration: const Duration(seconds: 2),
    );
    ref
        .read(smsPipelineProvider)
        .retryFailuresAndRescan()
        .then((added) {
          if (!mounted) return;
          setState(() => _scanning = false);
          showTimedSnackBar(
            messenger,
            SnackBar(content: Text('Retry complete — $added new.')),
          );
        })
        .catchError((Object e) {
          if (!mounted || !context.mounted) return;
          setState(() => _scanning = false);
          showTimedSnackBar(
            messenger,
            errorSnackBar(context, 'Retry failed: $e'),
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

class _SmsScanBanner extends StatelessWidget {
  const _SmsScanBanner({required this.scan});

  final SmsScanState scan;

  @override
  Widget build(BuildContext context) {
    if (!scan.running) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.surfaceContainerHigh,
      child: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LinearProgressIndicator(value: scan.progress),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      scan.message,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InboxBulkActions extends StatelessWidget {
  const _InboxBulkActions({
    required this.rows,
    required this.scanning,
    required this.onConfirmAll,
  });

  final List<InboxItem> rows;
  final bool scanning;
  final ValueChanged<int> onConfirmAll;

  @override
  Widget build(BuildContext context) {
    final ready = rows.where((r) => r.hasCandidate).length;
    if (ready == 0) return const SizedBox.shrink();

    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.surface,
      child: SafeArea(
        top: false,
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: scanning ? null : () => onConfirmAll(ready),
              icon: const Icon(Icons.done_all, size: 18),
              label: Text('Confirm all ($ready)'),
            ),
          ),
        ),
      ),
    );
  }
}

class _InboxBucketTabs extends StatelessWidget {
  const _InboxBucketTabs({
    required this.selected,
    required this.rows,
    required this.onChanged,
  });

  final _InboxBucket selected;
  final List<InboxItem> rows;
  final ValueChanged<_InboxBucket> onChanged;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: SegmentedButton<_InboxBucket>(
          showSelectedIcon: false,
          segments: [
            for (final bucket in _InboxBucket.values)
              ButtonSegment(
                value: bucket,
                icon: Icon(bucket.icon, size: 18),
                label: Text('${bucket.label} (${_count(bucket)})'),
              ),
          ],
          selected: {selected},
          onSelectionChanged: (value) => onChanged(value.single),
        ),
      ),
    );
  }

  int _count(_InboxBucket bucket) => switch (bucket) {
    _InboxBucket.ready => rows.where((r) => r.hasCandidate).length,
    _InboxBucket.review => rows.where((r) => !r.hasCandidate).length,
    _InboxBucket.matched || _InboxBucket.ignored => rows.length,
  };
}

class _InboxRow extends ConsumerWidget {
  const _InboxRow({
    required this.item,
    required this.symbol,
    required this.minorDigits,
    required this.bucket,
  });

  final InboxItem item;
  final String symbol;
  final int minorDigits;

  final _InboxBucket bucket;

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
                  MoneyText(
                    amountCents: item.suggestedIsIncome ? amount : -amount,
                    symbol: symbol,
                    minorDigits: minorDigits,
                    showSign: true,
                    color: item.suggestedIsIncome ? cs.tertiary : null,
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
            if (bucket == _InboxBucket.ignored ||
                bucket == _InboxBucket.matched) ...[
              const SizedBox(height: 8),
              Text(
                _statusReason(item.status),
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
              ),
            ] else if (!item.hasCandidate) ...[
              const SizedBox(height: 8),
              Text(
                _parseFailureHint(item),
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
                if (bucket == _InboxBucket.ignored) ...[
                  FilledButton.tonalIcon(
                    onPressed: () => _logManually(context, ref, item),
                    icon: const Icon(Icons.edit_note, size: 18),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 36),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                    ),
                    label: const Text('Log manually'),
                  ),
                ] else if (bucket == _InboxBucket.review) ...[
                  TextButton(
                    onPressed: () => _dismissWithUndo(context, ref, item),
                    child: const Text('Dismiss'),
                  ),
                  const SizedBox(width: 4),
                  if (!item.hasCandidate)
                    IconButton(
                      tooltip: 'Parse debug',
                      icon: const Icon(Icons.smart_toy_outlined, size: 20),
                      onPressed: () => _showParseDebug(context, ref, item),
                    ),
                ],
                if (bucket == _InboxBucket.ready && item.hasCandidate) ...[
                  TextButton(
                    onPressed: () => _dismissWithUndo(context, ref, item),
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

  static String _statusReason(String status) => switch (status) {
    'accepted' => 'Already matched — transaction was created from this SMS.',
    'none' => 'Ignored — classifier marked as non-transactional.',
    'duplicate' =>
      'Ignored — looked like a duplicate of an existing transaction.',
    'dismissed' => 'Dismissed by you.',
    _ => 'Ignored.',
  };

  static String _parseFailureHint(InboxItem item) {
    final body = item.body.toLowerCase();
    if (!RegExp(r'\b(rs\.?|inr|₹)\s*[0-9]').hasMatch(body)) {
      return 'Needs review: amount was not clear.';
    }
    if (RegExp(r'\bcredited|received|refund|reversal\b').hasMatch(body)) {
      return 'Needs review: this may be income or a refund.';
    }
    if (RegExp(r'\btransfer|self|own account|upi ref\b').hasMatch(body)) {
      return 'Needs review: this may be a transfer.';
    }
    return 'Needs review: merchant or account was not clear.';
  }

  void _dismissWithUndo(BuildContext context, WidgetRef ref, InboxItem item) {
    final repo = ref.read(smsRepositoryProvider);
    repo.dismiss(item.id);
    showTimedSnackBar(
      ScaffoldMessenger.of(context),
      SnackBar(
        content: const Text('Dismissed.'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => repo.reopen(item.id),
        ),
      ),
      duration: const Duration(seconds: 4),
    );
  }

  Future<void> _logManually(
    BuildContext context,
    WidgetRef ref,
    InboxItem item,
  ) async {
    // Re-classify on the spot: drop the row's stale `none/duplicate/
    // dismissed` status so the user's next Re-scan reparses it, and
    // pre-fill QuickEntry with the body so they can log it now without
    // typing it out again.
    await ref.read(smsRepositoryProvider).reopen(item.id);
    if (!context.mounted) return;
    await openQuickEntry(context, initialNote: item.body);
  }

  void _showParseDebug(BuildContext context, WidgetRef ref, InboxItem item) {
    showDialog<void>(
      context: context,
      builder: (dialogCtx) => _ParseDebugDialog(item: item),
    );
  }
}

/// Shows the SMS body + ingest status. Holds local state for the
/// "Send feedback" round-trip so a press is immediately visible
/// (button disables, label flips to "Sending…", then "Sent ✓" or an
/// inline error). The previous version awaited the network call and
/// only spoke to the user via a post-pop snackbar — a slow request or
/// an exception in the Riverpod provider gave the impression the
/// button was dead.
class _ParseDebugDialog extends ConsumerStatefulWidget {
  const _ParseDebugDialog({required this.item});
  final InboxItem item;

  @override
  ConsumerState<_ParseDebugDialog> createState() => _ParseDebugDialogState();
}

class _ParseDebugDialogState extends ConsumerState<_ParseDebugDialog> {
  bool _sending = false;
  String? _result; // null = idle, "Sent #N" on success, "Failed: …" on error.
  bool _success = false;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final item = widget.item;
    return AlertDialog(
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
              'AI parsing did not return a candidate for this SMS. The '
              'classifier thought it looked transactional, so it landed '
              'here for review.',
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
              'Tap Refresh in the Inbox after a parser fix to retry '
              'this row. "Send feedback" uploads the SMS to your sync '
              'server\'s /v1/feedback so you can review what tripped '
              'the parser.',
            ),
            if (_result != null) ...[
              const SizedBox(height: 12),
              Text(
                _result!,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: _success ? cs.primary : cs.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton.icon(
          onPressed: _sending || _success ? null : _send,
          icon: _sending
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.bug_report_outlined, size: 18),
          label: Text(_sending ? 'Sending…' : 'Send feedback'),
        ),
        TextButton(
          onPressed: _sending ? null : () => Navigator.of(context).maybePop(),
          child: const Text('Close'),
        ),
      ],
    );
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _result = null;
      _success = false;
    });
    try {
      final client = await ref.read(piAiClientProvider.future);
      if (client == null) {
        throw PiAiException(
          'Sync server is not configured. Settings → Sync server.',
        );
      }
      final id = await client
          .sendFeedback(
            kind: 'sms_parse_failure',
            message: 'SMS parser produced no candidate for a transactional row',
            payload: {
              'smsRowId': widget.item.id,
              'status': widget.item.status,
              'sender': widget.item.address,
              'body': widget.item.body,
              'receivedAt': widget.item.receivedAt,
              'sentAt': DateTime.now().toIso8601String(),
            },
          )
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      setState(() {
        _sending = false;
        _success = true;
        _result = id == null ? 'Sent ✓' : 'Sent ✓ (#$id)';
      });
    } catch (e) {
      if (!mounted) return;
      final message = e is PiAiException ? e.message : '$e';
      setState(() {
        _sending = false;
        _success = false;
        _result = 'Failed: $message';
      });
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        errorSnackBar(context, message),
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
