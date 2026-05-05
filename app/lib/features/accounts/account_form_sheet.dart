import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import 'data/account_repository.dart';

/// Create-or-edit form. Pass an [accountId] to edit, omit to create.
class AccountFormSheet extends ConsumerStatefulWidget {
  const AccountFormSheet({this.accountId, super.key});

  final String? accountId;

  @override
  ConsumerState<AccountFormSheet> createState() => _AccountFormSheetState();
}

class _AccountFormSheetState extends ConsumerState<AccountFormSheet> {
  final _name = TextEditingController();
  final _balance = TextEditingController();
  AccountKind _kind = AccountKind.savings;
  bool _onBudget = true;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    if (widget.accountId != null) {
      _hydrate();
    } else {
      _loaded = true;
    }
  }

  Future<void> _hydrate() async {
    final a = await ref.read(accountRepoProvider).byId(widget.accountId!);
    if (a == null || !mounted) return;
    setState(() {
      _name.text = a.name;
      _kind = AccountKind.fromId(a.kind);
      _onBudget = a.onBudget;
      _balance.text = Money.formatDigitsOnly(
        a.openingBalanceCents,
        minorDigits: ref.read(prefsProvider).currencyMinorDigits,
      );
      _loaded = true;
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _balance.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: !_loaded
            ? const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    widget.accountId == null ? 'New account' : 'Edit account',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _name,
                    autofocus: widget.accountId == null,
                    decoration: const InputDecoration(labelText: 'Name'),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<AccountKind>(
                    initialValue: _kind,
                    decoration: const InputDecoration(labelText: 'Type'),
                    items: [
                      for (final k in AccountKind.values)
                        DropdownMenuItem(value: k, child: Text(k.label)),
                    ],
                    onChanged: (v) {
                      if (v == null) return;
                      setState(() {
                        _kind = v;
                        _onBudget = !v.defaultsOffBudget;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _balance,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: widget.accountId == null
                          ? 'Opening balance'
                          : 'Opening balance (set when you created it)',
                      prefixText: '${prefs.currencySymbol} ',
                      hintText: '0',
                    ),
                  ),
                  SwitchListTile(
                    value: _onBudget,
                    title: const Text('On-budget'),
                    subtitle: const Text(
                      'Off-budget accounts (investments, loans) are tracked but not budgeted.',
                    ),
                    onChanged: (v) => setState(() => _onBudget = v),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (widget.accountId != null) ...[
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: _confirmDelete,
                            label: const Text('Delete'),
                          ),
                        ),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: FilledButton(
                          onPressed: _save,
                          child: const Text('Save'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final cents = Money.parseToMinor(
      _balance.text,
      minorDigits: ref.read(prefsProvider).currencyMinorDigits,
    );
    final repo = ref.read(accountRepoProvider);
    if (widget.accountId == null) {
      await repo.create(
        name: name,
        kind: _kind,
        openingBalanceCents: cents,
        onBudget: _onBudget,
      );
    } else {
      await repo.update(
        widget.accountId!,
        name: name,
        kind: _kind,
        openingBalanceCents: cents,
        onBudget: _onBudget,
      );
    }
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }

  Future<void> _confirmDelete() async {
    final id = widget.accountId;
    if (id == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete account?'),
        content: const Text(
          'All transactions on this account will also be deleted. '
          'Use Archive instead if you want to preserve history.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          OutlinedButton(
            onPressed: () => Navigator.of(context).pop(null),
            child: const Text('Archive'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    final repo = ref.read(accountRepoProvider);
    if (ok == true) {
      await repo.delete(id);
    } else if (ok == null) {
      await repo.archive(id);
    } else {
      return;
    }
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }
}
