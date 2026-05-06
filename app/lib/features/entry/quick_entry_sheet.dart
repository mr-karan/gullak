import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/clock.dart';
import '../../core/money.dart';
import '../../core/snackbars.dart';
import '../../state/providers.dart';
import '../../ui/theme.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../categories/category_visuals.dart';
import '../payees/data/payee_repository.dart';
import '../transactions/data/transaction_repository.dart';
import 'ai_extractor.dart';
import 'entry_memory.dart';
import 'share_intake.dart';

class QuickEntrySheet extends ConsumerStatefulWidget {
  const QuickEntrySheet({this.editingTransactionId, super.key});

  /// When non-null, the sheet hydrates from this transaction and Save
  /// updates instead of inserting. Header copy and the trailing icon
  /// flip accordingly.
  final String? editingTransactionId;

  @override
  ConsumerState<QuickEntrySheet> createState() => _QuickEntrySheetState();
}

class _QuickEntrySheetState extends ConsumerState<QuickEntrySheet>
    with SingleTickerProviderStateMixin {
  bool _showType = false;
  TabController? _tabs;

  bool get _isEditing => widget.editingTransactionId != null;

  @override
  void initState() {
    super.initState();
    // Editing always goes straight to Form. Creating shows the
    // natural-language tab only when the homelab pi-server is
    // configured (it does the parsing). The check is async so we
    // start without the tab and add it once we know.
    if (_isEditing) return;
    () async {
      final base = await ref.read(secureStoreProvider).readSyncBaseUrl();
      if (!mounted) return;
      if (base == null || base.trim().isEmpty) return;
      final prefs = ref.read(prefsProvider);
      setState(() {
        _showType = true;
        _tabs = TabController(
          length: 2,
          vsync: this,
          initialIndex: prefs.quickEntryTab == 'type' ? 0 : 1,
        );
      });
    }();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final mq = MediaQuery.of(context);
    final showType = _showType;
    final keyboardOpen = mq.viewInsets.bottom > 0;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
        // SafeArea already accounts for the status bar — don't subtract
        // padding.top again or we lose ~60px and the keypad overflows
        // on smaller screens.
        child: SizedBox(
          height: mq.size.height * 0.92,
          child: Column(
            mainAxisSize: MainAxisSize.max,
            children: [
              _Header(
                title: _isEditing ? 'Edit expense' : 'New expense',
                onCancel: () => Navigator.of(context).maybePop(),
                editingTransactionId: widget.editingTransactionId,
              ),
              if (showType)
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
                    ref
                        .read(prefsProvider)
                        .setQuickEntryTab(i == 0 ? 'type' : 'form');
                  },
                ),
              Expanded(
                child: showType
                    ? TabBarView(
                        controller: _tabs,
                        children: [
                          _TypeTab(onTweakInForm: () => _tabs?.animateTo(1)),
                          _FormTab(
                            editingTransactionId: widget.editingTransactionId,
                            keyboardOpen: keyboardOpen,
                          ),
                        ],
                      )
                    : _FormTab(
                        editingTransactionId: widget.editingTransactionId,
                        keyboardOpen: keyboardOpen,
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _tabs?.dispose();
    super.dispose();
  }
}

class _Header extends ConsumerWidget {
  const _Header({
    required this.title,
    required this.onCancel,
    required this.editingTransactionId,
  });

  final String title;
  final VoidCallback onCancel;
  final String? editingTransactionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEditing = editingTransactionId != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
      child: Row(
        children: [
          TextButton(onPressed: onCancel, child: const Text('Cancel')),
          const Spacer(),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const Spacer(),
          if (isEditing)
            IconButton(
              tooltip: 'Delete',
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                // Snapshot the InheritedWidget lookups *before* popping —
                // after pop our context is deactivated and using it for
                // ScaffoldMessenger.of trips _dependents.isEmpty asserts.
                final messenger = ScaffoldMessenger.of(context);
                final navigator = Navigator.of(context);
                final repo = ref.read(transactionRepoProvider);
                final snap = await repo.delete(editingTransactionId!);
                if (snap.isEmpty) return;
                navigator.maybePop();
                showTimedSnackBar(
                  messenger,
                  SnackBar(
                    content: const Text('Deleted'),
                    action: SnackBarAction(
                      label: 'Undo',
                      onPressed: () => repo.restore(snap),
                    ),
                  ),
                  duration: const Duration(seconds: 4),
                );
              },
            )
          else
            const SizedBox(width: 56),
        ],
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
  AsyncValue<ParsedExpense?> _parse = const AsyncValue<ParsedExpense?>.data(
    null,
  );
  bool _saving = false;
  Uint8List? _imageBytes;

  @override
  void initState() {
    super.initState();
    // If the user got here by sharing an image into Gullak, the bytes
    // are already sitting in the provider — consume them and fire the
    // vision parse without making them tap anything.
    final share = ref.read(pendingShareProvider);
    if (share != null) {
      _imageBytes = share.bytes;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        await _runImageParse(share.bytes, share.mimeType);
        ref.read(pendingShareProvider.notifier).consume();
      });
    }
  }

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
        setState(
          () => _parse = AsyncValue<ParsedExpense?>.error(
            StateError('AI is off — switch to Form'),
            StackTrace.current,
          ),
        );
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

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: source,
        imageQuality: 80,
        maxWidth: 1600,
        maxHeight: 1600,
      );
      if (picked == null || !mounted) return;
      final bytes = await picked.readAsBytes();
      final mime =
          picked.mimeType ??
          (picked.path.toLowerCase().endsWith('.png')
              ? 'image/png'
              : 'image/jpeg');
      setState(() => _imageBytes = bytes);
      await _runImageParse(bytes, mime);
    } catch (e, st) {
      if (!mounted) return;
      setState(() => _parse = AsyncValue<ParsedExpense?>.error(e, st));
    }
  }

  Future<void> _runImageParse(Uint8List bytes, String mime) async {
    final seq = ++_parseSeq;
    setState(() => _parse = const AsyncValue<ParsedExpense?>.loading());
    try {
      final extractor = await ref.read(aiExtractorProvider.future);
      if (!mounted || seq != _parseSeq) return;
      if (extractor == null) {
        setState(
          () => _parse = AsyncValue<ParsedExpense?>.error(
            StateError('AI is off — enable in Settings → AI assist'),
            StackTrace.current,
          ),
        );
        return;
      }
      final hint = _ctrl.text.trim();
      final parsed = await extractor.parseImage(
        bytes,
        mimeType: mime,
        hint: hint.isEmpty ? null : hint,
      );
      if (!mounted || seq != _parseSeq) return;
      setState(() => _parse = AsyncValue<ParsedExpense?>.data(parsed));
    } catch (e, st) {
      if (!mounted || seq != _parseSeq) return;
      setState(() => _parse = AsyncValue<ParsedExpense?>.error(e, st));
    }
  }

  Future<void> _showImageMenu() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Pick from gallery'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
            if (_imageBytes != null)
              ListTile(
                leading: const Icon(Icons.close),
                title: const Text('Remove image'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  setState(() {
                    _imageBytes = null;
                    _parse = const AsyncValue<ParsedExpense?>.data(null);
                  });
                },
              ),
          ],
        ),
      ),
    );
    if (source != null) await _pickImage(source);
  }

  Future<void> _save() async {
    if (_saving) return;
    final value = _parse.value;
    if (value == null) return;
    if (value.amountCents == 0) return;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final accounts = await ref.read(accountsListProvider.future);
      if (accounts.isEmpty) return;
      final acctId =
          value.accountId ??
          ref.read(prefsProvider).defaultAccountId ??
          accounts.first.id;
      await ref
          .read(transactionRepoProvider)
          .create(
            accountId: acctId,
            categoryId: value.categoryId,
            payeeId: value.payeeId,
            payeeName: value.payeeName,
            amountCents: value.isIncome
                ? value.amountCents.abs()
                : -value.amountCents.abs(),
            date: value.date,
            notes: value.notes,
            origin: 'ai',
            originRef: _ctrl.text,
          );
      if (value.payeeId != null) {
        await ref
            .read(entryMemoryProvider)
            .rememberPayeeMapping(
              payeeId: value.payeeId!,
              accountId: acctId,
              categoryId: value.categoryId,
            );
        await ref.read(payeeRepoProvider).bumpUseCount(value.payeeId!);
      }
      navigator.maybePop();
      showTimedSnackBar(messenger, _savedSnackBar('Saved'));
    } catch (_) {
      if (mounted) setState(() => _saving = false);
      rethrow;
    }
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
            decoration: InputDecoration(
              hintText: 'e.g. blinkit 450 hdfc',
              suffixIcon: IconButton(
                icon: Icon(
                  _imageBytes == null
                      ? Icons.photo_camera_outlined
                      : Icons.image,
                  color: _imageBytes == null ? null : cs.primary,
                ),
                tooltip: 'Receipt photo',
                onPressed: _showImageMenu,
              ),
            ),
          ),
          if (_imageBytes != null) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(_imageBytes!, height: 120, fit: BoxFit.cover),
            ),
          ],
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
                  child: Text(e.toString(), style: TextStyle(color: cs.error)),
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
                  onPressed: _saving || _parse.value == null ? null : _save,
                  child: Text(_saving ? 'Saving…' : 'Save'),
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
            parsed.isIncome
                ? parsed.amountCents.abs()
                : -parsed.amountCents.abs(),
            symbol: '₹',
          ),
          Icons.attach_money,
          color: cs.primary,
        ),
        if (parsed.payeeName != null)
          chip(parsed.payeeName!, Icons.store_outlined),
        if (parsed.accountHint != null)
          chip(parsed.accountHint!, Icons.account_balance_outlined),
        if (parsed.categoryHint != null)
          chip(
            '${defaultCategoryEmoji(parsed.categoryHint!)} ${parsed.categoryHint!}',
            Icons.label_outline,
          ),
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

