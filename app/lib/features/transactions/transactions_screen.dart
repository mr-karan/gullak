import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/clock.dart';
import '../../core/money.dart';
import '../../core/snackbars.dart';
import '../../state/providers.dart';
import '../../ui/widgets/category_swatch.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/money_text.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../categories/category_visuals.dart';
import '../entry/quick_entry.dart';
import '../tags/data/tag_repository.dart';
import 'data/transaction_repository.dart';
import 'split_transaction_sheet.dart';

class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  final _searchCtrl = TextEditingController();
  Timer? _searchDebounce;
  String _query = '';
  _ActivityMode _mode = _ActivityMode.daily;
  TransactionFilters _filters = const TransactionFilters();

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 275), () {
      if (!mounted) return;
      setState(() => _query = value.trim());
    });
  }

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<TransactionFilters>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _TransactionFilterSheet(initial: _filters),
    );
    if (result == null || !mounted) return;
    setState(() => _filters = result);
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final range = _mode.range;
    final listAsync = ref.watch(
      transactionsListProvider(
        TransactionListQuery(
          accountId: _filters.accountId,
          categoryId: _filters.categoryId,
          search: _query.isEmpty ? null : _query,
          tagId: _filters.tagId,
          fromDate: range?.$1,
          toDate: range?.$2,
          origin: _filters.origin,
          cleared: _filters.cleared,
          minAmountCents: _filters.minAmountCents,
          maxAmountCents: _filters.maxAmountCents,
          smsText: _filters.smsText,
        ),
      ),
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Activity'),
        actions: [
          IconButton(
            icon: Icon(_filters.isActive ? Icons.tune : Icons.tune_outlined),
            tooltip: 'Filters',
            onPressed: _openFilters,
          ),
          IconButton(
            icon: const Icon(Icons.call_split_outlined),
            tooltip: 'New split',
            onPressed: () => _openSplitSheet(context),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(112),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SegmentedButton<_ActivityMode>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(
                        value: _ActivityMode.daily,
                        icon: Icon(Icons.view_day_outlined),
                        label: Text('Daily'),
                      ),
                      ButtonSegment(
                        value: _ActivityMode.weekly,
                        icon: Icon(Icons.calendar_view_week_outlined),
                        label: Text('Week'),
                      ),
                      ButtonSegment(
                        value: _ActivityMode.calendar,
                        icon: Icon(Icons.calendar_month_outlined),
                        label: Text('Calendar'),
                      ),
                      ButtonSegment(
                        value: _ActivityMode.month,
                        icon: Icon(Icons.list_alt_outlined),
                        label: Text('Month'),
                      ),
                      ButtonSegment(
                        value: _ActivityMode.summary,
                        icon: Icon(Icons.summarize_outlined),
                        label: Text('Summary'),
                      ),
                      ButtonSegment(
                        value: _ActivityMode.all,
                        icon: Icon(Icons.all_inbox_outlined),
                        label: Text('All'),
                      ),
                    ],
                    selected: {_mode},
                    onSelectionChanged: (v) => setState(() => _mode = v.single),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: TextField(
                  controller: _searchCtrl,
                  decoration: const InputDecoration(
                    hintText: 'Search payee, note, account…',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: _onSearchChanged,
                ),
              ),
            ],
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
          if (_mode == _ActivityMode.calendar) {
            return _CalendarActivityView(rows: rows, prefs: prefs);
          }
          if (_mode == _ActivityMode.summary) {
            return _SummaryActivityView(rows: rows, prefs: prefs);
          }
          // Group by date string (YYYY-MM-DD).
          final groups = <String, List<TransactionListItem>>{};
          for (final r in rows) {
            groups.putIfAbsent(r.date, () => []).add(r);
          }
          final orderedDates = groups.keys.toList()
            ..sort((a, b) => b.compareTo(a));
          return ListView.builder(
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: orderedDates.length,
            itemBuilder: (_, gi) {
              final date = orderedDates[gi];
              final entries = groups[date]!;
              final daySpend = entries
                  .where((e) => !e.isTransfer)
                  .fold<int>(0, (s, e) => s + e.amountCents);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _DateHeader(
                    date: date,
                    netCents: daySpend,
                    symbol: prefs.currencySymbol,
                    minorDigits: prefs.currencyMinorDigits,
                  ),
                  for (final r in entries) _TxRow(row: r, prefs: prefs),
                ],
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  Future<void> _openSplitSheet(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const SplitTransactionSheet(),
    );
  }
}

