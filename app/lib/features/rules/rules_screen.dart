import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ui/widgets/error_state.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../tags/data/tag_repository.dart';
import 'data/rule_repository.dart';

class RulesScreen extends ConsumerWidget {
  const RulesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(rulesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Rules')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          useSafeArea: true,
          showDragHandle: true,
          builder: (_) => const _RuleSheet(),
        ),
        icon: const Icon(Icons.add),
        label: const Text('Rule'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(rulesProvider),
        ),
        data: (rules) {
          if (rules.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No rules yet. Add rules for merchants, SMS senders, or account hints.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            itemCount: rules.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _RuleCard(rule: rules[i]),
          );
        },
      ),
    );
  }
}

class _RuleCard extends ConsumerWidget {
  const _RuleCard({required this.rule});

  final RuleRow rule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      child: ListTile(
        leading: Icon(
          rule.enabled ? Icons.rule_outlined : Icons.pause_circle_outline,
          color: rule.enabled ? cs.primary : cs.onSurfaceVariant,
        ),
        title: Text(rule.name),
        subtitle: Text('${_label(rule.triggerType)} · ${_triggerValue(rule)}'),
        trailing: IconButton(
          tooltip: 'Delete',
          icon: const Icon(Icons.delete_outline),
          onPressed: () => ref.read(ruleRepoProvider).delete(rule.id),
        ),
      ),
    );
  }

  static String _label(String triggerType) => switch (triggerType) {
    'sms_sender' => 'Sender',
    'sms_body' => 'SMS body',
    'payee' => 'Payee',
    'account_hint' => 'Account hint',
    'amount' => 'Amount',
    'merchant' => 'Merchant',
    _ => triggerType,
  };

  static String _triggerValue(RuleRow rule) {
    try {
      final j = jsonDecode(rule.triggerPayload) as Map<String, dynamic>;
      return j['value'] as String? ?? '';
    } catch (_) {
      return '';
    }
  }
}

class _RuleSheet extends ConsumerStatefulWidget {
  const _RuleSheet();

  @override
  ConsumerState<_RuleSheet> createState() => _RuleSheetState();
}

class _RuleSheetState extends ConsumerState<_RuleSheet> {
  final _name = TextEditingController();
  final _value = TextEditingController();
  final _payee = TextEditingController();
  String _triggerType = 'merchant';
  String? _categoryId;
  String? _accountId;
  String? _tagId;
  bool _autoConfirm = false;
  bool _ignore = false;

  @override
  void dispose() {
    _name.dispose();
    _value.dispose();
    _payee.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoryRepoProvider).list();
    final accounts = ref.watch(accountRepoProvider).list();
    final tags = ref.watch(tagRepoProvider).list();
    return FutureBuilder(
      future: Future.wait([categories, accounts, tags]),
      builder: (context, snapshot) {
        final cats = snapshot.data?[0] as List<CategoryRow>? ?? const [];
        final accts = snapshot.data?[1] as List<AccountRow>? ?? const [];
        final tagRows = snapshot.data?[2] as List<TagRow>? ?? const [];
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
          ),
          child: ListView(
            shrinkWrap: true,
            children: [
              Text('New rule', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _triggerType,
                decoration: const InputDecoration(labelText: 'When'),
                items: const [
                  DropdownMenuItem(
                    value: 'merchant',
                    child: Text('Merchant contains'),
                  ),
                  DropdownMenuItem(
                    value: 'sms_sender',
                    child: Text('SMS sender contains'),
                  ),
                  DropdownMenuItem(
                    value: 'sms_body',
                    child: Text('SMS body contains'),
                  ),
                  DropdownMenuItem(
                    value: 'account_hint',
                    child: Text('Account hint contains'),
                  ),
                ],
                onChanged: (v) =>
                    setState(() => _triggerType = v ?? _triggerType),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _value,
                decoration: const InputDecoration(labelText: 'Match text'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _payee,
                decoration: const InputDecoration(labelText: 'Set payee name'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _categoryId,
                decoration: const InputDecoration(labelText: 'Set category'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('No change')),
                  for (final c in cats)
                    DropdownMenuItem(value: c.id, child: Text(c.name)),
                ],
                onChanged: (v) => setState(() => _categoryId = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _accountId,
                decoration: const InputDecoration(labelText: 'Set account'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('No change')),
                  for (final a in accts)
                    DropdownMenuItem(value: a.id, child: Text(a.name)),
                ],
                onChanged: (v) => setState(() => _accountId = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _tagId,
                decoration: const InputDecoration(labelText: 'Apply tag'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('No tag')),
                  for (final t in tagRows)
                    DropdownMenuItem(value: t.id, child: Text(t.name)),
                ],
                onChanged: (v) => setState(() => _tagId = v),
              ),
              SwitchListTile(
                value: _autoConfirm,
                onChanged: (v) => setState(() => _autoConfirm = v),
                title: const Text('Auto-confirm when matched'),
                contentPadding: EdgeInsets.zero,
              ),
              SwitchListTile(
                value: _ignore,
                onChanged: (v) => setState(() => _ignore = v),
                title: const Text('Ignore when matched'),
                contentPadding: EdgeInsets.zero,
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => _save(context),
                child: const Text('Save rule'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _save(BuildContext context) async {
    final match = _value.text.trim();
    if (match.isEmpty) return;
    final payee = _payee.text.trim();
    await ref
        .read(ruleRepoProvider)
        .upsertRule(
          name: _name.text.trim().isEmpty
              ? 'Rule for $match'
              : _name.text.trim(),
          triggerType: _triggerType,
          triggerPayload: {'match': 'contains', 'value': match},
          actionPayload: {
            if (payee.isNotEmpty) 'payeeName': payee,
            if (_categoryId != null) 'categoryId': _categoryId,
            if (_accountId != null) 'accountId': _accountId,
            if (_tagId != null) 'tags': [_tagId],
            if (_autoConfirm) 'autoConfirm': true,
            if (_ignore) 'ignore': true,
          },
        );
    if (context.mounted) Navigator.of(context).pop();
  }
}
