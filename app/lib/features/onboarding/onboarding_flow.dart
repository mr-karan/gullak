import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/money.dart';
import '../../data/ai/pi_ai_client.dart';
import '../../state/providers.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../categories/category_visuals.dart';

/// First-run wizard. Three quick steps:
///   1. Welcome + currency
///   2. First account
///   3. Sync server (optional — URL + API key, or skip)
///
/// The sync server is the single trusted box that holds the LLM
/// credentials, so SMS parsing, natural-language QuickEntry, and
/// receipt-photo parsing all stay disabled until the user configures
/// it (either here or later in Settings → Sync).
///
/// On completion we seed default category groups and mark onboarded.
class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({super.key});

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  final _ctrl = PageController();

  // Seeded from the device locale so a non-Indian user isn't forced to change
  // the currency on the very first screen. Still fully editable below, and
  // falls back to ₹ / 2 when the locale can't be resolved.
  String _symbol = '₹';
  int _minorDigits = 2;

  String _accountName = '';
  AccountKind _kind = AccountKind.savings;
  int _openingBalanceCents = 0;
  bool _finishing = false;

  @override
  void initState() {
    super.initState();
    try {
      final locale = WidgetsBinding.instance.platformDispatcher.locale;
      final fmt = NumberFormat.simpleCurrency(locale: locale.toString());
      final symbol = fmt.currencySymbol.trim();
      if (symbol.isNotEmpty) _symbol = symbol;
      _minorDigits = fmt.decimalDigits ?? _minorDigits;
    } catch (_) {
      // Unknown/unsupported locale — keep the ₹ / 2 fallback.
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _next() => _ctrl.nextPage(
    duration: const Duration(milliseconds: 220),
    curve: Curves.easeOut,
  );

  Future<void> _finish({String? syncBaseUrl, String? syncApiKey}) async {
    if (_finishing) return;
    setState(() => _finishing = true);
    try {
      await ref
          .read(accountRepoProvider)
          .create(
            name: _accountName.trim(),
            kind: _kind,
            openingBalanceCents: _openingBalanceCents,
          );
      await _seedDefaults(ref);
      final prefs = ref.read(prefsProvider);
      await prefs.setCurrencySymbol(_symbol);
      await prefs.setCurrencyMinorDigits(_minorDigits);

      final url = syncBaseUrl?.trim();
      if (url != null && url.isNotEmpty) {
        final key = syncApiKey?.trim();
        await ref
            .read(secureStoreProvider)
            .writeSync(
              baseUrl: url,
              apiKey: key == null || key.isEmpty ? null : key,
            );
        ref.invalidate(piAiClientProvider);
      }

      // Set onboarded *last* and invalidate — the router listens to
      // onboardedProvider via a refreshListenable and redirects to '/'
      // automatically. Calling context.go on top of that double-navigates
      // and races the widget being unmounted by the redirect.
      final db = ref.read(dbProvider);
      await db.kvSet('onboarded', 'true');
      ref.invalidate(onboardedProvider);
    } finally {
      if (mounted) setState(() => _finishing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            PageView(
              controller: _ctrl,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _WelcomeAndCurrency(
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
                  onSubmit:
                      ({required name, required kind, required openingCents}) {
                        setState(() {
                          _accountName = name;
                          _kind = kind;
                          _openingBalanceCents = openingCents;
                        });
                        _next();
                      },
                ),
                _SyncSetup(
                  busy: _finishing,
                  onSkip: () => _finish(),
                  onSubmit:
                      ({required String baseUrl, required String apiKey}) =>
                          _finish(syncBaseUrl: baseUrl, syncApiKey: apiKey),
                ),
              ],
            ),
            if (_finishing)
              Positioned.fill(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.45),
                  child: const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 32,
                          height: 32,
                          child: CircularProgressIndicator(strokeWidth: 2.5),
                        ),
                        SizedBox(height: 16),
                        Text(
                          'Setting things up…',
                          style: TextStyle(color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Onboarding page chrome. The body scrolls when the keyboard is up or
/// text scale is large; the footer (action button) stays pinned to the
/// bottom regardless. We deliberately avoid the IntrinsicHeight + Spacer
/// pattern — at small viewports it fights the scroll view's layout and
/// hangs `pumpAndSettle` indefinitely.
class _OnboardingPageShell extends StatelessWidget {
  const _OnboardingPageShell({required this.body, required this.footer});

  final Widget body;
  final Widget footer;

  static const _hPad = 24.0;
  static const _topPad = 48.0;
  static const _bottomPad = 24.0;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(_hPad, _topPad, _hPad, 16),
            child: body,
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(_hPad, 0, _hPad, _bottomPad),
          child: footer,
        ),
      ],
    );
  }
}

/// Combined welcome + currency picker — saves a screen by merging
/// branding and the currency choice. Branding sits at the top, a
/// chip strip lets the user pick currency, Continue advances.
class _WelcomeAndCurrency extends StatelessWidget {
  const _WelcomeAndCurrency({
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
    ('₹ INR', '₹', 2),
    (r'$ USD', r'$', 2),
    ('€ EUR', '€', 2),
    ('£ GBP', '£', 2),
    ('¥ JPY', '¥', 0),
  ];

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return _OnboardingPageShell(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: cs.primaryContainer,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(Icons.savings_outlined, color: cs.onPrimaryContainer),
          ),
          const SizedBox(height: 24),
          Text('Gullak', style: Theme.of(context).textTheme.displayMedium),
          const SizedBox(height: 8),
          Text(
            'A local-first expense tracker. Lives on your phone, syncs nowhere.',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 32),
          Text(
            'CURRENCY',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: cs.onSurfaceVariant,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final o in _options)
                ChoiceChip(
                  label: Text(o.$1),
                  selected: o.$2 == symbol && o.$3 == minorDigits,
                  onSelected: (_) => onChange(o.$2, o.$3),
                ),
            ],
          ),
        ],
      ),
      footer: SizedBox(
        width: double.infinity,
        child: FilledButton(onPressed: onNext, child: const Text('Continue')),
      ),
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
  })
  onSubmit;

  @override
  State<_FirstAccount> createState() => _FirstAccountState();
}

