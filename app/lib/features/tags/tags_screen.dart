import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../transactions/data/transaction_repository.dart';
import 'data/tag_repository.dart';

class TagsScreen extends ConsumerWidget {
  const TagsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = watchPrefs(ref);
    final analytics = ref.watch(tagAnalyticsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tags'),
        actions: [
          IconButton(
            tooltip: 'Add tag',
            icon: const Icon(Icons.add),
            onPressed: () => _addTag(context, ref),
          ),
        ],
      ),
      body: analytics.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (rows) {
          if (rows.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 96),
                Center(child: Text('No tags yet.')),
              ],
            );
          }
          return ListView.builder(
            itemCount: rows.length,
            itemBuilder: (_, i) {
              final row = rows[i];
              final active = prefs.activeTagId == row.tag.id;
              return ListTile(
                leading: Icon(
                  active ? Icons.push_pin : Icons.label_outline,
                  color: row.tag.color == null ? null : Color(row.tag.color!),
                ),
                title: Text(row.tag.name),
                subtitle: Text('${row.transactionCount} transactions'),
                trailing: Text(
                  Money.format(
                    row.totalSpendCents,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                  ),
                ),
                onTap: () => context.push('/tags/${row.tag.id}'),
                onLongPress: () async {
                  await prefs.setActiveTagId(active ? null : row.tag.id);
                  bumpPrefs(ref);
                },
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _addTag(BuildContext context, WidgetRef ref) async {
    final ctrl = TextEditingController();
    try {
      final name = await showDialog<String>(
        context: context,
        builder: (dialogCtx) => AlertDialog(
          title: const Text('New tag'),
          content: TextField(
            controller: ctrl,
            autofocus: true,
            decoration: const InputDecoration(hintText: 'Coorg trip'),
            textCapitalization: TextCapitalization.words,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogCtx).pop(ctrl.text.trim()),
              child: const Text('Create'),
            ),
          ],
        ),
      );
      if (name == null || name.isEmpty) return;
      final id = await ref.read(tagRepoProvider).create(name: name);
      if (context.mounted) context.push('/tags/$id');
    } finally {
      ctrl.dispose();
    }
  }
}

class TagDetailScreen extends ConsumerWidget {
  const TagDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = watchPrefs(ref);
    final tag = ref.watch(tagByIdProvider(id));
    final rows = ref.watch(
      transactionsListProvider(TransactionListQuery(tagId: id)),
    );
    final categoryBreakdown = ref.watch(_tagCategoryBreakdownProvider(id));
    final accountBreakdown = ref.watch(_tagAccountBreakdownProvider(id));
    final timeline = ref.watch(_tagTimelineProvider(id));
    return Scaffold(
      appBar: AppBar(
        title: Text(tag.value?.name ?? 'Tag'),
        actions: [
          IconButton(
            tooltip: prefs.activeTagId == id ? 'Clear active tag' : 'Use tag',
            icon: Icon(
              prefs.activeTagId == id
                  ? Icons.push_pin
                  : Icons.push_pin_outlined,
            ),
            onPressed: () async {
              await prefs.setActiveTagId(prefs.activeTagId == id ? null : id);
              bumpPrefs(ref);
            },
          ),
        ],
      ),
      body: ListView(
        children: [
          rows.when(
            loading: () => const SizedBox(height: 4),
            error: (_, _) => const SizedBox.shrink(),
            data: (items) {
              final spend = items
                  .where((t) => t.amountCents < 0 && !t.isTransfer)
                  .fold<int>(0, (s, t) => s - t.amountCents);
              return Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: _Metric(
                        label: 'Spend',
                        value: Money.format(
                          spend,
                          symbol: prefs.currencySymbol,
                          minorDigits: prefs.currencyMinorDigits,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _Metric(
                        label: 'Entries',
                        value: items.length.toString(),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Text(
              'TIMELINE',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          timeline.when(
            loading: () => const SizedBox(height: 56),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
            data: (items) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: _Timeline(points: items),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Text(
              'BY CATEGORY',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          categoryBreakdown.when(
            loading: () => const SizedBox(height: 48),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
            data: (items) => Column(
              children: [
                for (final b in items)
                  ListTile(
                    leading: Icon(
                      Icons.pie_chart_outline,
                      color: b.color == null ? null : Color(b.color!),
                    ),
                    title: Text(b.label),
                    trailing: Text(
                      Money.format(
                        b.amountCents,
                        symbol: prefs.currencySymbol,
                        minorDigits: prefs.currencyMinorDigits,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Text(
              'BY ACCOUNT',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          accountBreakdown.when(
            loading: () => const SizedBox(height: 48),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
            data: (items) => Column(
              children: [
                for (final b in items)
                  ListTile(
                    leading: const Icon(Icons.account_balance_outlined),
                    title: Text(b.label),
                    trailing: Text(
                      Money.format(
                        b.amountCents,
                        symbol: prefs.currencySymbol,
                        minorDigits: prefs.currencyMinorDigits,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Text(
              'TRANSACTIONS',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          rows.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
            data: (items) {
              if (items.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('No transactions tagged yet.'),
                );
              }
              return Column(
                children: [
                  for (final item in items)
                    ListTile(
                      title: Text(item.payeeName ?? item.categoryName ?? '-'),
                      subtitle: Text(item.dateLabel),
                      trailing: Text(
                        Money.format(
                          item.amountCents,
                          symbol: prefs.currencySymbol,
                          minorDigits: prefs.currencyMinorDigits,
                        ),
                      ),
                      onTap: () => context.push('/transactions/${item.id}'),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: cs.onSurfaceVariant,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.points});

  final List<TagTimelinePoint> points;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    if (points.isEmpty) return const Text('No spending trend yet.');
    final maxV = points
        .map((p) => p.amountCents)
        .reduce((a, b) => a > b ? a : b)
        .clamp(1, double.infinity)
        .toInt();
    return SizedBox(
      height: 84,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final point in points.take(12))
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: FractionallySizedBox(
                          heightFactor: (point.amountCents / maxV).clamp(
                            0.08,
                            1.0,
                          ),
                          widthFactor: 1,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: cs.primary,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      point.month.substring(5),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

final _tagCategoryBreakdownProvider =
    FutureProvider.family<List<TagBreakdown>, String>((ref, id) {
      ref.watch(recentTransactionsProvider);
      ref.watch(tagAnalyticsProvider);
      return ref.watch(tagRepoProvider).categoryBreakdown(id);
    });

final _tagAccountBreakdownProvider =
    FutureProvider.family<List<TagBreakdown>, String>((ref, id) {
      ref.watch(recentTransactionsProvider);
      ref.watch(tagAnalyticsProvider);
      return ref.watch(tagRepoProvider).accountBreakdown(id);
    });

final _tagTimelineProvider =
    FutureProvider.family<List<TagTimelinePoint>, String>((ref, id) {
      ref.watch(recentTransactionsProvider);
      ref.watch(tagAnalyticsProvider);
      return ref.watch(tagRepoProvider).monthlyTimeline(id);
    });
