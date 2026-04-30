import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/clock.dart';
import '../../core/money.dart';
import '../../state/providers.dart';
import '../../ui/theme.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../payees/data/payee_repository.dart';
import '../transactions/data/transaction_repository.dart';
import 'ai_extractor.dart';
import 'entry_memory.dart';

class QuickEntrySheet extends ConsumerStatefulWidget {
  const QuickEntrySheet({super.key});

  @override
  ConsumerState<QuickEntrySheet> createState() => _QuickEntrySheetState();
}

class _QuickEntrySheetState extends ConsumerState<QuickEntrySheet>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    final prefs = ref.read(prefsProvider);
    final initial = prefs.aiEnabled && prefs.quickEntryTab == 'type' ? 0 : 1;
    _tabs = TabController(length: 2, vsync: this, initialIndex: initial);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
              child: Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    child: const Text('Cancel'),
                  ),
                  const Spacer(),
                  Text(
                    'New expense',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const Spacer(),
                  const SizedBox(width: 64),
                ],
              ),
            ),
            TabBar(
              controller: _tabs,
              indicatorSize: TabBarIndicatorSize.label,
              labelColor: cs.primary,
              indicatorColor: cs.primary,
              tabs: const [
                Tab(text: 'Type'),
                Tab(text: 'Form'),
              ],
              onTap: (i) {
                ref.read(prefsProvider).setQuickEntryTab(i == 0 ? 'type' : 'form');
              },
            ),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.85,
              ),
              child: SizedBox(
                height: 540,
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    _TypeTab(onTweakInForm: () => _tabs.animateTo(1)),
                    const _FormTab(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TypeTab extends ConsumerStatefulWidget {
  const _TypeTab({required this.onTweakInForm});

  final VoidCallback onTweakInForm;

  @override
  ConsumerState<_TypeTab> createState() => _TypeTabState();
}

class _TypeTabState extends ConsumerState<_TypeTab> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  // Monotonic seq id; older parses ignore their own results when superseded.
  int _parseSeq = 0;
  AsyncValue<ParsedExpense?> _parse = const AsyncValue<ParsedExpense?>.data(null);

  @override
  void dispose() {
    _ctrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 3) {
      setState(() => _parse = const AsyncValue<ParsedExpense?>.data(null));
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _runParse(v));
  }

  Future<void> _runParse(String v) async {
    final seq = ++_parseSeq;
    setState(() => _parse = const AsyncValue<ParsedExpense?>.loading());
    try {
      final extractor = await ref.read(aiExtractorProvider.future);
      if (!mounted || seq != _parseSeq) return;
      if (extractor == null) {
        setState(() => _parse = AsyncValue<ParsedExpense?>.error(
            StateError('AI is off — switch to Form'), StackTrace.current));
        return;
      }
      final parsed = await extractor.parse(v);
      if (!mounted || seq != _parseSeq || v != _ctrl.text) return;
      setState(() => _parse = AsyncValue<ParsedExpense?>.data(parsed));
    } catch (e, st) {
      if (!mounted || seq != _parseSeq) return;
      setState(() => _parse = AsyncValue<ParsedExpense?>.error(e, st));
    }
  }

  Future<void> _save() async {
    final value = _parse.value;
    if (value == null) return;
    if (value.amountCents == 0) return;
    final accounts = await ref.read(accountsListProvider.future);
    if (accounts.isEmpty) return;
    final acctId = value.accountId ?? ref.read(prefsProvider).defaultAccountId ?? accounts.first.id;
    await ref.read(transactionRepoProvider).create(
          accountId: acctId,
          categoryId: value.categoryId,
          payeeId: value.payeeId,
          payeeName: value.payeeName,
          amountCents: value.isIncome ? value.amountCents.abs() : -value.amountCents.abs(),
          date: value.date,
          notes: value.notes,
          origin: 'ai',
          originRef: _ctrl.text,
        );
    if (!mounted) return;
    Navigator.of(context).maybePop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Saved')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        children: [
          TextField(
            controller: _ctrl,
            autofocus: true,
            textInputAction: TextInputAction.done,
            onChanged: _onChanged,
            onSubmitted: (_) => _save(),
            decoration: const InputDecoration(
              hintText: 'e.g. blinkit 450 hdfc',
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: SingleChildScrollView(
              child: _parse.when(
                data: (p) => p == null
                    ? Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          'Type a few words and we’ll parse them.',
                          style: TextStyle(color: cs.onSurfaceVariant),
                        ),
                      )
                    : _Preview(parsed: p),
                loading: () => const Padding(
                  padding: EdgeInsets.all(12),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 12),
                      Text('Parsing…'),
                    ],
                  ),
                ),
                error: (e, _) => Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(
                    e.toString(),
                    style: TextStyle(color: cs.error),
                  ),
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: widget.onTweakInForm,
                  child: const Text('Tweak in form'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _parse.value == null ? null : _save,
                  child: const Text('Save'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.parsed});
  final ParsedExpense parsed;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    Widget chip(String label, IconData icon, {Color? color}) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          margin: const EdgeInsets.only(bottom: 8, right: 8),
          decoration: BoxDecoration(
            color: cs.surfaceContainer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: color ?? cs.onSurfaceVariant),
              const SizedBox(width: 6),
              Text(label),
            ],
          ),
        );
    return Wrap(
      children: [
        chip(
          Money.format(
            parsed.isIncome ? parsed.amountCents.abs() : -parsed.amountCents.abs(),
            symbol: '₹',
          ),
          Icons.attach_money,
          color: cs.primary,
        ),
        if (parsed.payeeName != null) chip(parsed.payeeName!, Icons.store_outlined),
        if (parsed.accountHint != null) chip(parsed.accountHint!, Icons.account_balance_outlined),
        if (parsed.categoryHint != null) chip(parsed.categoryHint!, Icons.label_outline),
        chip(_dateLabel(parsed.date), Icons.calendar_today_outlined),
        if (parsed.confidence < 0.5)
          chip(
            'Low confidence — review',
            Icons.warning_amber_outlined,
            color: cs.tertiary,
          ),
      ],
    );
  }

  String _dateLabel(DateTime d) {
    final today = clock.today();
    final diff = today.difference(DateTime(d.year, d.month, d.day)).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    return '${d.day}/${d.month}';
  }
}