class _FirstAccountState extends State<_FirstAccount> {
  final _name = TextEditingController(text: 'Main');
  final _balance = TextEditingController();
  AccountKind _kind = AccountKind.savings;

  @override
  void dispose() {
    _name.dispose();
    _balance.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _OnboardingPageShell(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'First account',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
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
            onChanged: (v) => setState(() => _kind = v ?? AccountKind.savings),
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
        ],
      ),
      footer: SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: () {
            final name = _name.text.trim();
            if (name.isEmpty) return;
            final cents = Money.parseToMinor(
              _balance.text,
              minorDigits: widget.minorDigits,
            );
            widget.onSubmit(name: name, kind: _kind, openingCents: cents);
          },
          child: const Text('Continue'),
        ),
      ),
    );
  }
}

/// Optional final step. The homelab pi-server holds the LLM
/// credentials and runs all parsing for SMS, natural-language
/// QuickEntry, and receipt photos. Skipping is fine — those features
/// stay disabled until the server is configured here or later in
/// Settings → Sync.
class _SyncSetup extends StatefulWidget {
  const _SyncSetup({
    required this.onSubmit,
    required this.onSkip,
    this.busy = false,
  });

  final void Function({required String baseUrl, required String apiKey})
  onSubmit;
  final VoidCallback onSkip;
  final bool busy;

  @override
  State<_SyncSetup> createState() => _SyncSetupState();
}

class _SyncSetupState extends State<_SyncSetup> {
  final _baseUrl = TextEditingController();
  final _apiKey = TextEditingController();

  @override
  void dispose() {
    _baseUrl.dispose();
    _apiKey.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return _OnboardingPageShell(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sync server',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'Optional — skip if you just want a local ledger on this phone.',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          Theme(
            // Drop the default ExpansionTile dividers for a cleaner card.
            data: Theme.of(
              context,
            ).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(bottom: 8),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              leading: Icon(Icons.help_outline, color: cs.onSurfaceVariant),
              title: Text(
                "What's a sync server?",
                style: Theme.of(context).textTheme.titleSmall,
              ),
              children: [
                Text(
                  'A self-hosted Gullak server (your homelab, a VPS, a Pi). '
                  'It merges data across devices and holds the AI model keys, '
                  'so SMS parsing, photo receipts, and natural-language entry '
                  'run there — never on your phone. You can add it later in '
                  'Settings → Sync.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _baseUrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Base URL',
              hintText: 'https://your-server.example.com',
            ),
            autocorrect: false,
            enableSuggestions: false,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _apiKey,
            decoration: const InputDecoration(
              labelText: 'API key',
              hintText: 'optional',
            ),
            obscureText: true,
            autocorrect: false,
            enableSuggestions: false,
          ),
        ],
      ),
      footer: Row(
        children: [
          TextButton(
            onPressed: widget.busy ? null : widget.onSkip,
            child: const Text('Skip'),
          ),
          const Spacer(),
          FilledButton(
            onPressed: widget.busy
                ? null
                : () {
                    final url = _baseUrl.text.trim();
                    if (url.isEmpty) {
                      widget.onSkip();
                      return;
                    }
                    widget.onSubmit(baseUrl: url, apiKey: _apiKey.text.trim());
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
    await repo.create(
      name: name,
      groupId: group,
      icon: defaultCategoryEmoji(name),
    );
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
