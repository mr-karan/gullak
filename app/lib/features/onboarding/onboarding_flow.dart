import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/money.dart';
import '../../state/providers.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';

/// First-run wizard. Three quick steps:
///   1. Welcome
///   2. Currency
///   3. First account
/// On completion we seed default category groups and mark onboarded.
class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({super.key});

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  final _ctrl = PageController();

  String _symbol = '₹';
  int _minorDigits = 2;

  String _accountName = '';
  AccountKind _kind = AccountKind.checking;
  int _openingBalanceCents = 0;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _next() => _ctrl.nextPage(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );

  Future<void> _finish() async {
    await ref.read(accountRepoProvider).create(
          name: _accountName.trim(),
          kind: _kind,
          openingBalanceCents: _openingBalanceCents,
        );
    await _seedDefaults(ref);
    final db = ref.read(dbProvider);
    await db.kvSet('onboarded', 'true');
    final prefs = ref.read(prefsProvider);
    await prefs.setCurrencySymbol(_symbol);
    await prefs.setCurrencyMinorDigits(_minorDigits);
    ref.invalidate(onboardedProvider);
    if (!mounted) return;
    context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: PageView(
          controller: _ctrl,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _Welcome(onNext: _next),
            _Currency(
              symbol: _symbol,
              minorDigits: _minorDigits,
              onChange: (s, d) => setState(() {
                _symbol = s;
                _minorDigits = d;
              }),
              onNext: _next,
            ),
            _FirstAccount(
              symbol: _symbol,
              minorDigits: _minorDigits,
              onSubmit: ({required name, required kind, required openingCents}) {
                setState(() {
                  _accountName = name;
                  _kind = kind;
                  _openingBalanceCents = openingCents;
                });
                _finish();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Welcome extends StatelessWidget {
  const _Welcome({required this.onNext});
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: cs.primaryContainer,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(Icons.savings_outlined, color: cs.onPrimaryContainer),
          ),
          const SizedBox(height: 24),
          Text('Gullak', style: Theme.of(context).textTheme.displayMedium),
          const SizedBox(height: 12),
          Text(
            'A polished, local-first expense tracker. Lives on your phone, '
            'syncs nowhere.',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: cs.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 32),
          Text(
            'You will set up:\n'
            '  · Your currency.\n'
            '  · Your first account.\n'
            '  · A starter set of categories.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const Spacer(),
          FilledButton(onPressed: onNext, child: const Text('Continue')),
        ],
      ),
    );
  }
}

class _Currency extends StatelessWidget {
  const _Currency({
    required this.symbol,
    required this.minorDigits,
    required this.onChange,
    required this.onNext,
  });

  final String symbol;
  final int minorDigits;
  final void Function(String symbol, int minorDigits) onChange;
  final VoidCallback onNext;

  static const _options = <(String label, String symbol, int digits)>[
    ('Indian Rupee', '₹', 2),
    ('US Dollar', r'$', 2),
    ('Euro', '€', 2),
    ('British Pound', '£', 2),
    ('Japanese Yen', '¥', 0),
    ('Custom', ' ', 2),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Currency', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text(
            'You can change this any time in settings.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 24),
          Expanded(
            child: ListView(
              children: [
                for (final o in _options)
                  _CurrencyTile(
                    label: o.$1,
                    symbol: o.$2,
                    selected: o.$2 == symbol && o.$3 == minorDigits,
                    onTap: () => onChange(o.$2, o.$3),
                  ),
              ],
            ),
          ),
          FilledButton(onPressed: onNext, child: const Text('Continue')),
        ],
      ),
    );
  }
}

class _CurrencyTile extends StatelessWidget {
  const _CurrencyTile({
    required this.label,
    required this.symbol,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String symbol;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? cs.primary : cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          symbol.trim().isEmpty ? '?' : symbol,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: selected ? cs.onPrimary : cs.onSurface,
          ),
        ),
      ),
      title: Text(label),
      trailing: selected ? Icon(Icons.check_circle, color: cs.primary) : null,
    );
  }
}

class _FirstAccount extends StatefulWidget {
  const _FirstAccount({
    required this.symbol,
    required this.minorDigits,
    required this.onSubmit,
  });

  final String symbol;
  final int minorDigits;
  final void Function({
    required String name,
    required AccountKind kind,
    required int openingCents,
  }) onSubmit;

  @override
  State<_FirstAccount> createState() => _FirstAccountState();
}

class _FirstAccountState extends State<_FirstAccount> {
  final _name = TextEditingController(text: 'Main');
  final _balance = TextEditingController();
  AccountKind _kind = AccountKind.checking;

  @override
  void dispose() {
    _name.dispose();
    _balance.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('First account', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text(
            'Add the bank, card or wallet you spend from most.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Account name'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<AccountKind>(
            initialValue: _kind,
            decoration: const InputDecoration(labelText: 'Type'),
            items: [
              for (final k in AccountKind.values)
                DropdownMenuItem(value: k, child: Text(k.label)),
            ],
            onChanged: (v) => setState(() => _kind = v ?? AccountKind.checking),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _balance,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Opening balance',
              prefixText: '${widget.symbol} ',
              hintText: '0',
            ),
          ),
          const Spacer(),
          FilledButton(
            onPressed: () {
              final name = _name.text.trim();
              if (name.isEmpty) return;
              final cents = Money.parseToMinor(
                _balance.text,
                minorDigits: widget.minorDigits,
              );
              widget.onSubmit(
                name: name,
                kind: _kind,
                openingCents: cents,
              );
            },
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }
}

/// Default category groups + categories. Idempotent — only inserts
/// if there are zero categories already.
Future<void> _seedDefaults(WidgetRef ref) async {
  final repo = ref.read(categoryRepoProvider);
  final existing = await repo.list(includeHidden: true);
  if (existing.isNotEmpty) return;

  final now = ref.read(dbProvider);
  final daily = await repo.createGroup(name: 'Daily Living');
  final lifestyle = await repo.createGroup(name: 'Lifestyle');
  final fixed = await repo.createGroup(name: 'Fixed Costs');
  final savings = await repo.createGroup(name: 'Savings & Goals');
  final income = await repo.createGroup(name: 'Income', isIncome: true);

  Future<void> add(String group, String name) async {
    await repo.create(name: name, groupId: group);
  }

  await add(daily, 'Groceries');
  await add(daily, 'Transport');
  await add(daily, 'Phone & Internet');
  await add(daily, 'Health');
  await add(lifestyle, 'Eating Out');
  await add(lifestyle, 'Entertainment');
  await add(lifestyle, 'Shopping');
  await add(lifestyle, 'Travel');
  await add(fixed, 'Rent');
  await add(fixed, 'Utilities');
  await add(fixed, 'Insurance');
  await add(fixed, 'Subscriptions');
  await add(savings, 'Emergency Fund');
  await add(savings, 'Investments');
  await add(income, 'Salary');
  await add(income, 'Other Income');

  // Touch the kv table so the watch streams refresh.
  await now.kvSet('seeded', 'true');
}
