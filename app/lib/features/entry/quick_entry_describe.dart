part of 'quick_entry_sheet.dart';

/// AI capture, presented as a modal sheet launched from the form. Parses a
/// natural-language line or a receipt photo and **returns** a [ParsedExpense]
/// (via Navigator.pop) for the form to apply — it no longer saves directly, so
/// the user always reviews/tweaks the parsed fields in the form before saving.
class _DescribeSheet extends ConsumerStatefulWidget {
  const _DescribeSheet({this.initialText, this.autoScan = false});

  final String? initialText;
  final bool autoScan;

  @override
  ConsumerState<_DescribeSheet> createState() => _DescribeSheetState();
}

class _DescribeSheetState extends ConsumerState<_DescribeSheet> {
  late final TextEditingController _ctrl = TextEditingController(
    text: widget.initialText ?? '',
  );
  Timer? _debounce;
  // Monotonic seq id; older parses ignore their own results when superseded.
  int _parseSeq = 0;
  AsyncValue<ParsedExpense?> _parse = const AsyncValue<ParsedExpense?>.data(
    null,
  );
  Uint8List? _imageBytes;

  @override
  void initState() {
    super.initState();
    // If the user got here by sharing an image into Chavanni, the bytes
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
    } else if (widget.autoScan) {
      // Opened via the Scan button — jump straight to the image picker.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _showImageMenu();
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
    final source = await showAppSheet<ImageSource>(
      context,
      showDragHandle: false,
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

  /// Hand the parsed result back to the form, which fills its fields and lets
  /// the user review before saving.
  void _use() {
    final value = _parse.value;
    if (value == null || value.amountCents == 0) return;
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.7,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Column(
              children: [
                TextField(
                  controller: _ctrl,
                  autofocus: true,
                  textInputAction: TextInputAction.done,
                  onChanged: _onChanged,
                  onSubmitted: (_) => _use(),
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
                    child: Image.memory(
                      _imageBytes!,
                      height: 120,
                      fit: BoxFit.cover,
                    ),
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
                        onPressed: () => Navigator.of(context).maybePop(),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: _parse.value == null ? null : _use,
                        child: const Text('Use these details'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
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
