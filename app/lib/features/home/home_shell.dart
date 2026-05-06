import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../sync/sync_status.dart';
import '../../state/providers.dart';
import '../entry/quick_entry.dart';

class HomeShell extends ConsumerWidget {
  const HomeShell({required this.child, super.key});

  final Widget child;

  static const _tabs = [
    _Tab(
      icon: Icons.home_outlined,
      selected: Icons.home,
      label: 'Home',
      path: '/',
    ),
    _Tab(
      icon: Icons.receipt_long_outlined,
      selected: Icons.receipt_long,
      label: 'Activity',
      path: '/transactions',
    ),
    _Tab(
      icon: Icons.pie_chart_outline,
      selected: Icons.pie_chart,
      label: 'Budget',
      path: '/budgets',
    ),
    _Tab(
      icon: Icons.inbox_outlined,
      selected: Icons.inbox,
      label: 'Inbox',
      path: '/inbox',
    ),
    _Tab(
      icon: Icons.account_balance_outlined,
      selected: Icons.account_balance,
      label: 'Accounts',
      path: '/accounts',
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = GoRouterState.of(context).matchedLocation;
    final smsEnabled = watchPrefs(ref).smsEnabled;
    final tabs = smsEnabled
        ? _tabs
        : _tabs.where((t) => t.path != '/inbox').toList(growable: false);
    final index = _indexOf(tabs, loc);

    final showFab =
        loc == '/' ||
        loc == '/transactions' ||
        loc == '/budgets' ||
        loc == '/accounts';
    final syncStatus = ref.watch(syncStatusProvider);

    return Scaffold(
      body: Column(
        children: [
          if (syncStatus.offline)
            _SyncOfflineBanner(message: syncStatus.message!),
          Expanded(child: child),
        ],
      ),
      floatingActionButton: showFab
          ? FloatingActionButton.extended(
              onPressed: () => _openQuickEntry(context),
              icon: const Icon(Icons.add),
              label: const Text('Add'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index < 0 ? 0 : index,
        onDestinationSelected: (i) => context.go(tabs[i].path),
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selected),
              label: t.label,
            ),
        ],
      ),
    );
  }

  Future<void> _openQuickEntry(BuildContext context) => openQuickEntry(context);

  int _indexOf(List<_Tab> tabs, String loc) {
    for (var i = 0; i < tabs.length; i++) {
      if (loc == tabs[i].path || loc.startsWith('${tabs[i].path}/')) return i;
    }
    return 0;
  }
}

class _SyncOfflineBanner extends StatelessWidget {
  const _SyncOfflineBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      bottom: false,
      child: Material(
        color: cs.errorContainer,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Icon(Icons.cloud_off_outlined, color: cs.onErrorContainer),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: cs.onErrorContainer,
                    fontWeight: FontWeight.w700,
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

class _Tab {
  const _Tab({
    required this.icon,
    required this.selected,
    required this.label,
    required this.path,
  });

  final IconData icon;
  final IconData selected;
  final String label;
  final String path;
}
