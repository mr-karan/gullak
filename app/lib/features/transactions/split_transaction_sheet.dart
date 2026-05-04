import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import 'data/transaction_repository.dart';

class SplitTransactionSheet extends ConsumerStatefulWidget {
  const SplitTransactionSheet({super.key});

  @override
  ConsumerState<SplitTransactionSheet> createState() =>
      _SplitTransactionSheetState();
}

class _SplitTransactionSheetState extends ConsumerState<SplitTransactionSheet> {
  final _payee = TextEditingController();
  final _note = TextEditingController();
  final _firstAmount = TextEditingController();
  final _secondAmount = TextEditingController();
  final _firstNote = TextEditingController();
  final _secondNote = TextEditingController();
  String? _accountId;
  String? _firstCategoryId;
  String? _secondCategoryId;
  DateTime _date = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    _payee.dispose();
    _note.dispose();
    _firstAmount.dispose();
    _secondAmount.dispose();
    _firstNote.dispose();
    _secondNote.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accounts =
        ref.watch(accountsListProvider).value ?? const <AccountRow>[];
    final categories =
        ref.watch(categoriesListProvider).value ?? const <CategoryRow>[];
    final prefs = ref.watch(prefsProvider);
    _accountId ??= accounts.isEmpty ? null : accounts.first.id;
    _firstCategoryId ??= categories.isEmpty ? null : categories.first.id;
    _secondCategoryId ??= categories.length < 2
        ? _firstCategoryId
        : categories[1].id;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: ListView(
          shrinkWrap: true,
          children: [
            Text('New split', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextField(
              controller: _payee,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Payee'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _accountId,
              decoration: const InputDecoration(labelText: 'Account'),
              items: [
                for (final a in accounts)
                  DropdownMenuItem(value: a.id, child: Text(a.name)),
              ],
              onChanged: (v) => setState(() => _accountId = v),
            ),
            const SizedBox(height: 12),
            _SplitLine(
              title: 'Split 1',
              amount: _firstAmount,
              note: _firstNote,
              categoryId: _firstCategoryId,
              categories: categories,
              symbol: prefs.currencySymbol,
              onCategoryChanged: (v) => setState(() => _firstCategoryId = v),
            ),
            const SizedBox(height: 12),
            _SplitLine(
              title: 'Split 2',
              amount: _secondAmount,
              note: _secondNote,
              categoryId: _secondCategoryId,
              categories: categories,
              symbol: prefs.currencySymbol,
              onCategoryChanged: (v) => setState(() => _secondCategoryId = v),
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Date'),
              subtitle: Text(_ymd(_date)),
              trailing: const Icon(Icons.event_outlined),
              onTap: _pickDate,
            ),
            TextField(
              controller: _note,
              decoration: const InputDecoration(labelText: 'Parent note'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save split'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 7)),
      initialDate: _date,
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _save() async {
    final accountId = _accountId;
    if (accountId == null) return;
    final minorDigits = ref.read(prefsProvider).currencyMinorDigits;
    final first = Money.parseToMinor(
      _firstAmount.text,
      minorDigits: minorDigits,
    );
    final second = Money.parseToMinor(
      _secondAmount.text,
      minorDigits: minorDigits,
    );
    if (first == 0 && second == 0) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(transactionRepoProvider)
          .createSplit(
            accountId: accountId,
            payeeName: _payee.text.trim().isEmpty ? null : _payee.text.trim(),
            date: _date,
            notes: _note.text.trim().isEmpty ? null : _note.text.trim(),
            splits: [
              if (first != 0)
                (
                  amountCents: -first.abs(),
                  categoryId: _firstCategoryId,
                  notes: _firstNote.text.trim().isEmpty
                      ? null
                      : _firstNote.text.trim(),
                ),
              if (second != 0)
                (
                  amountCents: -second.abs(),
                  categoryId: _secondCategoryId,
                  notes: _secondNote.text.trim().isEmpty
                      ? null
                      : _secondNote.text.trim(),
                ),
            ],
          );
      if (!mounted) return;
      Navigator.of(context).maybePop();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

class _SplitLine extends StatelessWidget {
  const _SplitLine({
    required this.title,
    required this.amount,
    required this.note,
    required this.categoryId,
    required this.categories,
    required this.symbol,
    required this.onCategoryChanged,
  });

  final String title;
  final TextEditingController amount;
  final TextEditingController note;
  final String? categoryId;
  final List<CategoryRow> categories;
  final String symbol;
  final ValueChanged<String?> onCategoryChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            TextField(
              controller: amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: 'Amount',
                prefixText: '$symbol ',
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String?>(
              initialValue: categoryId,
              decoration: const InputDecoration(labelText: 'Category'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Uncategorised'),
                ),
                for (final c in categories)
                  DropdownMenuItem(value: c.id, child: Text(c.name)),
              ],
              onChanged: onCategoryChanged,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: note,
              decoration: const InputDecoration(labelText: 'Line note'),
            ),
          ],
        ),
      ),
    );
  }
}
