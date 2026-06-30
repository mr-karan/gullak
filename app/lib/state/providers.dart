import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/prefs.dart';
import '../core/secure_store.dart';
import '../data/db/database.dart';

final Provider<AppDatabase> dbProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError('dbProvider must be overridden in main()');
});

final Provider<Prefs> prefsProvider = Provider<Prefs>((ref) {
  throw UnimplementedError('prefsProvider must be overridden in main()');
});

/// Bumped by settings setters so widgets watching prefs values rebuild.
/// Needed because [Prefs] is a long-lived shared instance — mutating it
/// doesn't change identity, so [prefsProvider] alone won't notify watchers.
class PrefsRevision extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final NotifierProvider<PrefsRevision, int> prefsRevisionProvider =
    NotifierProvider<PrefsRevision, int>(PrefsRevision.new);

/// Reactive read of [Prefs]. Use this whenever the widget should
/// rebuild on a settings toggle (theme, currency, AI/SMS toggles).
Prefs watchPrefs(WidgetRef ref) {
  ref.watch(prefsRevisionProvider);
  return ref.read(prefsProvider);
}

/// Call after a [Prefs] setter to wake up watchers of [watchPrefs].
void bumpPrefs(WidgetRef ref) {
  ref.read(prefsRevisionProvider.notifier).bump();
}

final Provider<SecureStore> secureStoreProvider = Provider<SecureStore>((ref) {
  return SecureStore();
});

/// Has the user finished onboarding? Set once on the last onboarding step.
final FutureProvider<bool> onboardedProvider = FutureProvider<bool>((
  ref,
) async {
  final db = ref.watch(dbProvider);
  return (await db.kvGet('onboarded')) == 'true';
});

final Provider<ThemeMode> themeModeProvider = Provider<ThemeMode>((ref) {
  // Watch the revision (like watchPrefs does for widgets) so the theme
  // rebuilds when a Prefs setter bumps it — otherwise a theme toggle doesn't
  // apply until the next restart.
  ref.watch(prefsRevisionProvider);
  final p = ref.read(prefsProvider);
  return switch (p.themeMode) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
});
