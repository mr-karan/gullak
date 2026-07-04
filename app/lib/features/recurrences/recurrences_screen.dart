import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../core/snackbars.dart';
import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/error_state.dart';
import '../../ui/widgets/money_text.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../../ui/app_sheet.dart';
import 'data/recurrence_repository.dart';

class RecurrencesScreen extends ConsumerWidget {
  const RecurrencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rowsAsync = ref.watch(recurrencesListProvider);
    final accounts =
        ref.watch(accountsListProvider).value ?? const <AccountRow>[];
    final categories =
        ref.watch(categoriesListProvider).value ?? const <CategoryRow>[];
    final prefs = ref.watch(prefsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recurring'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New recurring transaction',
            onPressed: () => _newRecurrence(context, ref),
          ),
        ],
      ),
      body: rowsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(recurrencesListProvider),
        ),
        data: (rows) {
          if (rows.isEmpty) {
            return EmptyState(
              icon: Icons.event_repeat_outlined,
              title: 'No recurring transactions',
              body: 'Add bills, salaries, or subscriptions that repeat.',
              action: FilledButton.icon(
                onPressed: () => _newRecurrence(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('New recurring'),
              ),
            );
          }
          return ListView.builder(
            itemCount: rows.length,
            itemBuilder: (_, i) {
              final r = rows[i];
              final account = _nameById(accounts, r.accountId);
              final category = _nameById(categories, r.categoryId);
              return ListTile(
                leading: const Icon(Icons.event_repeat_outlined),
                title: Text(r.payeeName ?? category ?? 'Recurring transaction'),
                subtitle: Text(
                  [
                    account,
                    category,
                    r.cadence,
                    'next ${r.nextDate}',
                  ].whereType<String>().join(' · '),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    MoneyText(
                      amountCents: r.amountCents,
                      symbol: prefs.currencySymbol,
                      minorDigits: prefs.currencyMinorDigits,
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () =>
                          ref.read(recurrenceRepoProvider).delete(r.id),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }

  String? _nameById(List<dynamic> rows, String? id) {
    if (id == null) return null;
    for (final row in rows) {
      if (row.id == id) return row.name as String;
    }
    return null;
  }

  Future<void> _newRecurrence(BuildContext context, WidgetRef ref) async {
    final accounts = await ref.read(accountRepoProvider).list();
    final categories = await ref.read(categoryRepoProvider).list();
    if (!context.mounted) return;
    if (accounts.isEmpty) {
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        const SnackBar(content: Text('Add an account first.')),
      );
      return;
    }
    await showAppSheet<void>(
      context,
      builder: (_) =>
          _RecurrenceForm(accounts: accounts, categories: categories),
    );
  }
}

class _RecurrenceForm extends ConsumerStatefulWidget {
  const _RecurrenceForm({required this.accounts, required this.categories});

  final List<AccountRow> accounts;
  final List<CategoryRow> categories;

  @override
  ConsumerState<_RecurrenceForm> createState() => _RecurrenceFormState();
}

class _RecurrenceFormState extends ConsumerState<_RecurrenceForm> {
  final _payee = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  late String _accountId = widget.accounts.first.id;
  String? _categoryId;
  String _cadence = 'monthly';
  DateTime _nextDate = DateTime.now();
  bool _isIncome = false;

  @override
  void dispose() {
    _payee.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'New recurring',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _payee,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Payee'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: 'Amount',
                prefixText: '${prefs.currencySymbol} ',
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _accountId,
              decoration: const InputDecoration(labelText: 'Account'),
              items: [
                for (final a in widget.accounts)
                  DropdownMenuItem(value: a.id, child: Text(a.name)),
              ],
              onChanged: (v) => setState(() => _accountId = v ?? _accountId),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _categoryId,
              decoration: const InputDecoration(labelText: 'Category'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Uncategorised'),
                ),
                for (final c in widget.categories)
                  DropdownMenuItem(value: c.id, child: Text(c.name)),
              ],
              onChanged: (v) => setState(() => _categoryId = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _cadence,
              decoration: const InputDecoration(labelText: 'Cadence'),
              items: const [
                DropdownMenuItem(value: 'daily', child: Text('Daily')),
                DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                DropdownMenuItem(value: 'yearly', child: Text('Yearly')),
              ],
              onChanged: (v) => setState(() => _cadence = v ?? _cadence),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              value: _isIncome,
              title: const Text('Income'),
              onChanged: (v) => setState(() => _isIncome = v),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Next date'),
              subtitle: Text(_ymd(_nextDate)),
              trailing: const Icon(Icons.event_outlined),
              onTap: _pickDate,
            ),
            TextField(
              controller: _notes,
              decoration: const InputDecoration(labelText: 'Notes'),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _save, child: const Text('Save')),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
      initialDate: _nextDate,
    );
    if (picked != null) setState(() => _nextDate = picked);
  }

  Future<void> _save() async {
    final amount = Money.parseToMinor(
      _amount.text,
      minorDigits: ref.read(prefsProvider).currencyMinorDigits,
    );
    if (amount == 0) return;
    await ref
        .read(recurrenceRepoProvider)
        .create(
          accountId: _accountId,
          categoryId: _categoryId,
          payeeName: _payee.text.trim().isEmpty ? null : _payee.text.trim(),
          amountCents: _isIncome ? amount.abs() : -amount.abs(),
          notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          cadence: _cadence,
          nextDate: _nextDate,
        );
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }

  String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}
