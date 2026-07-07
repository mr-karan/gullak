import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/snackbars.dart';
import '../../data/ai/pi_ai_client.dart';
import '../../data/sms/sms_pipeline.dart';
import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/error_state.dart';
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
    // Watch all three buckets, not just the selected one. Counts must stay
    // live and consistent across tabs — deriving every tab's count from a
    // single active stream made them jump when switching buckets, and made
    // a just-confirmed row look like it lingered because the count never
    // moved. Subscribing to all three keeps Drift pushing fresh rows to each.
    final pendingAsync = ref.watch(inboxItemsProvider);
    final matchedAsync = ref.watch(matchedInboxItemsProvider);
    final ignoredAsync = ref.watch(ignoredInboxItemsProvider);
    final asyncRows = switch (_bucket) {
      _InboxBucket.ignored => ignoredAsync,
      _InboxBucket.matched => matchedAsync,
      _InboxBucket.ready || _InboxBucket.review => pendingAsync,
    };
    final pendingRows = pendingAsync.asData?.value ?? const <InboxItem>[];
    final counts = <_InboxBucket, int>{
      _InboxBucket.ready: pendingRows.where((r) => r.hasCandidate).length,
      _InboxBucket.review: pendingRows.where((r) => !r.hasCandidate).length,
      _InboxBucket.matched: matchedAsync.asData?.value.length ?? 0,
      _InboxBucket.ignored: ignoredAsync.asData?.value.length ?? 0,
    };
    final prefs = watchPrefs(ref);
    final pipeline = ref.watch(smsPipelineProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox'),
        actions: [
          asyncRows.maybeWhen(
            data: (rows) {
              final failed = rows
                  .where(
                    (r) => r.status == 'parse_failed' || r.status == 'error',
                  )
                  .length;
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
          _InboxBucketChips(
            selected: _bucket,
            counts: counts,
            onChanged: (bucket) => setState(() => _bucket = bucket),
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
                return _InboxList(
                  // Key by bucket so switching buckets remounts a fresh list
                  // (no cross-bucket animation); within a bucket, the list
                  // diffs stream updates to slide confirmed/dismissed cards out.
                  key: ValueKey(_bucket),
                  rows: visibleRows,
                  bucket: _bucket,
                  symbol: prefs.currencySymbol,
                  minorDigits: prefs.currencyMinorDigits,
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(
                message: e.toString(),
                onRetry: () => ref.invalidate(inboxItemsProvider),
              ),
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
    List<InboxItem> ready,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    // Forecast using the SAME resolution the commit runs (rules + account
    // matcher + category hints), not the display-layer suggestions — otherwise
    // the numbers can disagree with what actually happens.
    final preview = await ref
        .read(smsRepositoryProvider)
        .previewConfirmAll(ready.map((r) => r.id).toList());
    if (!context.mounted) return;
    final count = preview.total;
    if (count == 0) return;
    final go = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('Confirm $count candidate${count == 1 ? '' : 's'}?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Each becomes a transaction from its parsed amount, payee, and '
              'account hint.',
            ),
            const SizedBox(height: 12),
            _PreviewLine(
              icon: Icons.account_balance_wallet_outlined,
              text: preview.noAccount == 0
                  ? 'All matched to an account'
                  : '${preview.noAccount} will use your first account (no match)',
            ),
            const SizedBox(height: 4),
            _PreviewLine(
              icon: Icons.label_outline,
              text: preview.noCategory == 0
                  ? 'All have a category'
                  : '${preview.noCategory} will be uncategorised',
            ),
            if (preview.ignored > 0) ...[
              const SizedBox(height: 4),
              _PreviewLine(
                icon: Icons.block_outlined,
                text: '${preview.ignored} skipped by a rule',
              ),
            ],
          ],
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

class _PreviewLine extends StatelessWidget {
  const _PreviewLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(icon, size: 18, color: cs.onSurfaceVariant),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
        ),
      ],
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
  final ValueChanged<List<InboxItem>> onConfirmAll;

  @override
  Widget build(BuildContext context) {
    final readyRows = rows.where((r) => r.hasCandidate).toList();
    if (readyRows.isEmpty) return const SizedBox.shrink();

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
              onPressed: scanning ? null : () => onConfirmAll(readyRows),
              icon: const Icon(Icons.done_all, size: 18),
              label: Text('Confirm all (${readyRows.length})'),
            ),
          ),
        ),
      ),
    );
  }
}

