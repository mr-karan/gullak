import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/accounts/account_detail_screen.dart';
import '../features/accounts/accounts_screen.dart';
import '../features/budgets/budget_screen.dart';
import '../features/categories/categories_screen.dart';
import '../features/home/home_shell.dart';
import '../features/home/home_screen.dart';
import '../features/inbox/inbox_screen.dart';
import '../features/onboarding/onboarding_flow.dart';
import '../features/reports/reports_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/transactions/transaction_detail_screen.dart';
import '../features/transactions/transactions_screen.dart';
import '../state/providers.dart';

final Provider<GoRouter> routerProvider = Provider<GoRouter>((ref) {
  // Bump this whenever onboarded state changes so go_router re-runs the
  // redirect. Without it the splash hangs after the future resolves.
  final tick = ValueNotifier<int>(0);
  ref
    ..listen(onboardedProvider, (_, _) => tick.value++)
    ..onDispose(tick.dispose);

  return GoRouter(
    initialLocation: '/loading',
    debugLogDiagnostics: false,
    refreshListenable: tick,
    redirect: (context, state) {
      final onboarded = ref.read(onboardedProvider);
      if (onboarded.isLoading) {
        return state.matchedLocation == '/loading' ? null : '/loading';
      }
      final ok = onboarded.value ?? false;
      final atOnboarding = state.matchedLocation.startsWith('/onboarding');
      final atLoading = state.matchedLocation == '/loading';
      if (!ok && !atOnboarding) return '/onboarding';
      if (ok && (atOnboarding || atLoading)) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/loading', builder: (_, _) => const _Splash()),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingFlow()),
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
            path: '/budgets',
            pageBuilder: (_, _) => const NoTransitionPage<void>(child: BudgetScreen()),
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
            routes: [
              GoRoute(
                path: 'categories',
                builder: (_, _) => const CategoriesScreen(),
              ),
            ],
          ),
          GoRoute(
            path: '/reports',
            pageBuilder: (_, _) => const NoTransitionPage<void>(child: ReportsScreen()),
          ),
        ],
      ),
    ],
  );
});

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(
          child: SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
        ),
      );
}
