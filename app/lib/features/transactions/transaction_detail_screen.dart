import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../entry/quick_entry.dart';
import '../payees/data/payee_repository.dart';
import '../tags/data/tag_repository.dart';
import 'data/transaction_repository.dart';

class TransactionDetailScreen extends ConsumerWidget {
  const TransactionDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = watchPrefs(ref);
    final item = ref.watch(transactionByIdProvider(id));
    final rowFuture = ref.watch(_transactionRowProvider(id));
    final tags = ref.watch(tagsForTransactionProvider(id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction'),
        actions: [
          IconButton(
            tooltip: 'Edit',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => openQuickEntry(context, editingTransactionId: id),
          ),
        ],
      ),
      body: item.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (tx) {
          if (tx == null) return const Center(child: Text('Not found'));
          final raw = rowFuture.value;
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              _PayeeTitle(
                payeeName: tx.payeeName,
                fallback: tx.categoryName ?? 'Transaction',
                payeeId: raw?.payeeId,
              ),
              const SizedBox(height: 8),
              Text(
                Money.format(
                  tx.amountCents,
                  symbol: prefs.currencySymbol,
                  minorDigits: prefs.currencyMinorDigits,
                ),
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 20),
              _DetailRow(label: 'Date', value: tx.dateLabel),
              _DetailRow(label: 'Account', value: tx.accountName ?? '-'),
              _DetailRow(
                label: 'Category',
                value:
                    tx.categoryName ??
                    (tx.isTransfer ? 'Transfer' : 'Uncategorised'),
              ),
              if ((tx.notes ?? '').isNotEmpty)
                _DetailRow(label: 'Note', value: tx.notes!),
              const SizedBox(height: 12),
              _CorrectionBar(transactionId: id),
              const SizedBox(height: 16),
              tags.when(
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
                data: (items) => Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final tag in items)
                      ActionChip(
                        avatar: const Icon(Icons.label_outline, size: 16),
                        label: Text(tag.name),
                        onPressed: () => context.push('/tags/${tag.id}'),
                      ),
                  ],
                ),
              ),
              if (raw?.latitude != null && raw?.longitude != null) ...[
                const SizedBox(height: 24),
                Text(
                  'LOCATION',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 220,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: _MapPreview(
                      latitude: raw!.latitude!,
                      longitude: raw.longitude!,
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// The transaction's headline. When there's a payee it's tappable and opens
/// that payee's history (`/payees/:id`). Rows captured from SMS carry a
/// free-text [payeeName] but no [payeeId] — in that case we find-or-create a
/// canonical payee on tap so the route (and the payee screen's name match)
/// resolves.
class _PayeeTitle extends ConsumerWidget {
  const _PayeeTitle({
    required this.payeeName,
    required this.fallback,
    required this.payeeId,
  });

  final String? payeeName;
  final String fallback;
  final String? payeeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = payeeName?.trim();
    final style = Theme.of(context).textTheme.headlineSmall;
    if (name == null || name.isEmpty) {
      return Text(fallback, style: style);
    }
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () async {
        var id = payeeId;
        id ??= await ref.read(payeeRepoProvider).ensure(name);
        if (context.mounted) context.push('/payees/$id');
      },
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(child: Text(name, style: style)),
          const SizedBox(width: 4),
          Icon(
            Icons.chevron_right,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ],
      ),
    );
  }
}

class _CorrectionBar extends StatelessWidget {
  const _CorrectionBar({required this.transactionId});

  final String transactionId;

  @override
  Widget build(BuildContext context) {
    void edit() => openQuickEntry(context, editingTransactionId: transactionId);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ActionChip(
          avatar: const Icon(Icons.label_outline, size: 16),
          label: const Text('Category'),
          onPressed: edit,
        ),
        ActionChip(
          avatar: const Icon(Icons.store_outlined, size: 16),
          label: const Text('Payee'),
          onPressed: edit,
        ),
        ActionChip(
          avatar: const Icon(Icons.account_balance_outlined, size: 16),
          label: const Text('Account'),
          onPressed: edit,
        ),
        ActionChip(
          avatar: const Icon(Icons.sell_outlined, size: 16),
          label: const Text('Tags'),
          onPressed: edit,
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(child: Text(value, textAlign: TextAlign.right)),
        ],
      ),
    );
  }
}

class _MapPreview extends StatefulWidget {
  const _MapPreview({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;

  @override
  State<_MapPreview> createState() => _MapPreviewState();
}

class _MapPreviewState extends State<_MapPreview> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    final q = '${widget.latitude},${widget.longitude}';
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(
        Uri.parse('https://www.google.com/maps/search/?api=1&query=$q'),
      );
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _controller);
}

final _transactionRowProvider = StreamProvider.family<TransactionRow?, String>(
  (ref, id) => ref.watch(transactionRepoProvider).watchRow(id),
);
