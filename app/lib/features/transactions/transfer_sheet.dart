import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../core/snackbars.dart';
import '../../state/providers.dart';
import '../accounts/data/account_repository.dart';
import '../../core/dates.dart';
import 'data/transaction_repository.dart';

/// Records a transfer between two of the user's own accounts as a paired
/// debit/credit (via [TransactionRepository.createTransfer]) so account
/// balances stay correct — a credit-card payment or ATM withdrawal shouldn't
/// read as spend. Kept as its own sheet (mirroring the split sheet) rather than
/// a mode inside the large Quick Entry sheet.
class TransferSheet extends ConsumerStatefulWidget {
  const TransferSheet({super.key});

  @override
  ConsumerState<TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends ConsumerState<TransferSheet> {
  final _amount = TextEditingController();
  final _note = TextEditingController();
  String? _fromId;
  String? _toId;
  DateTime _date = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accounts =
        ref.watch(accountsListProvider).value ?? const <AccountRow>[];
    final prefs = ref.watch(prefsProvider);
    _fromId ??= accounts.isEmpty ? null : accounts.first.id;
    // Default the destination to a different account when one exists.
    _toId ??= accounts.length < 2
        ? null
        : accounts
              .firstWhere((a) => a.id != _fromId, orElse: () => accounts[1])
              .id;

    final canSave = accounts.length >= 2;

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
            Text('New transfer', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            if (!canSave)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  'You need at least two accounts to record a transfer.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            TextField(
              controller: _amount,
              autofocus: canSave,
              enabled: canSave,
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
              initialValue: _fromId,
              decoration: const InputDecoration(labelText: 'From'),
              items: [
                for (final a in accounts)
                  DropdownMenuItem(value: a.id, child: Text(a.name)),
              ],
              onChanged: canSave
                  ? (v) => setState(() {
                      _fromId = v;
                      // Avoid a same-account transfer.
                      if (_toId == v) {
                        _toId = null;
                      }
                    })
                  : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _toId,
              decoration: const InputDecoration(labelText: 'To'),
              items: [
                for (final a in accounts.where((a) => a.id != _fromId))
                  DropdownMenuItem(value: a.id, child: Text(a.name)),
              ],
              onChanged: canSave ? (v) => setState(() => _toId = v) : null,
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Date'),
              subtitle: Text(ymd(_date)),
              trailing: const Icon(Icons.event_outlined),
              onTap: canSave ? _pickDate : null,
            ),
            TextField(
              controller: _note,
              enabled: canSave,
              decoration: const InputDecoration(labelText: 'Note (optional)'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: (!canSave || _saving) ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save transfer'),
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
    final fromId = _fromId;
    final toId = _toId;
    final messenger = ScaffoldMessenger.of(context);
    if (fromId == null || toId == null) return;
    if (fromId == toId) {
      showTimedSnackBar(
        messenger,
        const SnackBar(content: Text('Pick two different accounts.')),
      );
      return;
    }
    final minorDigits = ref.read(prefsProvider).currencyMinorDigits;
    final amount = Money.parseToMinor(_amount.text, minorDigits: minorDigits);
    if (amount <= 0) {
      showTimedSnackBar(
        messenger,
        const SnackBar(content: Text('Enter an amount greater than zero.')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(transactionRepoProvider)
          .createTransfer(
            fromAccountId: fromId,
            toAccountId: toId,
            amountCents: amount.abs(),
            date: _date,
            notes: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).maybePop();
      showTimedSnackBar(
        messenger,
        const SnackBar(content: Text('Transfer recorded.')),
      );
    } catch (e) {
      if (!mounted) return;
      showTimedSnackBar(
        messenger,
        SnackBar(content: Text('Could not record transfer: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