class TransactionFilters {
  const TransactionFilters({
    this.accountId,
    this.categoryId,
    this.tagId,
    this.origin,
    this.cleared,
    this.minAmountCents,
    this.maxAmountCents,
    this.smsText,
  });

  final String? accountId;
  final String? categoryId;
  final String? tagId;
  final String? origin;
  final bool? cleared;
  final int? minAmountCents;
  final int? maxAmountCents;
  final String? smsText;

  bool get isActive =>
      accountId != null ||
      categoryId != null ||
      tagId != null ||
      origin != null ||
      cleared != null ||
      minAmountCents != null ||
      maxAmountCents != null ||
      (smsText?.trim().isNotEmpty ?? false);

  TransactionFilters copyWith({
    String? accountId,
    String? categoryId,
    String? tagId,
    String? origin,
    bool? cleared,
    int? minAmountCents,
    int? maxAmountCents,
    String? smsText,
    bool clearAccount = false,
    bool clearCategory = false,
    bool clearTag = false,
    bool clearOrigin = false,
    bool clearCleared = false,
  }) {
    return TransactionFilters(
      accountId: clearAccount ? null : accountId ?? this.accountId,
      categoryId: clearCategory ? null : categoryId ?? this.categoryId,
      tagId: clearTag ? null : tagId ?? this.tagId,
      origin: clearOrigin ? null : origin ?? this.origin,
      cleared: clearCleared ? null : cleared ?? this.cleared,
      minAmountCents: minAmountCents ?? this.minAmountCents,
      maxAmountCents: maxAmountCents ?? this.maxAmountCents,
      smsText: smsText ?? this.smsText,
    );
  }
}

class _TransactionFilterSheet extends ConsumerStatefulWidget {
  const _TransactionFilterSheet({required this.initial});

  final TransactionFilters initial;

  @override
  ConsumerState<_TransactionFilterSheet> createState() =>
      _TransactionFilterSheetState();
}