class _FormTab extends ConsumerStatefulWidget {
  const _FormTab();
  @override
  ConsumerState<_FormTab> createState() => _FormTabState();
}

class _FormTabState extends ConsumerState<_FormTab> {
  /// Amount the user has typed, in **whole currency units** (rupees,
  /// dollars, …). No decimals — typing 4 5 0 means ₹450. Stored as
  /// minor units only at save time.
  int _amountWhole = 0;
  bool _isIncome = false;
  AccountRow? _account;
  CategoryRow? _category;
  PayeeRow? _payee;
  String? _newPayeeName;
  DateTime _date = clock.today();
  final _notesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _hydrateDefaults();
  }

  Future<void> _hydrateDefaults() async {
    final accounts = await ref.read(accountsListProvider.future);
    if (accounts.isEmpty) return;
    final memory = ref.read(entryMemoryProvider);
    final lastId = memory.lastAccountId ?? ref.read(prefsProvider).defaultAccountId;
    final pick = accounts.firstWhere(
      (a) => a.id == lastId,
      orElse: () => accounts.first,
    );
    if (mounted) setState(() => _account = pick);
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  void _onPayeePicked({PayeeRow? payee, String? newName}) {
    setState(() {
      _payee = payee;
      _newPayeeName = newName;
    });
    if (payee == null) return;
    final memory = ref.read(entryMemoryProvider);
    final hintedAccount = memory.accountForPayee(payee.id);
    final hintedCategory = memory.categoryForPayee(payee.id);
    if (hintedAccount != null && (_account == null || _account!.id != hintedAccount)) {
      ref.read(accountsListProvider.future).then((list) {
        if (!mounted) return;
        final a = list.where((x) => x.id == hintedAccount).firstOrNull;
        if (a != null) setState(() => _account = a);
      });
    }
    if (hintedCategory != null && (_category == null || _category!.id != hintedCategory)) {
      ref.read(categoriesListProvider.future).then((list) {
        if (!mounted) return;
        final c = list.where((x) => x.id == hintedCategory).firstOrNull;
        if (c != null) setState(() => _category = c);
      });
    }
  }

  Future<void> _save() async {
    if (_account == null || _amountWhole == 0) return;
    HapticFeedback.lightImpact();
    final minorDigits = ref.read(prefsProvider).currencyMinorDigits;
    final scale = _pow10(minorDigits);
    final cents = _amountWhole * scale;
    final amount = _isIncome ? cents : -cents;

    // Resolve a payee id once: either the existing one, or create from
    // the typed-but-unsaved name.
    String? payeeId = _payee?.id;
    if (payeeId == null && _newPayeeName != null && _newPayeeName!.isNotEmpty) {
      payeeId = await ref.read(payeeRepoProvider).ensure(_newPayeeName!);
    }

    await ref.read(transactionRepoProvider).create(
          accountId: _account!.id,
          categoryId: _category?.id,
          payeeId: payeeId,
          payeeName: _newPayeeName ?? _payee?.name,
          amountCents: amount,
          date: _date,
          notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
          origin: 'manual',
        );

    final memory = ref.read(entryMemoryProvider);
    await memory.rememberAccount(_account!.id);
    if (payeeId != null) {
      await memory.rememberPayeeMapping(
        payeeId: payeeId,
        accountId: _account!.id,
        categoryId: _category?.id,
      );
      await ref.read(payeeRepoProvider).bumpUseCount(payeeId);
    }

    if (!mounted) return;
    Navigator.of(context).maybePop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Saved')),
    );
  }

  static int _pow10(int n) {
    var r = 1;
    for (var i = 0; i < n; i++) {
      r *= 10;
    }
    return r;
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Column(
        children: [
          _AmountDisplay(
            whole: _amountWhole,
            symbol: prefs.currencySymbol,
            isIncome: _isIncome,
            onSignToggle: () => setState(() => _isIncome = !_isIncome),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: [
                _PickerRow(
                  icon: Icons.account_balance_outlined,
                  label: 'Account',
                  value: _account?.name ?? 'Select',
                  onTap: _pickAccount,
                ),
                _PickerRow(
                  icon: Icons.store_outlined,
                  label: 'Payee',
                  value: _newPayeeName ?? _payee?.name ?? 'Optional',
                  onTap: _pickPayee,
                ),
                _PickerRow(
                  icon: Icons.label_outline,
                  label: 'Category',
                  value: _category?.name ?? 'Optional',
                  onTap: _pickCategory,
                ),
                _PickerRow(
                  icon: Icons.calendar_today_outlined,
                  label: 'Date',
                  value: _dateLabel(_date),
                  onTap: _pickDate,
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 8, bottom: 4),
                  child: TextField(
                    controller: _notesCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Notes',
                      hintText: 'optional',
                    ),
                  ),
                ),
              ],
            ),
          ),
          _Keypad(
            onDigit: (d) => setState(() {
              // Cap at 10 digits (max ~₹9.99B) to avoid integer overflow.
              if (_amountWhole > 999999999) return;
              _amountWhole = (_amountWhole * 10) + d;
            }),
            onBack: () => setState(() {
              _amountWhole = _amountWhole ~/ 10;
            }),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _account == null || _amountWhole == 0 ? null : _save,
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAccount() async {
    final accounts = await ref.read(accountsListProvider.future);
    if (!mounted) return;
    final picked = await showModalBottomSheet<AccountRow>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final a in accounts)
              ListTile(
                title: Text(a.name),
                onTap: () => Navigator.of(context).pop(a),
              ),
          ],
        ),
      ),
    );
    if (picked != null) setState(() => _account = picked);
  }

  Future<void> _pickPayee() async {
    final payees = await ref.read(payeesListProvider.future);
    if (!mounted) return;
    final input = TextEditingController();
    final result = await showModalBottomSheet<({PayeeRow? payee, String? newName})>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: StatefulBuilder(
          builder: (ctx, setSt) {
            final q = input.text.trim().toLowerCase();
            final filtered = q.isEmpty
                ? payees
                : payees
                    .where((p) => p.name.toLowerCase().contains(q))
                    .toList(growable: false);
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: input,
                      autofocus: true,
                      onChanged: (_) => setSt(() {}),
                      decoration: const InputDecoration(
                        hintText: 'Search payee or add new',
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 320,
                      child: ListView(
                        children: [
                          for (final p in filtered.take(60))
                            ListTile(
                              title: Text(p.name),
                              onTap: () => Navigator.of(ctx)
                                  .pop((payee: p, newName: null)),
                            ),
                          if (q.isNotEmpty &&
                              !filtered
                                  .any((p) => p.name.toLowerCase() == q))
                            ListTile(
                              leading: const Icon(Icons.add),
                              title: Text('Add "${input.text.trim()}"'),
                              onTap: () => Navigator.of(ctx).pop(
                                  (payee: null, newName: input.text.trim())),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
    if (result != null) {
      _onPayeePicked(payee: result.payee, newName: result.newName);
    }
  }

  Future<void> _pickCategory() async {
    final groups = await ref.read(categoryGroupsListProvider.future);
    final cats = await ref.read(categoriesListProvider.future);
    if (!mounted) return;
    final byGroup = <String, List<CategoryRow>>{};
    for (final c in cats) {
      byGroup.putIfAbsent(c.groupId, () => []).add(c);
    }
    final picked = await showModalBottomSheet<CategoryRow>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.7,
          ),
          child: ListView(
            children: [
              for (final g in groups)
                if (byGroup[g.id] != null && byGroup[g.id]!.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Text(
                      g.name,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
                  for (final c in byGroup[g.id]!)
                    ListTile(
                      title: Text(c.name),
                      onTap: () => Navigator.of(context).pop(c),
                    ),
                ],
            ],
          ),
        ),
      ),
    );
    if (picked != null) setState(() => _category = picked);
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

  String _dateLabel(DateTime d) {
    final today = clock.today();
    final diff = today.difference(DateTime(d.year, d.month, d.day)).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return '$diff days ago';
    return '${d.day.toString().padLeft(2, "0")}/${d.month.toString().padLeft(2, "0")}/${d.year}';
  }
}

class _AmountDisplay extends StatelessWidget {
  const _AmountDisplay({
    required this.whole,
    required this.symbol,
    required this.isIncome,
    required this.onSignToggle,
  });

  final int whole;
  final String symbol;
  final bool isIncome;
  final VoidCallback onSignToggle;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Text(
            symbol,
            style: moneyStyle(context, size: 28, weight: FontWeight.w600).copyWith(
              color: cs.onSurfaceVariant,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              _formatWhole(whole),
              style: moneyStyle(context, size: 40, weight: FontWeight.w700),
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
            ),
          ),
          IconButton(
            icon: Icon(isIncome ? Icons.add : Icons.remove),
            color: isIncome ? cs.tertiary : cs.onSurfaceVariant,
            onPressed: onSignToggle,
            tooltip: isIncome ? 'Income' : 'Spend',
          ),
        ],
      ),
    );
  }

  /// Renders the whole amount with Indian-style grouping (lakhs/crores).
  /// Easier to scan large numbers at a glance.
  String _formatWhole(int n) {
    if (n == 0) return '0';
    final s = n.toString();
    if (s.length <= 3) return s;
    final last3 = s.substring(s.length - 3);
    var rest = s.substring(0, s.length - 3);
    final buf = StringBuffer();
    while (rest.length > 2) {
      buf.write(rest.substring(0, rest.length - 2));
      rest = rest.substring(rest.length - 2);
      if (rest.isNotEmpty) buf.write(',');
    }
    buf.write(rest);
    return '$buf,$last3';
  }
}

class _PickerRow extends StatelessWidget {
  const _PickerRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon),
      title: Text(label),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
      onTap: onTap,
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({
    required this.onDigit,
    required this.onBack,
  });

  final void Function(int digit) onDigit;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    Widget key(String label, VoidCallback action) => Expanded(
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: InkWell(
              onTap: () {
                HapticFeedback.selectionClick();
                action();
              },
              borderRadius: BorderRadius.circular(16),
              child: Container(
                height: 60,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: cs.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  label,
                  style: moneyStyle(context, size: 26, weight: FontWeight.w600),
                ),
              ),
            ),
          ),
        );
    return Column(
      children: [
        Row(children: [key('1', () => onDigit(1)), key('2', () => onDigit(2)), key('3', () => onDigit(3))]),
        Row(children: [key('4', () => onDigit(4)), key('5', () => onDigit(5)), key('6', () => onDigit(6))]),
        Row(children: [key('7', () => onDigit(7)), key('8', () => onDigit(8)), key('9', () => onDigit(9))]),
        Row(children: [
          key('00', () { onDigit(0); onDigit(0); }),
          key('0', () => onDigit(0)),
          key('⌫', onBack),
        ]),
      ],
    );
  }
}
