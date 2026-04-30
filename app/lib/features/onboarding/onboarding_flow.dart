import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/logger.dart';
import '../../data/actual/actual_client.dart';
import '../../data/actual/actual_dto.dart';
import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';

class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({super.key});

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  final _ctrl = PageController();

  String _serverUrl = '';
  String _apiKey = '';
  List<BudgetDto> _budgets = const [];
  String? _pickedBudget;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: PageView(
          controller: _ctrl,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _Welcome(onNext: _next),
            _Connect(
              initialUrl: _serverUrl,
              initialKey: _apiKey,
              onTested: (u, k, b) {
                setState(() {
                  _serverUrl = u;
                  _apiKey = k;
                  _budgets = b;
                });
                _next();
              },
            ),
            _PickBudget(
              budgets: _budgets,
              onPicked: (id) {
                setState(() => _pickedBudget = id);
                _persistAndSync();
              },
            ),
            const _SyncDone(),
          ],
        ),
      ),
    );
  }

  void _next() {
    _ctrl.nextPage(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  Future<void> _persistAndSync() async {
    final s = ref.read(secureStoreProvider);
    await s.writeServerCreds(
      serverUrl: _serverUrl,
      apiKey: _apiKey,
      budgetSyncId: _pickedBudget,
    );
    ref.invalidate(actualClientProvider);
    ref.invalidate(syncServiceProvider);
    ref.invalidate(configuredProvider);
    _next();
    try {
      await ref.read(syncControllerProvider.notifier).sync(initial: true);
    } catch (e, st) {
      log.e('initial sync failed', error: e, stackTrace: st);
    }
    if (!mounted) return;
    await Future<void>.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;
    context.go('/');
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
          Text(
            'Gullak',
            style: Theme.of(context).textTheme.displayMedium,
          ),
          const SizedBox(height: 12),
          Text(
            'A polished mobile expense tracker for your self-hosted Actual Budget server.',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: cs.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 32),
          Text(
            'You will need:\n'
            '  · An Actual Budget server you control.\n'
            '  · An actual-http-api Docker pointed at it.\n'
            '  · The API key you generated for it.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const Spacer(),
          FilledButton(
            onPressed: onNext,
            child: const Text('Continue'),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => _showHelp(context),
            child: const Text('How do I set those up?'),
          ),
        ],
      ),
    );
  }

  void _showHelp(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _HelpSheet(),
    );
  }
}

class _HelpSheet extends StatelessWidget {
  const _HelpSheet();
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Setup', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              const SelectableText(
'''Run both alongside each other (docker-compose):

services:
  actual-server:
    image: actualbudget/actual-server:latest
    ports: ["5006:5006"]
    volumes: ["./actual-data:/data"]
  actual-http-api:
    image: jhonderson/actual-http-api:latest
    ports: ["5007:5007"]
    environment:
      ACTUAL_SERVER_URL: "http://actual-server:5006"
      ACTUAL_SERVER_PASSWORD: "<your password>"
      API_KEY: "<random key>"
    depends_on: [actual-server]

The phone connects to actual-http-api on :5007. Put it behind a reverse proxy with TLS.''',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Connect extends ConsumerStatefulWidget {
  const _Connect({
    required this.initialUrl,
    required this.initialKey,
    required this.onTested,
  });

  final String initialUrl;
  final String initialKey;
  final void Function(String, String, List<BudgetDto>) onTested;

  @override
  ConsumerState<_Connect> createState() => _ConnectState();
}

class _ConnectState extends ConsumerState<_Connect> {
  late final TextEditingController _url = TextEditingController(text: widget.initialUrl);
  late final TextEditingController _key = TextEditingController(text: widget.initialKey);
  bool _testing = false;
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    super.dispose();
  }

  Future<void> _test() async {
    setState(() {
      _testing = true;
      _error = null;
    });
    final url = _url.text.trim();
    final key = _key.text.trim();
    if (url.isEmpty || key.isEmpty) {
      setState(() {
        _testing = false;
        _error = 'Both fields are required.';
      });
      return;
    }
    try {
      final client = ActualClient(baseUrl: url, apiKey: key);
      final budgets = await client.getBudgets();
      if (!mounted) return;
      widget.onTested(url, key, budgets);
    } on ActualClientException catch (e) {
      setState(() {
        _testing = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _testing = false;
        _error = 'Connection failed: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Connect', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text(
            'Point the app at your actual-http-api instance.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: cs.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            autofillHints: const [AutofillHints.url],
            decoration: const InputDecoration(
              labelText: 'Server URL',
              hintText: 'https://actualapi.example.com',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _key,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'API key',
              hintText: 'paste from your actual-http-api .env',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: cs.error)),
          ],
          const Spacer(),
          FilledButton(
            onPressed: _testing ? null : _test,
            child: _testing
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Test connection'),
          ),
        ],
      ),
    );
  }
}

class _PickBudget extends StatelessWidget {
  const _PickBudget({required this.budgets, required this.onPicked});

  final List<BudgetDto> budgets;
  final void Function(String syncId) onPicked;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Pick a budget', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 24),
          Expanded(
            child: ListView(
              children: [
                for (final b in budgets)
                  Card(
                    child: ListTile(
                      title: Text(b.name),
                      subtitle: Text(b.syncId, style: const TextStyle(fontSize: 11)),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => onPicked(b.syncId),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SyncDone extends StatelessWidget {
  const _SyncDone();
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(48),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          const SizedBox(height: 24),
          Text('Setting up your data…',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: cs.onSurfaceVariant,
                  )),
        ],
      ),
    );
  }
}
