import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/accounts/account_detail_screen.dart';
import '../features/accounts/accounts_screen.dart';
import '../features/home/home_shell.dart';
import '../features/home/home_screen.dart';
import '../features/inbox/inbox_screen.dart';
import '../features/onboarding/onboarding_flow.dart';
import '../features/settings/settings_screen.dart';
import '../features/transactions/transaction_detail_screen.dart';
import '../features/transactions/transactions_screen.dart';
import '../state/providers.dart';

final Provider<GoRouter> routerProvider = Provider<GoRouter>((ref) {
  // Bump this whenever the configured-state changes so go_router re-runs
  // the redirect. Without it the splash hangs after the future resolves.
  final tick = ValueNotifier<int>(0);
  ref
    ..listen(configuredProvider, (_, _) => tick.value++)
    ..onDispose(tick.dispose);
  return GoRouter(
    initialLocation: '/loading',
    debugLogDiagnostics: false,
    refreshListenable: tick,
    redirect: (context, state) {
      final configured = ref.read(configuredProvider);
      if (configured.isLoading) {
        return state.matchedLocation == '/loading' ? null : '/loading';
      }
      final ok = configured.value ?? false;
      final atOnboarding = state.matchedLocation.startsWith('/onboarding');
      final atLoading = state.matchedLocation == '/loading';
      if (!ok && !atOnboarding) return '/onboarding';
      if (ok && (atOnboarding || atLoading)) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/loading',
        builder: (_, _) => const _SplashScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (_, _) => const OnboardingFlow(),
      ),
      ShellRoute(
        builder: (context, state, child) => HomeShell(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (_, _) => const NoTransitionPage<void>(child: HomeScreen()),
          ),
          GoRoute(
            path: '/transactions',
            pageBuilder: (_, _) => const NoTransitionPage<void>(child: TransactionsScreen()),
            routes: [
              GoRoute(
                path: ':id',
                builder: (_, s) => TransactionDetailScreen(id: s.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: '/inbox',
            pageBuilder: (_, _) => const NoTransitionPage<void>(child: InboxScreen()),
          ),
          GoRoute(
            path: '/accounts',
            pageBuilder: (_, _) => const NoTransitionPage<void>(child: AccountsScreen()),
            routes: [
              GoRoute(
                path: ':id',
                builder: (_, s) => AccountDetailScreen(id: s.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: '/settings',
            pageBuilder: (_, _) => const NoTransitionPage<void>(child: SettingsScreen()),
          ),
        ],
      ),
    ],
  );
});

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(strokeWidth: 2.5),
        ),
      ),
    );
  }
}