class _TransactionFilterSheetState
    extends ConsumerState<_TransactionFilterSheet> {
  String? _accountId;
  String? _categoryId;
  String? _tagId;
  String? _origin;
  bool? _cleared;
  final _minAmount = TextEditingController();
  final _maxAmount = TextEditingController();
  final _smsText = TextEditingController();

  @override
  void initState() {
    super.initState();
    _accountId = widget.initial.accountId;
    _categoryId = widget.initial.categoryId;
    _tagId = widget.initial.tagId;
    _origin = widget.initial.origin;
    _cleared = widget.initial.cleared;
    _minAmount.text = _displayAmount(widget.initial.minAmountCents);
    _maxAmount.text = _displayAmount(widget.initial.maxAmountCents);
    _smsText.text = widget.initial.smsText ?? '';
  }

  @override
  void dispose() {
    _minAmount.dispose();
    _maxAmount.dispose();
    _smsText.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accounts =
        ref.watch(accountsListProvider).value ?? const <AccountRow>[];
    final categories =
        ref.watch(categoriesListProvider).value ?? const <CategoryRow>[];
    final tags = ref.watch(tagsListProvider).value ?? const <TagRow>[];
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 8,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filters', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            DropdownButtonFormField<String?>(
              initialValue: _accountId,
              decoration: const InputDecoration(labelText: 'Account'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('All accounts'),
                ),
                for (final account in accounts)
                  DropdownMenuItem<String?>(
                    value: account.id,
                    child: Text(account.name),
                  ),
              ],
              onChanged: (value) => setState(() => _accountId = value),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _categoryId,
              decoration: const InputDecoration(labelText: 'Category'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('All categories'),
                ),
                for (final category in categories)
                  DropdownMenuItem<String?>(
                    value: category.id,
                    child: Text(category.name),
                  ),
              ],
              onChanged: (value) => setState(() => _categoryId = value),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _tagId,
              decoration: const InputDecoration(labelText: 'Tag'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('All tags'),
                ),
                for (final tag in tags)
                  DropdownMenuItem<String?>(
                    value: tag.id,
                    child: Text(tag.name),
                  ),
              ],
              onChanged: (value) => setState(() => _tagId = value),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _origin,
              decoration: const InputDecoration(labelText: 'Origin'),
              items: const [
                DropdownMenuItem<String?>(
                  value: null,
                  child: Text('All origins'),
                ),
                DropdownMenuItem<String?>(
                  value: 'manual',
                  child: Text('Manual'),
                ),
                DropdownMenuItem<String?>(value: 'ai', child: Text('AI')),
                DropdownMenuItem<String?>(value: 'sms', child: Text('SMS')),
                DropdownMenuItem<String?>(
                  value: 'transfer',
                  child: Text('Transfer'),
                ),
                DropdownMenuItem<String?>(value: 'split', child: Text('Split')),
              ],
              onChanged: (value) => setState(() => _origin = value),
            ),
            const SizedBox(height: 12),
            SegmentedButton<bool?>(
              segments: const [
                ButtonSegment(value: null, label: Text('All')),
                ButtonSegment(value: true, label: Text('Cleared')),
                ButtonSegment(value: false, label: Text('Open')),
              ],
              selected: {_cleared},
              onSelectionChanged: (value) =>
                  setState(() => _cleared = value.single),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _minAmount,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Min amount',
                      prefixIcon: Icon(Icons.currency_rupee),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _maxAmount,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Max amount',
                      prefixIcon: Icon(Icons.currency_rupee),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _smsText,
              decoration: const InputDecoration(
                labelText: 'SMS text',
                prefixIcon: Icon(Icons.sms_outlined),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                TextButton(
                  onPressed: () =>
                      Navigator.of(context).pop(const TransactionFilters()),
                  child: const Text('Clear'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(
                    TransactionFilters(
                      accountId: _accountId,
                      categoryId: _categoryId,
                      tagId: _tagId,
                      origin: _origin,
                      cleared: _cleared,
                      minAmountCents: _parseAmount(_minAmount.text),
                      maxAmountCents: _parseAmount(_maxAmount.text),
                      smsText: _smsText.text.trim().isEmpty
                          ? null
                          : _smsText.text.trim(),
                    ),
                  ),
                  child: const Text('Apply'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static int? _parseAmount(String value) {
    final cleaned = value.trim().replaceAll(',', '');
    if (cleaned.isEmpty) return null;
    final whole = int.tryParse(cleaned);
    return whole == null ? null : whole.abs() * 100;
  }

  static String _displayAmount(int? cents) {
    if (cents == null) return '';
    return (cents.abs() ~/ 100).toString();
  }
}

enum _ActivityMode {
  daily,
  weekly,
  calendar,
  month,
  summary,
  all;

  (String, String)? get range {
    final now = clock.now();
    String ymd(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
    return switch (this) {
      _ActivityMode.daily => (ymd(now), ymd(now)),
      _ActivityMode.weekly => (
        ymd(clock.today().subtract(Duration(days: clock.today().weekday - 1))),
        ymd(
          clock.today().add(
            Duration(days: DateTime.daysPerWeek - clock.today().weekday),
          ),
        ),
      ),
      _ActivityMode.calendar || _ActivityMode.summary => (
        ymd(DateTime(now.year, now.month, 1)),
        ymd(DateTime(now.year, now.month + 1, 0)),
      ),
      _ActivityMode.month => (
        ymd(DateTime(now.year, now.month, 1)),
        ymd(DateTime(now.year, now.month + 1, 0)),
      ),
      _ActivityMode.all => null,
    };
  }
}

class _DateHeader extends StatelessWidget {
  const _DateHeader({
    required this.date,
    required this.netCents,
    required this.symbol,
    required this.minorDigits,
  });

  final String date;
  final int netCents;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final d = DateTime.parse(date);
    final today = clock.today();
    final diff = today.difference(DateTime(d.year, d.month, d.day)).inDays;
    final label = diff == 0
        ? 'Today'
        : diff == 1
        ? 'Yesterday'
        : DateFormat('EEE, d MMM').format(d);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: cs.onSurfaceVariant,
                letterSpacing: 1.2,
              ),
            ),
          ),
          Text(
            Money.format(netCents, symbol: symbol, minorDigits: minorDigits),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: cs.onSurfaceVariant,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _CalendarActivityView extends StatelessWidget {
  const _CalendarActivityView({required this.rows, required this.prefs});

  final List<TransactionListItem> rows;
  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    final byDay = <String, int>{};
    for (final row in rows.where((r) => !r.isTransfer)) {
      byDay.update(
        row.date,
        (v) => v + row.amountCents,
        ifAbsent: () => row.amountCents,
      );
    }
    final month = rows.isEmpty
        ? clock.today()
        : DateTime.parse(
            rows
                .map((r) => r.date)
                .reduce((a, b) => a.compareTo(b) < 0 ? a : b),
          );
    final first = DateTime(month.year, month.month, 1);
    final days = DateTime(month.year, month.month + 1, 0).day;
    final leading = first.weekday % DateTime.daysPerWeek;
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 7,
        childAspectRatio: 0.82,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
      ),
      itemCount: leading + days,
      itemBuilder: (context, i) {
        if (i < leading) return const SizedBox.shrink();
        final day = i - leading + 1;
        final date =
            '${month.year.toString().padLeft(4, '0')}-'
            '${month.month.toString().padLeft(2, '0')}-'
            '${day.toString().padLeft(2, '0')}';
        final cents = byDay[date] ?? 0;
        return _CalendarDayCell(
          day: day,
          amountCents: cents,
          symbol: prefs.currencySymbol,
          minorDigits: prefs.currencyMinorDigits,
        );
      },
    );
  }
}

class _CalendarDayCell extends StatelessWidget {
  const _CalendarDayCell({
    required this.day,
    required this.amountCents,
    required this.symbol,
    required this.minorDigits,
  });

  final int day;
  final int amountCents;
  final String symbol;
  final int minorDigits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final hasSpend = amountCents != 0;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: hasSpend ? cs.secondaryContainer : cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$day', style: Theme.of(context).textTheme.labelMedium),
            const Spacer(),
            if (hasSpend)
              Text(
                Money.format(
                  amountCents,
                  symbol: symbol,
                  minorDigits: minorDigits,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: cs.onSecondaryContainer,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SummaryActivityView extends StatelessWidget {
  const _SummaryActivityView({required this.rows, required this.prefs});

  final List<TransactionListItem> rows;
  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    final expense = rows
        .where((r) => !r.isTransfer && r.amountCents < 0)
        .fold<int>(0, (s, r) => s + r.amountCents.abs());
    final income = rows
        .where((r) => !r.isTransfer && r.amountCents > 0)
        .fold<int>(0, (s, r) => s + r.amountCents);
    final byCategory = <String, int>{};
    final byAccount = <String, int>{};
    for (final row in rows.where((r) => !r.isTransfer && r.amountCents < 0)) {
      byCategory.update(
        row.categoryName ?? 'Uncategorised',
        (v) => v + row.amountCents.abs(),
        ifAbsent: () => row.amountCents.abs(),
      );
      byAccount.update(
        row.accountName ?? 'Unknown account',
        (v) => v + row.amountCents.abs(),
        ifAbsent: () => row.amountCents.abs(),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Row(
          children: [
            Expanded(
              child: _MetricTile(
                label: 'Income',
                amountCents: income,
                prefs: prefs,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _MetricTile(
                label: 'Spend',
                amountCents: expense,
                prefs: prefs,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _MetricTile(
                label: 'Net',
                amountCents: income - expense,
                prefs: prefs,
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        _BreakdownSection(
          title: 'Categories',
          values: byCategory,
          prefs: prefs,
        ),
        const SizedBox(height: 18),
        _BreakdownSection(title: 'Accounts', values: byAccount, prefs: prefs),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.amountCents,
    required this.prefs,
  });

  final String label;
  final int amountCents;
  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 6),
            Text(
              Money.format(
                amountCents,
                symbol: prefs.currencySymbol,
                minorDigits: prefs.currencyMinorDigits,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BreakdownSection extends StatelessWidget {
  const _BreakdownSection({
    required this.title,
    required this.values,
    required this.prefs,
  });

  final String title;
  final Map<String, int> values;
  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    final entries = values.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final total = entries.fold<int>(0, (s, e) => s + e.value);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        for (final entry in entries.take(8))
          _BreakdownRow(
            label: entry.key,
            amountCents: entry.value,
            totalCents: total,
            prefs: prefs,
          ),
      ],
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({
    required this.label,
    required this.amountCents,
    required this.totalCents,
    required this.prefs,
  });

  final String label;
  final int amountCents;
  final int totalCents;
  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final ratio = totalCents == 0 ? 0.0 : amountCents / totalCents;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                Money.format(
                  amountCents,
                  symbol: prefs.currencySymbol,
                  minorDigits: prefs.currencyMinorDigits,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          LinearProgressIndicator(
            value: ratio.clamp(0, 1),
            backgroundColor: cs.surfaceContainerHighest,
          ),
        ],
      ),
    );
  }
}

Future<void> _deleteWithUndo(
  BuildContext context,
  WidgetRef ref,
  String id,
) async {
  final repo = ref.read(transactionRepoProvider);
  final snap = await repo.delete(id);
  if (snap.isEmpty || !context.mounted) return;
  final messenger = ScaffoldMessenger.of(context);
  showTimedSnackBar(
    messenger,
    SnackBar(
      content: const Text('Transaction deleted'),
      action: SnackBarAction(
        label: 'Undo',
        onPressed: () => repo.restore(snap),
      ),
    ),
    duration: const Duration(seconds: 4),
  );
}

class _TxRow extends ConsumerWidget {
  const _TxRow({required this.row, required this.prefs});

  final TransactionListItem row;
  final dynamic prefs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final swatchLabel =
        row.categoryName ?? (row.isTransfer ? 'Transfer' : 'Other');
    final amountColor = row.isTransfer
        ? cs.onSurfaceVariant
        : row.amountCents < 0
        ? cs.onSurface
        : cs.tertiary;
    return Slidable(
      key: ValueKey(row.id),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: 0.55,
        children: [
          SlidableAction(
            onPressed: (ctx) =>
                openQuickEntry(ctx, editingTransactionId: row.id),
            backgroundColor: cs.surfaceContainerHigh,
            foregroundColor: cs.onSurface,
            icon: Icons.edit_outlined,
            label: 'Edit',
          ),
          SlidableAction(
            onPressed: (ctx) => _deleteWithUndo(ctx, ref, row.id),
            backgroundColor: cs.errorContainer,
            foregroundColor: cs.onErrorContainer,
            icon: Icons.delete_outline,
            label: 'Delete',
          ),
        ],
      ),
      child: InkWell(
        onTap: () => context.go('/transactions/${row.id}'),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            children: [
              CategorySwatch(
                label: swatchLabel,
                symbol: row.categoryName == null || row.isTransfer
                    ? null
                    : categoryEmoji(row.categoryIcon, row.categoryName!),
                icon: row.isTransfer
                    ? Icons.swap_horiz
                    : row.isSplit
                    ? Icons.call_split
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.isTransfer
                          ? '${row.accountName ?? '—'} → ${row.transferAccountName ?? '—'}'
                          : (row.payeeName ?? row.categoryName ?? '—'),
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        row.categoryName ??
                            (row.isTransfer ? 'Transfer' : 'Uncategorised'),
                        row.accountName ?? '',
                      ].where((e) => e.isNotEmpty).join(' · '),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              MoneyText(
                amountCents: row.amountCents,
                minorDigits: prefs.currencyMinorDigits,
                symbol: prefs.currencySymbol,
                color: amountColor,
                showSign: !row.isTransfer && row.amountCents > 0,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
