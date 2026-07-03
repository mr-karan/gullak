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
import '../categories/category_form_dialog.dart';
import '../categories/category_visuals.dart';
import '../categories/data/category_repository.dart';
import '../inbox/data/sms_repository.dart';
import '../location/location_service.dart';
import '../payees/data/payee_repository.dart';
import '../tags/data/tag_repository.dart';
import '../transactions/data/transaction_repository.dart';
import 'ai_extractor.dart';
import 'entry_memory.dart';
import 'share_intake.dart';

class QuickEntrySheet extends ConsumerStatefulWidget {
  const QuickEntrySheet({
    this.editingTransactionId,
    this.initialNote,
    this.smsDraft,
    this.onCreated,
    super.key,
  });

  /// When non-null, the sheet hydrates from this transaction and Save
  /// updates instead of inserting. Header copy and the trailing icon
  /// flip accordingly.
  final String? editingTransactionId;

  /// When non-null, the natural-language Type tab opens with this text
  /// already entered (e.g. an SMS body the user wants to log manually).
  /// Forces the Type tab to be the initial selection regardless of the
  /// last-used tab pref.
  final String? initialNote;

  /// When non-null, the Form tab opens pre-filled from an SMS-derived
  /// draft so the user only has to fill missing metadata (typically the
  /// category). The Type tab is suppressed in this mode.
  final SmsTransactionDraft? smsDraft;

  /// Called after a *new* transaction is saved (not on edit). The Inbox
  /// Confirm flow uses this to mark the SMS row accepted and link it
  /// to the freshly-created transaction id.
  final Future<void> Function(String transactionId)? onCreated;

  @override
  ConsumerState<QuickEntrySheet> createState() => _QuickEntrySheetState();
}

