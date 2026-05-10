import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/snackbars.dart';
import '../../sync/sync_health_monitor.dart';
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
      icon: Icons.sell_outlined,
      selected: Icons.sell,
      label: 'Tags',
      path: '/tags',
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
        loc == '/tags' ||
        loc == '/accounts';
    final syncStatus = ref.watch(syncStatusProvider);
    // Surface offline → online recovery as a one-shot green toast so the
    // user gets confirmation that the network came back, without a sticky
    // banner sitting around once everything is healthy again.
    ref.listen<SyncStatus>(syncStatusProvider, (prev, next) {
      if (prev?.health == SyncHealthState.offline &&
          next.health == SyncHealthState.online) {
        final messenger = ScaffoldMessenger.maybeOf(context);
        if (messenger == null) return;
        final cs = Theme.of(context).colorScheme;
        showTimedSnackBar(
          messenger,
          SnackBar(
            backgroundColor: cs.tertiaryContainer,
            content: Text(
              'Sync server back online.',
              style: TextStyle(
                color: cs.onTertiaryContainer,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        );
      }
    });

    final showBanner =
        syncStatus.offline || syncStatus.checking && syncStatus.message != null;

    return Scaffold(
      body: Column(
        children: [
          if (showBanner)
            _SyncOfflineBanner(
              message: syncStatus.message ?? 'Checking sync server…',
              checking: syncStatus.checking,
              onRetry: () =>
                  ref.read(syncHealthMonitorProvider).retryNow(),
            ),
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
  const _SyncOfflineBanner({
    required this.message,
    required this.checking,
    required this.onRetry,
  });

  final String message;
  final bool checking;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      bottom: false,
      child: Material(
        color: cs.errorContainer,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
          child: Row(
            children: [
              Icon(
                checking ? Icons.cloud_sync_outlined : Icons.cloud_off_outlined,
                color: cs.onErrorContainer,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  checking ? 'Checking sync server…' : message,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: cs.onErrorContainer,
                    fontWeight: FontWeight.w700,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: checking ? null : onRetry,
                style: TextButton.styleFrom(
                  foregroundColor: cs.onErrorContainer,
                  minimumSize: const Size(0, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                ),
                child: checking
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Retry'),
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