/// Bucket chooser as filter chips. A bucket's chip hides when its count is
/// zero (unless it's the one you're viewing) so the row stays focused on
/// what actually needs triage.
class _InboxBucketChips extends StatelessWidget {
  const _InboxBucketChips({
    required this.selected,
    required this.counts,
    required this.onChanged,
  });

  final _InboxBucket selected;
  final Map<_InboxBucket, int> counts;
  final ValueChanged<_InboxBucket> onChanged;

  @override
  Widget build(BuildContext context) {
    final visible = [
      for (final bucket in _InboxBucket.values)
        if ((counts[bucket] ?? 0) > 0 || bucket == selected) bucket,
    ];
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: SizedBox(
        height: 48,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
          children: [
            for (final bucket in visible)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  avatar: Icon(bucket.icon, size: 18),
                  label: Text('${bucket.label} ${counts[bucket] ?? 0}'),
                  selected: selected == bucket,
                  showCheckmark: false,
                  onSelected: (_) => onChanged(bucket),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Hosts an [AnimatedList] over the bucket's rows and diffs stream updates so a
/// confirmed/dismissed card slides + fades out and the next card rises to fill
/// the gap — email-client triage rhythm. Keyed by bucket in the parent, so a
/// bucket switch remounts this fresh instead of animating the whole set.
class _InboxList extends StatefulWidget {
  const _InboxList({
    required this.rows,
    required this.bucket,
    required this.symbol,
    required this.minorDigits,
    super.key,
  });

  final List<InboxItem> rows;
  final _InboxBucket bucket;
  final String symbol;
  final int minorDigits;

  @override
  State<_InboxList> createState() => _InboxListState();
}

class _InboxListState extends State<_InboxList> {
  final _listKey = GlobalKey<AnimatedListState>();
  late final List<InboxItem> _shown = List.of(widget.rows);
  static const _anim = Duration(milliseconds: 260);

  @override
  void didUpdateWidget(covariant _InboxList old) {
    super.didUpdateWidget(old);
    final next = widget.rows;
    final nextIds = next.map((r) => r.id).toSet();
    // Remove (back-to-front so indices stay valid) rows that left the bucket.
    for (var i = _shown.length - 1; i >= 0; i--) {
      if (!nextIds.contains(_shown[i].id)) {
        final gone = _shown.removeAt(i);
        _listKey.currentState?.removeItem(
          i,
          (context, animation) => _card(gone, animation),
          duration: _anim,
        );
      }
    }
    // Insert rows that arrived, at their target index.
    final shownIds = _shown.map((r) => r.id).toSet();
    for (var i = 0; i < next.length; i++) {
      if (!shownIds.contains(next[i].id)) {
        _shown.insert(i, next[i]);
        _listKey.currentState?.insertItem(i, duration: _anim);
      }
    }
    // Refresh content of rows that stayed (status/suggestion may have changed).
    for (var i = 0; i < _shown.length && i < next.length; i++) {
      if (_shown[i].id == next[i].id) _shown[i] = next[i];
    }
  }

  Widget _card(InboxItem item, Animation<double> animation) {
    final curved = CurvedAnimation(parent: animation, curve: Curves.easeOut);
    return SizeTransition(
      sizeFactor: curved,
      child: FadeTransition(
        opacity: curved,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _InboxRow(
            item: item,
            symbol: widget.symbol,
            minorDigits: widget.minorDigits,
            bucket: widget.bucket,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedList(
      key: _listKey,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      initialItemCount: _shown.length,
      itemBuilder: (context, index, animation) =>
          _card(_shown[index], animation),
    );
  }
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
                _SenderGlyph(income: item.suggestedIsIncome && amount != null),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (title != item.address)
                        Text(
                          item.address,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: cs.onSurfaceVariant),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
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
            _ExpandableBody(text: item.body),
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
                  if (!item.hasCandidate) ...[
                    IconButton(
                      tooltip: 'Parse debug',
                      icon: const Icon(Icons.smart_toy_outlined, size: 20),
                      onPressed: () => _showParseDebug(context, ref, item),
                    ),
                    FilledButton.tonal(
                      onPressed: () => _logFromReview(context, ref, item),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 36),
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                      ),
                      child: const Text('Log manually'),
                    ),
                  ],
                ],
                if (bucket == _InboxBucket.ready && item.hasCandidate) ...[
                  TextButton(
                    onPressed: () => _dismissWithUndo(context, ref, item),
                    child: const Text('Dismiss'),
                  ),
                  const SizedBox(width: 4),
                  FilledButton.tonal(
                    onPressed: () => _confirmWithReview(context, ref, item),
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
    'none' || 'not_a_txn' => 'Ignored — classified as non-transactional.',
    'duplicate' =>
      'Ignored — looked like a duplicate of an existing transaction.',
    'dismissed' => 'Dismissed by you.',
    'pending_parse' || 'parsing' => 'Waiting to be parsed by the server.',
    'parse_failed' =>
      'The server could not parse this SMS — tap to log it manually.',
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

  Future<void> _confirmWithReview(
    BuildContext context,
    WidgetRef ref,
    InboxItem item,
  ) async {
    final repo = ref.read(smsRepositoryProvider);
    final draft = await repo.buildDraft(item.id);
    if (!context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    if (draft == null) {
      showTimedSnackBar(
        messenger,
        const SnackBar(content: Text('Could not build a draft from this SMS.')),
      );
      return;
    }
    if (draft.duplicateOf != null) {
      showTimedSnackBar(
        messenger,
        const SnackBar(
          content: Text(
            'A similar transaction already exists. Saving will create a second row.',
          ),
        ),
        duration: const Duration(seconds: 4),
      );
    }
    await openQuickEntry(
      context,
      smsDraft: draft,
      onCreated: (transactionId) async {
        await repo.confirmFromTransaction(
          smsRowId: draft.smsRowId,
          transactionId: transactionId,
          accountId: draft.accountId,
          categoryId: draft.categoryId,
          payeeId: draft.payeeId,
        );
      },
    );
  }

  /// Review-bucket equivalent of [_confirmWithReview] for rows the parser
  /// couldn't structure (no candidate). The classifier was confident this
  /// SMS is a real transaction, so let the user fill in the metadata in
  /// Quick Entry — prefilled with the SMS body — then link the created
  /// transaction back to the SMS row. That moves it out of review into
  /// "matched", the same terminal state as a normal confirm, just with
  /// hand-entered details. Without the link the row would linger in review.
  Future<void> _logFromReview(
    BuildContext context,
    WidgetRef ref,
    InboxItem item,
  ) async {
    final repo = ref.read(smsRepositoryProvider);
    await openQuickEntry(
      context,
      initialNote: item.body,
      onCreated: (transactionId) async {
        await repo.confirmFromTransaction(
          smsRowId: item.id,
          transactionId: transactionId,
        );
      },
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

  Future<void> _showParseDebug(
    BuildContext context,
    WidgetRef ref,
    InboxItem item,
  ) async {
    // The dialog pops 'log' when the user decides it's a real transaction.
    // We open Quick Entry from here (the parent) so the dialog's own
    // context being torn down on pop doesn't break the sheet.
    final action = await showDialog<String>(
      context: context,
      builder: (dialogCtx) => _ParseDebugDialog(item: item),
    );
    if (action == 'log' && context.mounted) {
      await _logFromReview(context, ref, item);
    }
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
        FilledButton.tonal(
          onPressed: _sending ? null : () => Navigator.of(context).pop('log'),
          child: const Text('Log manually'),
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

/// Leading avatar for a triage card — a bank glyph that tints income green,
/// giving the card a visual anchor and an at-a-glance credit/debit cue.
class _SenderGlyph extends StatelessWidget {
  const _SenderGlyph({required this.income});
  final bool income;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final accent = income ? cs.tertiary : cs.primary;
    return CircleAvatar(
      radius: 18,
      backgroundColor: accent.withValues(alpha: 0.14),
      child: Icon(Icons.account_balance_outlined, size: 18, color: accent),
    );
  }
}

/// The SMS body, truncated to two lines until tapped. Seeing the raw text is
/// a trust feature — tap to expand, tap again to collapse.
class _ExpandableBody extends StatefulWidget {
  const _ExpandableBody({required this.text});
  final String text;

  @override
  State<_ExpandableBody> createState() => _ExpandableBodyState();
}

class _ExpandableBodyState extends State<_ExpandableBody> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedSize(
        duration: const Duration(milliseconds: 150),
        alignment: Alignment.topCenter,
        curve: Curves.easeOut,
        child: Text(
          widget.text,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
          maxLines: _expanded ? null : 2,
          overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
        ),
      ),
    );
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