class _QuickEntrySheetState extends ConsumerState<QuickEntrySheet>
    with SingleTickerProviderStateMixin {
  bool _showType = false;
  TabController? _tabs;

  bool get _isEditing => widget.editingTransactionId != null;
  bool get _isSmsConfirm => widget.smsDraft != null;

  @override
  void initState() {
    super.initState();
    // Editing always goes straight to Form. Creating shows the
    // natural-language tab only when the homelab pi-server is
    // configured (it does the parsing). The check is async so we
    // start without the tab and add it once we know.
    if (_isEditing) return;
    // SMS confirm hydrates the form directly from the draft — there's
    // nothing to type in natural language, so suppress the Type tab.
    if (_isSmsConfirm) return;
    () async {
      final base = await ref.read(secureStoreProvider).readSyncBaseUrl();
      if (!mounted) return;
      if (base == null || base.trim().isEmpty) return;
      final prefs = ref.read(prefsProvider);
      // If a caller pre-filled a note (e.g. "log this SMS manually"),
      // open on the Type tab regardless of the user's last choice — the
      // text only makes sense in the natural-language flow.
      final initialIndex = widget.initialNote != null
          ? 0
          : (prefs.quickEntryTab == 'type' ? 0 : 1);
      setState(() {
        _showType = true;
        _tabs = TabController(
          length: 2,
          vsync: this,
          initialIndex: initialIndex,
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
                title: _isEditing
                    ? 'Edit expense'
                    : _isSmsConfirm
                    ? 'Confirm from SMS'
                    : 'New expense',
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
                          _TypeTab(
                            initialText: widget.initialNote,
                            onTweakInForm: () => _tabs?.animateTo(1),
                          ),
                          _FormTab(
                            editingTransactionId: widget.editingTransactionId,
                            smsDraft: widget.smsDraft,
                            onCreated: widget.onCreated,
                            keyboardOpen: keyboardOpen,
                          ),
                        ],
                      )
                    : _FormTab(
                        editingTransactionId: widget.editingTransactionId,
                        smsDraft: widget.smsDraft,
                        onCreated: widget.onCreated,
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
  const _TypeTab({required this.onTweakInForm, this.initialText});

  final VoidCallback onTweakInForm;
  final String? initialText;

  @override
  ConsumerState<_TypeTab> createState() => _TypeTabState();
}

class _TypeTabState extends ConsumerState<_TypeTab> {
  late final TextEditingController _ctrl = TextEditingController(
    text: widget.initialText ?? '',
  );
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
    } else if ((widget.initialText ?? '').trim().length >= 3) {
      // Pre-filled note (e.g. an SMS body the user wants to log
      // manually) — kick off the parse immediately so the user lands
      // on a populated draft instead of a typing prompt.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _runParse(_ctrl.text);
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
      final prefs = ref.read(prefsProvider);
      final location = prefs.locationCaptureEnabled
          ? await ref.read(locationServiceProvider).capture()
          : null;
      final id = await ref
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
            latitude: location?.latitude,
            longitude: location?.longitude,
            locationName: location?.name,
            origin: 'ai',
            originRef: _ctrl.text,
          );
      final activeTagId = prefs.activeTagId;
      if (activeTagId != null) {
        await ref.read(tagRepoProvider).setTransactionTags(id, [activeTagId]);
      }
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
          chip(parsed.categoryHint!, categoryIconData(parsed.categoryHint!)),
        chip(_dateLabel(parsed.date), Icons.calendar_today_outlined),
        if (parsed.confidence < 0.5)
          chip(
            'Low confidence — review',
            Icons.warning_amber_outlined,
            color: warningColor(cs),
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
  const _FormTab({
    this.editingTransactionId,
    this.smsDraft,
    this.onCreated,
    required this.keyboardOpen,
  });

  final String? editingTransactionId;
  final SmsTransactionDraft? smsDraft;
  final Future<void> Function(String transactionId)? onCreated;
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
  // Optional foreign-currency capture, hidden behind a chip like notes.
  // Records what the expense was in its original currency (e.g. USD 20); the
  // main amount stays in the base currency. Display-only, no conversion.
  final _foreignAmountCtrl = TextEditingController();
  final _foreignCurrencyCtrl = TextEditingController();
  bool _foreignExpanded = false;
  final Set<String> _tagIds = <String>{};
  // Notes is hidden behind a + chip until the user wants it. Most
  // entries don't carry a note; keeping the form short saves a row.
  bool _notesExpanded = false;
  bool _saving = false;
  bool _hydrating = false;

  bool get _isEditing => widget.editingTransactionId != null;
  bool get _isSmsConfirm => widget.smsDraft != null;

  @override
  void initState() {
    super.initState();
    if (_isEditing) {
      _hydrating = true;
      _hydrateFromExisting();
    } else if (_isSmsConfirm) {
      _hydrating = true;
      _hydrateFromSmsDraft();
    }
  }

  Future<void> _hydrateFromSmsDraft() async {
    final draft = widget.smsDraft!;
    final accounts = await ref.read(accountRepoProvider).list();
    AccountRow? account;
    for (final a in accounts) {
      if (a.id == draft.accountId) {
        account = a;
        break;
      }
    }
    account ??= accounts.firstOrNull;
    CategoryRow? category;
    if (draft.categoryId != null) {
      category = await ref.read(categoryRepoProvider).byId(draft.categoryId!);
    }
    PayeeRow? payee;
    if (draft.payeeId != null) {
      payee = await ref.read(payeeRepoProvider).byId(draft.payeeId!);
    }
    if (!mounted) return;
    final minorDigits = ref.read(prefsProvider).currencyMinorDigits;
    final scale = _pow10(minorDigits);
    setState(() {
      _amountWhole = draft.amountCentsSigned.abs() ~/ scale;
      _isIncome = draft.isIncome;
      _account = account;
      _category = category;
      _payee = payee;
      _newPayeeName = payee == null ? draft.payeeName : null;
      _date = draft.date;
      _tagIds
        ..clear()
        ..addAll(draft.tagIds);
      _hydrating = false;
    });
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
    final tags = await ref.read(tagRepoProvider).tagsForTransaction(row.id);
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
      _tagIds
        ..clear()
        ..addAll(tags.map((t) => t.id));
      _date = DateTime.tryParse(row.date) ?? clock.today();
      _notesCtrl.text = row.notes ?? '';
      _notesExpanded = (row.notes ?? '').isNotEmpty;
      if (row.originalAmountCents != null &&
          (row.originalCurrency ?? '').isNotEmpty) {
        final code = row.originalCurrency!;
        _foreignAmountCtrl.text = Money.formatDigitsOnly(
          row.originalAmountCents!,
          minorDigits: Money.minorDigitsForCurrency(code),
        );
        _foreignCurrencyCtrl.text = code;
        _foreignExpanded = true;
      }
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
    _foreignAmountCtrl.dispose();
    _foreignCurrencyCtrl.dispose();
    super.dispose();
  }

  /// Parse the optional foreign-amount fields into (minorUnits, code), or
  /// (null, null) when unset/blank. The amount is scaled by the chosen
  /// currency's own minor digits (USD 2, JPY 0).
  ({int? cents, String? code}) _foreignValue() {
    final code = _foreignCurrencyCtrl.text.trim().toUpperCase();
    final raw = _foreignAmountCtrl.text.trim();
    if (code.isEmpty || raw.isEmpty) return (cents: null, code: null);
    final cents = Money.parseToMinor(
      raw,
      minorDigits: Money.minorDigitsForCurrency(code),
    );
    if (cents == 0) return (cents: null, code: null);
    return (cents: cents.abs(), code: code);
  }

  Future<void> _onPayeePicked({PayeeRow? payee, String? newName}) async {
    setState(() {
      _payee = payee;
      _newPayeeName = newName;
    });
    if (payee == null) return;
    final memory = ref.read(entryMemoryProvider);
    final hintedAccount = await memory.accountForPayee(payee.id);
    final hintedCategory = await memory.categoryForPayee(payee.id);
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
      final prefs = ref.read(prefsProvider);
      final location = !_isEditing && prefs.locationCaptureEnabled
          ? await ref.read(locationServiceProvider).capture()
          : null;
      final foreign = _foreignValue();
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
          originalAmountCents: foreign.cents,
          originalCurrency: foreign.code,
        );
        await ref
            .read(tagRepoProvider)
            .setTransactionTags(widget.editingTransactionId!, _tagIds.toList());
      } else {
        final draft = widget.smsDraft;
        final notes = _notesCtrl.text.trim().isEmpty
            ? (draft != null ? 'SMS · ${draft.smsAddress}' : null)
            : _notesCtrl.text.trim();
        final id = await repo.create(
          accountId: _account!.id,
          categoryId: _category?.id,
          payeeId: payeeId,
          payeeName: _newPayeeName ?? _payee?.name,
          amountCents: amount,
          date: _date,
          notes: notes,
          latitude: location?.latitude,
          longitude: location?.longitude,
          locationName: location?.name,
          origin: draft != null ? 'sms' : 'manual',
          originRef: draft?.smsRowId.toString(),
          originalAmountCents: foreign.cents,
          originalCurrency: foreign.code,
        );
        final activeTagId = prefs.activeTagId;
        final tags = {..._tagIds, ?activeTagId};
        if (tags.isNotEmpty) {
          await ref.read(tagRepoProvider).setTransactionTags(id, tags.toList());
        }
        if (widget.onCreated != null) {
          await widget.onCreated!(id);
        }
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

  /// The save button names the action ("Save ₹450 to HDFC") so the account
  /// is confirmed at a glance before committing — cheap insurance against
  /// logging to the wrong account. Falls back to a bare verb until both an
  /// amount and an account are set (the button is disabled then anyway).
  String _saveLabel(String symbol) {
    final verb = _isEditing ? 'Update' : 'Save';
    if (_amountWhole == 0 || _account == null) return verb;
    final amt = Money.format(_amountWhole, minorDigits: 0, symbol: symbol);
    return '$verb $amt to ${_account!.name}';
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
              ),
              const SizedBox(height: 10),
              _SignSegment(
                isIncome: _isIncome,
                onChanged: (v) => setState(() => _isIncome = v),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: ListView(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _ContextChip(
                            icon: Icons.account_balance_outlined,
                            label: _account?.name ?? 'Account',
                            isSet: _account != null,
                            onTap: _pickAccount,
                          ),
                          _ContextChip(
                            icon: Icons.store_outlined,
                            label: _newPayeeName ?? _payee?.name ?? 'Payee',
                            isSet: _payee != null || _newPayeeName != null,
                            onTap: _pickPayee,
                          ),
                          _ContextChip(
                            icon: _category == null
                                ? Icons.label_outline
                                : categoryIconData(_category!.name),
                            label: _category?.name ?? 'Category',
                            isSet: _category != null,
                            accent: _category == null
                                ? null
                                : categoryAccentColor(
                                    _category!.color,
                                    _category!.name,
                                  ),
                            onTap: _pickCategory,
                          ),
                          _TagsChip(tagIds: _tagIds, onTap: _pickTags),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
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
                    if (_foreignExpanded)
                      Padding(
                        padding: const EdgeInsets.only(top: 8, bottom: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              flex: 2,
                              child: TextField(
                                controller: _foreignAmountCtrl,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                                decoration: const InputDecoration(
                                  labelText: 'Foreign amount',
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextField(
                                controller: _foreignCurrencyCtrl,
                                textCapitalization:
                                    TextCapitalization.characters,
                                decoration: InputDecoration(
                                  labelText: 'Code',
                                  hintText: 'USD',
                                  suffixIcon: IconButton(
                                    icon: const Icon(Icons.close),
                                    onPressed: () => setState(() {
                                      _foreignExpanded = false;
                                      _foreignAmountCtrl.clear();
                                      _foreignCurrencyCtrl.clear();
                                    }),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: TextButton.icon(
                          onPressed: () =>
                              setState(() => _foreignExpanded = true),
                          icon: const Icon(Icons.public_outlined, size: 18),
                          label: const Text('Add foreign amount'),
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
                child: Text(
                  _saving ? 'Saving…' : _saveLabel(prefs.currencySymbol),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
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
        await _onPayeePicked(payee: result.payee, newName: result.newName);
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
                                subtitle: const Text(
                                  'Set emoji & parent on the next step',
                                ),
                                onTap: () async {
                                  final result = await showCategoryFormDialog(
                                    ctx,
                                    ref,
                                    title: 'New category',
                                    initialName: addName,
                                    initialGroupId: defaultGroup.id,
                                    preferIncomeGroup: _isIncome,
                                  );
                                  if (result == null) return;
                                  final id = await repo.create(
                                    name: result.name,
                                    groupId: result.groupId,
                                    icon: result.icon,
                                    parentId: result.parentId,
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
                                for (final entry in _hierarchy(
                                  visibleByGroup[g.id]!,
                                  q,
                                ))
                                  ListTile(
                                    contentPadding: EdgeInsets.only(
                                      left: entry.indented ? 40 : 16,
                                      right: 16,
                                    ),
                                    leading: _CategoryEmoji(entry.row),
                                    title: Text(entry.row.name),
                                    onTap: () =>
                                        Navigator.of(ctx).pop(entry.row),
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

  Future<void> _pickTags() async {
    HapticFeedback.selectionClick();
    final repo = ref.read(tagRepoProvider);
    final tags = await repo.list();
    if (!mounted) return;
    final selected = Set<String>.of(_tagIds);
    final input = TextEditingController();
    try {
      final result = await showModalBottomSheet<Set<String>>(
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
                final visible = q.isEmpty
                    ? tags
                    : tags
                          .where((t) => t.name.toLowerCase().contains(q))
                          .toList(growable: false);
                final canAdd =
                    q.isNotEmpty && !tags.any((t) => t.name.toLowerCase() == q);
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
                            hintText: 'Search or add tag',
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
                                title: Text('Add "${input.text.trim()}"'),
                                onTap: () async {
                                  final id = await repo.create(
                                    name: input.text.trim(),
                                  );
                                  selected.add(id);
                                  if (ctx.mounted) {
                                    Navigator.of(ctx).pop(selected);
                                  }
                                },
                              ),
                            for (final tag in visible)
                              CheckboxListTile(
                                value: selected.contains(tag.id),
                                title: Text(tag.name),
                                secondary: Icon(
                                  Icons.label,
                                  color: tag.color == null
                                      ? null
                                      : Color(tag.color!),
                                ),
                                onChanged: (v) => setSt(() {
                                  if (v ?? false) {
                                    selected.add(tag.id);
                                  } else {
                                    selected.remove(tag.id);
                                  }
                                }),
                              ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: FilledButton(
                          onPressed: () => Navigator.of(ctx).pop(selected),
                          child: const Text('Done'),
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
        setState(() {
          _tagIds
            ..clear()
            ..addAll(result);
        });
      }
    } finally {
      input.dispose();
    }
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

/// Expense / Income segmented toggle. Replaces the cryptic +/- icon button —
/// spend and income are named, and the active side tints to match the amount.
class _SignSegment extends StatelessWidget {
  const _SignSegment({required this.isIncome, required this.onChanged});

  final bool isIncome;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    Widget seg(String label, bool incomeValue, IconData icon) {
      final selected = isIncome == incomeValue;
      final accent = incomeValue ? cs.tertiary : cs.primary;
      return Expanded(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            if (selected) return;
            HapticFeedback.selectionClick();
            onChanged(incomeValue);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeOut,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected
                  ? accent.withValues(alpha: 0.14)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: 16,
                  color: selected ? accent : cs.onSurfaceVariant,
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: selected ? accent : cs.onSurfaceVariant,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          seg('Expense', false, Icons.south_east),
          seg('Income', true, Icons.north_east),
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
  });

  final int whole;
  final String symbol;
  final bool isIncome;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final amountColor = isIncome ? cs.tertiary : cs.onSurface;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Text(
            isIncome ? '+$symbol' : symbol,
            style: moneyStyle(
              context,
              size: 28,
              weight: FontWeight.w600,
            ).copyWith(color: isIncome ? cs.tertiary : cs.onSurfaceVariant),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              _formatWhole(whole),
              style: moneyStyle(
                context,
                size: 40,
                weight: FontWeight.w700,
              ).copyWith(color: amountColor),
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
            ),
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

/// A tap-to-pick context chip (account / payee / category / tags). Unset
/// chips read as muted "add me" affordances; set chips fill with a tint
/// (the category's own accent when it has one) and bold their label.
class _ContextChip extends StatelessWidget {
  const _ContextChip({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isSet = false,
    this.accent,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isSet;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tint = accent ?? cs.primary;
    final fg = isSet ? tint : cs.onSurfaceVariant;
    final bg = isSet
        ? tint.withValues(alpha: 0.12)
        : cs.surfaceContainerHighest;
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: fg),
              const SizedBox(width: 6),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 200),
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: isSet ? cs.onSurface : cs.onSurfaceVariant,
                    fontWeight: isSet ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryRowEntry {
  const _CategoryRowEntry(this.row, this.indented);
  final CategoryRow row;
  final bool indented;
}

/// Lay out one group's categories so subcategories appear under their
/// parent. Only one level of nesting is supported. While the user is
/// searching, results render flat — hiding matching children under an
/// absent parent would feel like the search is broken.
List<_CategoryRowEntry> _hierarchy(List<CategoryRow> rows, String query) {
  if (query.isNotEmpty) {
    return [for (final r in rows) _CategoryRowEntry(r, false)];
  }
  final byParent = <String, List<CategoryRow>>{};
  for (final r in rows) {
    if (r.parentId != null) {
      byParent.putIfAbsent(r.parentId!, () => []).add(r);
    }
  }
  final result = <_CategoryRowEntry>[];
  for (final r in rows) {
    if (r.parentId == null) {
      result.add(_CategoryRowEntry(r, false));
      for (final k in byParent[r.id] ?? const <CategoryRow>[]) {
        result.add(_CategoryRowEntry(k, true));
      }
    }
  }
  // Orphans (parent missing or in a different visible slice) tail the
  // group so they don't disappear silently.
  final present = result.map((e) => e.row.id).toSet();
  for (final r in rows) {
    if (!present.contains(r.id)) {
      result.add(_CategoryRowEntry(r, r.parentId != null));
    }
  }
  return result;
}

class _CategoryEmoji extends StatelessWidget {
  const _CategoryEmoji(this.category);
  final CategoryRow category;

  @override
  Widget build(BuildContext context) {
    final accent = categoryAccentColor(category.color, category.name);
    return CircleAvatar(
      radius: 18,
      backgroundColor: accent.withValues(alpha: 0.18),
      foregroundColor: accent,
      child: Icon(categoryIconData(category.name), size: 18, color: accent),
    );
  }
}

class _TagsChip extends ConsumerWidget {
  const _TagsChip({required this.tagIds, required this.onTap});

  final Set<String> tagIds;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<List<TagRow>>(
      future: ref.read(tagRepoProvider).list(),
      builder: (context, snap) {
        final tags = snap.data ?? const <TagRow>[];
        final selected = tags.where((t) => tagIds.contains(t.id)).toList();
        final label = selected.isEmpty
            ? 'Tags'
            : selected.map((t) => t.name).join(', ');
        return _ContextChip(
          icon: Icons.sell_outlined,
          label: label,
          isSet: selected.isNotEmpty,
          onTap: onTap,
        );
      },
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