class _QuickEntrySkeleton extends StatelessWidget {
  const _QuickEntrySkeleton();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    Widget bar({required double width, required double height}) => Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 96,
            decoration: BoxDecoration(
              color: cs.surfaceContainer,
              borderRadius: BorderRadius.circular(20),
            ),
            padding: const EdgeInsets.all(20),
            child: Align(
              alignment: Alignment.centerLeft,
              child: bar(width: 160, height: 36),
            ),
          ),
          const SizedBox(height: 20),
          for (final width in [220.0, 180.0, 200.0, 140.0]) ...[
            Row(
              children: [
                bar(width: 22, height: 22),
                const SizedBox(width: 16),
                bar(width: width, height: 20),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }
}

class _FormTab extends ConsumerStatefulWidget {
  const _FormTab({this.editingTransactionId, required this.keyboardOpen});

  final String? editingTransactionId;
  final bool keyboardOpen;

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
  // Notes is hidden behind a + chip until the user wants it. Most
  // entries don't carry a note; keeping the form short saves a row.
  bool _notesExpanded = false;
  bool _saving = false;
  bool _hydrating = false;

  bool get _isEditing => widget.editingTransactionId != null;

  @override
  void initState() {
    super.initState();
    if (_isEditing) {
      _hydrating = true;
      _hydrateFromExisting();
    }
  }

  Future<void> _hydrateFromExisting() async {
    final id = widget.editingTransactionId!;
    final repo = ref.read(transactionRepoProvider);
    final row = await repo.byRow(id);
    if (row == null || !mounted) {
      if (mounted) setState(() => _hydrating = false);
      return;
    }
    final accounts = await ref.read(accountRepoProvider).list();
    if (accounts.isEmpty) {
      if (mounted) setState(() => _hydrating = false);
      return;
    }
    AccountRow? account;
    for (final a in accounts) {
      if (a.id == row.accountId) {
        account = a;
        break;
      }
    }
    account ??= accounts.first;
    CategoryRow? category;
    if (row.categoryId != null) {
      category = await ref.read(categoryRepoProvider).byId(row.categoryId!);
    }
    PayeeRow? payee;
    if (row.payeeId != null) {
      payee = await ref.read(payeeRepoProvider).byId(row.payeeId!);
    }
    if (!mounted) return;
    final minorDigits = ref.read(prefsProvider).currencyMinorDigits;
    final scale = _pow10(minorDigits);
    setState(() {
      _amountWhole = row.amountCents.abs() ~/ scale;
      _isIncome = row.amountCents > 0;
      _account = account;
      _category = category;
      _payee = payee;
      _newPayeeName = payee == null ? row.payeeName : null;
      _date = DateTime.tryParse(row.date) ?? clock.today();
      _notesCtrl.text = row.notes ?? '';
      _notesExpanded = (row.notes ?? '').isNotEmpty;
      _hydrating = false;
    });
  }

  /// Picks an account once we have a non-empty list. Called from build(),
  /// so it survives async timing — the very first frame where accounts
  /// arrive will set the default. Skipped when editing — that path
  /// hydrates the account from the existing transaction.
  void _maybeHydrateAccount(List<AccountRow> accounts) {
    if (_isEditing) return;
    if (_account != null || accounts.isEmpty) return;
    final memory = ref.read(entryMemoryProvider);
    final lastId =
        memory.lastAccountId ?? ref.read(prefsProvider).defaultAccountId;
    final pick = accounts.firstWhere(
      (a) => a.id == lastId,
      orElse: () => accounts.first,
    );
    // Defer to after the current build to avoid setState-during-build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _account = pick);
    });
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
    if (hintedAccount != null &&
        (_account == null || _account!.id != hintedAccount)) {
      ref.read(accountsListProvider.future).then((list) {
        if (!mounted) return;
        final a = list.where((x) => x.id == hintedAccount).firstOrNull;
        if (a != null) setState(() => _account = a);
      });
    }
    if (hintedCategory != null &&
        (_category == null || _category!.id != hintedCategory)) {
      ref.read(categoriesListProvider.future).then((list) {
        if (!mounted) return;
        final c = list.where((x) => x.id == hintedCategory).firstOrNull;
        if (c != null) setState(() => _category = c);
      });
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    if (_account == null || _amountWhole == 0) return;
    setState(() => _saving = true);
    HapticFeedback.lightImpact();
    // Snapshot the navigator + messenger up front. After we pop, our
    // own context is deactivated — looking up an InheritedWidget on a
    // dead context is what trips the _dependents.isEmpty assertion.
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final minorDigits = ref.read(prefsProvider).currencyMinorDigits;
      final scale = _pow10(minorDigits);
      final cents = _amountWhole * scale;
      final amount = _isIncome ? cents : -cents;

      // Resolve a payee id once: either the existing one, or create from
      // the typed-but-unsaved name.
      String? payeeId = _payee?.id;
      if (payeeId == null &&
          _newPayeeName != null &&
          _newPayeeName!.isNotEmpty) {
        payeeId = await ref.read(payeeRepoProvider).ensure(_newPayeeName!);
      }

      final repo = ref.read(transactionRepoProvider);
      if (_isEditing) {
        await repo.update(
          widget.editingTransactionId!,
          accountId: _account!.id,
          categoryId: _category?.id,
          payeeId: payeeId,
          payeeName: _newPayeeName ?? _payee?.name,
          amountCents: amount,
          date: _date,
          notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        );
      } else {
        await repo.create(
          accountId: _account!.id,
          categoryId: _category?.id,
          payeeId: payeeId,
          payeeName: _newPayeeName ?? _payee?.name,
          amountCents: amount,
          date: _date,
          notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
          origin: 'manual',
        );
      }

      final memory = ref.read(entryMemoryProvider);
      await memory.rememberAccount(_account!.id);
      if (payeeId != null) {
        await memory.rememberPayeeMapping(
          payeeId: payeeId,
          accountId: _account!.id,
          categoryId: _category?.id,
        );
        if (!_isEditing) {
          await ref.read(payeeRepoProvider).bumpUseCount(payeeId);
        }
      }

      navigator.maybePop();
      showTimedSnackBar(
        messenger,
        _savedSnackBar(_isEditing ? 'Updated' : 'Saved'),
      );
    } catch (_) {
      if (mounted) setState(() => _saving = false);
      rethrow;
    }
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
    final accounts =
        ref.watch(accountsListProvider).value ?? const <AccountRow>[];
    _maybeHydrateAccount(accounts);
    if (_hydrating) {
      return const _QuickEntrySkeleton();
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final hideKeypad = widget.keyboardOpen || constraints.maxHeight < 420;
          return Column(
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
                      unset: _account == null,
                      onTap: _pickAccount,
                    ),
                    _PickerRow(
                      icon: Icons.store_outlined,
                      label: 'Payee',
                      value: _newPayeeName ?? _payee?.name ?? 'Optional',
                      unset: _payee == null && _newPayeeName == null,
                      onTap: _pickPayee,
                    ),
                    _PickerRow(
                      icon: Icons.label_outline,
                      label: 'Category',
                      value: _category == null
                          ? 'Optional'
                          : '${categoryEmoji(_category!.icon, _category!.name)} ${_category!.name}',
                      unset: _category == null,
                      onTap: _pickCategory,
                    ),
                    _DateRow(
                      date: _date,
                      onPick: _pickDate,
                      onChange: (d) => setState(() => _date = d),
                    ),
                    if (_notesExpanded)
                      Padding(
                        padding: const EdgeInsets.only(top: 8, bottom: 4),
                        child: TextField(
                          controller: _notesCtrl,
                          autofocus: true,
                          decoration: InputDecoration(
                            labelText: 'Note',
                            suffixIcon: IconButton(
                              icon: const Icon(Icons.close),
                              onPressed: () => setState(() {
                                _notesExpanded = false;
                                _notesCtrl.clear();
                              }),
                            ),
                          ),
                        ),
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: TextButton.icon(
                          onPressed: () =>
                              setState(() => _notesExpanded = true),
                          icon: const Icon(Icons.note_add_outlined, size: 18),
                          label: const Text('Add note'),
                          style: TextButton.styleFrom(
                            alignment: Alignment.centerLeft,
                            minimumSize: const Size.fromHeight(48),
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (!hideKeypad) ...[
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
              ],
              FilledButton(
                onPressed: _saving || _account == null || _amountWhole == 0
                    ? null
                    : _save,
                child: Text(_saving ? 'Saving…' : 'Save'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _pickAccount() async {
    HapticFeedback.selectionClick();
    final accounts = await ref.read(accountRepoProvider).list();
    if (!mounted) return;
    final picked = await showModalBottomSheet<AccountRow>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: SizedBox(
          height: MediaQuery.of(ctx).size.height * 0.6,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Account',
                    style: Theme.of(ctx).textTheme.titleLarge,
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: accounts.length,
                  itemBuilder: (_, i) {
                    final a = accounts[i];
                    return ListTile(
                      leading: const Icon(Icons.account_balance_outlined),
                      title: Text(a.name),
                      onTap: () => Navigator.of(ctx).pop(a),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) setState(() => _account = picked);
  }

  Future<void> _pickPayee() async {
    HapticFeedback.selectionClick();
    final payees = await ref.read(payeeRepoProvider).list();
    if (!mounted) return;
    final input = TextEditingController();
    try {
      final result =
          await showModalBottomSheet<({PayeeRow? payee, String? newName})>(
            context: context,
            useRootNavigator: true,
            isScrollControlled: true,
            showDragHandle: true,
            builder: (ctx) => SafeArea(
              child: Padding(
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
                    final addNew =
                        q.isNotEmpty &&
                        !filtered.any((p) => p.name.toLowerCase() == q);
                    return SizedBox(
                      height: MediaQuery.of(ctx).size.height * 0.7,
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                            child: TextField(
                              controller: input,
                              autofocus: true,
                              onChanged: (_) => setSt(() {}),
                              decoration: const InputDecoration(
                                hintText: 'Search or add new',
                                prefixIcon: Icon(Icons.search),
                              ),
                            ),
                          ),
                          Expanded(
                            child: ListView.builder(
                              itemCount: filtered.length + (addNew ? 1 : 0),
                              itemBuilder: (_, i) {
                                if (addNew && i == 0) {
                                  return ListTile(
                                    leading: const Icon(Icons.add),
                                    title: Text('Add "${input.text.trim()}"'),
                                    onTap: () => Navigator.of(ctx).pop((
                                      payee: null,
                                      newName: input.text.trim(),
                                    )),
                                  );
                                }
                                final idx = addNew ? i - 1 : i;
                                final p = filtered[idx];
                                return ListTile(
                                  leading: const Icon(Icons.store_outlined),
                                  title: Text(p.name),
                                  onTap: () => Navigator.of(
                                    ctx,
                                  ).pop((payee: p, newName: null)),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
          );
      if (result != null) {
        _onPayeePicked(payee: result.payee, newName: result.newName);
      }
    } finally {
      input.dispose();
    }
  }

  Future<void> _pickCategory() async {
    HapticFeedback.selectionClick();
    final repo = ref.read(categoryRepoProvider);
    final groups = await repo.listGroups();
    final cats = await repo.list();
    if (!mounted) return;
    if (groups.isEmpty) {
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        const SnackBar(
          content: Text(
            'No category groups yet. Add one in Settings → Categories.',
          ),
        ),
      );
      return;
    }
    final byGroup = <String, List<CategoryRow>>{};
    for (final c in cats) {
      byGroup.putIfAbsent(c.groupId, () => []).add(c);
    }
    final defaultGroup = groups.firstWhere(
      (g) => g.isIncome == _isIncome,
      orElse: () => groups.first,
    );
    final input = TextEditingController();
    CategoryRow? picked;
    try {
      picked = await showModalBottomSheet<CategoryRow>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom,
            ),
            child: StatefulBuilder(
              builder: (ctx, setSt) {
                final q = input.text.trim().toLowerCase();
                final addName = input.text.trim();
                final visibleByGroup = <String, List<CategoryRow>>{};
                for (final entry in byGroup.entries) {
                  final visible = q.isEmpty
                      ? entry.value
                      : entry.value
                            .where((c) => c.name.toLowerCase().contains(q))
                            .toList(growable: false);
                  if (visible.isNotEmpty) visibleByGroup[entry.key] = visible;
                }
                final exactExists = cats.any((c) => c.name.toLowerCase() == q);
                final canAdd = addName.isNotEmpty && !exactExists;
                return SizedBox(
                  height: MediaQuery.of(ctx).size.height * 0.7,
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                        child: TextField(
                          controller: input,
                          autofocus: true,
                          onChanged: (_) => setSt(() {}),
                          decoration: const InputDecoration(
                            hintText: 'Search or add category',
                            prefixIcon: Icon(Icons.search),
                          ),
                        ),
                      ),
                      Expanded(
                        child: ListView(
                          children: [
                            if (canAdd)
                              ListTile(
                                leading: const Icon(Icons.add),
                                title: Text('Add "$addName"'),
                                subtitle: Text('Under ${defaultGroup.name}'),
                                onTap: () async {
                                  final id = await repo.create(
                                    name: addName,
                                    groupId: defaultGroup.id,
                                    icon: defaultCategoryEmoji(addName),
                                  );
                                  final row = await repo.byId(id);
                                  if (row != null && ctx.mounted) {
                                    Navigator.of(ctx).pop(row);
                                  }
                                },
                              ),
                            for (final g in groups)
                              if ((visibleByGroup[g.id] ??
                                      const <CategoryRow>[])
                                  .isNotEmpty) ...[
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    20,
                                    16,
                                    20,
                                    4,
                                  ),
                                  child: Text(
                                    g.name.toUpperCase(),
                                    style: Theme.of(ctx).textTheme.labelSmall
                                        ?.copyWith(
                                          color: Theme.of(
                                            ctx,
                                          ).colorScheme.onSurfaceVariant,
                                          letterSpacing: 1.2,
                                        ),
                                  ),
                                ),
                                for (final c in visibleByGroup[g.id]!)
                                  ListTile(
                                    leading: _CategoryEmoji(c),
                                    title: Text(c.name),
                                    onTap: () => Navigator.of(ctx).pop(c),
                                  ),
                              ],
                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      );
    } finally {
      input.dispose();
    }
    if (picked != null) setState(() => _category = picked);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      useRootNavigator: true,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 7)),
      initialDate: _date,
    );
    if (picked != null) setState(() => _date = picked);
  }
}

/// Date row with quick chips (Today / Yesterday) and a fallback picker.
class _DateRow extends StatelessWidget {
  const _DateRow({
    required this.date,
    required this.onPick,
    required this.onChange,
  });

  final DateTime date;
  final VoidCallback onPick;
  final void Function(DateTime) onChange;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final today = clock.today();
    final yesterday = today.subtract(const Duration(days: 1));

    bool sameDay(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;

    Widget chip(String label, DateTime when) {
      final selected = sameDay(date, when);
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: selected,
          onSelected: (_) {
            HapticFeedback.selectionClick();
            onChange(when);
          },
          showCheckmark: false,
        ),
      );
    }

    final isOlder = !sameDay(date, today) && !sameDay(date, yesterday);

    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 4),
      child: Row(
        children: [
          Icon(
            Icons.calendar_today_outlined,
            size: 18,
            color: cs.onSurfaceVariant,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [chip('Today', today), chip('Yesterday', yesterday)],
              ),
            ),
          ),
          const SizedBox(width: 8),
          if (isOlder)
            ActionChip(
              label: Text(
                '${date.day.toString().padLeft(2, '0')}/'
                '${date.month.toString().padLeft(2, '0')}',
              ),
              onPressed: onPick,
            )
          else
            IconButton(
              tooltip: 'Pick date',
              icon: const Icon(Icons.event),
              onPressed: onPick,
            ),
        ],
      ),
    );
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
            style: moneyStyle(
              context,
              size: 28,
              weight: FontWeight.w600,
            ).copyWith(color: cs.onSurfaceVariant),
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
    this.unset = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;
  final bool unset;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 20, color: cs.onSurfaceVariant),
            const SizedBox(width: 16),
            SizedBox(
              width: 80,
              child: Text(
                label,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
              ),
            ),
            Expanded(
              child: Text(
                value,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: unset ? cs.onSurfaceVariant : cs.onSurface,
                  fontWeight: unset ? FontWeight.w400 : FontWeight.w500,
                ),
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, size: 18, color: cs.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _CategoryEmoji extends StatelessWidget {
  const _CategoryEmoji(this.category);
  final CategoryRow category;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: 18,
      backgroundColor: cs.secondaryContainer,
      foregroundColor: cs.onSecondaryContainer,
      child: Text(
        categoryEmoji(category.icon, category.name),
        style: const TextStyle(fontSize: 16),
      ),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onDigit, required this.onBack});

  final void Function(int digit) onDigit;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    Widget key(String label, VoidCallback action) => Expanded(
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: InkWell(
          onTap: () {
            HapticFeedback.selectionClick();
            action();
          },
          borderRadius: BorderRadius.circular(14),
          child: Container(
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: cs.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              label,
              style: moneyStyle(context, size: 24, weight: FontWeight.w600),
            ),
          ),
        ),
      ),
    );
    return Column(
      children: [
        Row(
          children: [
            key('1', () => onDigit(1)),
            key('2', () => onDigit(2)),
            key('3', () => onDigit(3)),
          ],
        ),
        Row(
          children: [
            key('4', () => onDigit(4)),
            key('5', () => onDigit(5)),
            key('6', () => onDigit(6)),
          ],
        ),
        Row(
          children: [
            key('7', () => onDigit(7)),
            key('8', () => onDigit(8)),
            key('9', () => onDigit(9)),
          ],
        ),
        Row(
          children: [
            key('00', () {
              onDigit(0);
              onDigit(0);
            }),
            key('0', () => onDigit(0)),
            key('⌫', onBack),
          ],
        ),
      ],
    );
  }
}

SnackBar _savedSnackBar(String label) {
  return SnackBar(
    content: Row(
      children: [
        const Icon(Icons.check_circle_outline, size: 20),
        const SizedBox(width: 12),
        Text(label),
      ],
    ),
    duration: const Duration(seconds: 2),
  );
}
