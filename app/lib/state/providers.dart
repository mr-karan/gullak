import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/prefs.dart';
import '../core/secure_store.dart';
import '../data/actual/actual_client.dart';
import '../data/ai/llm_client.dart';
import '../data/db/database.dart';

/// One global database instance, opened once at boot and disposed on
/// app teardown. Tests override via [ProviderContainer].
final Provider<AppDatabase> dbProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError('dbProvider must be overridden in main()');
});

final Provider<Prefs> prefsProvider = Provider<Prefs>((ref) {
  throw UnimplementedError('prefsProvider must be overridden in main()');
});

final Provider<SecureStore> secureStoreProvider = Provider<SecureStore>((ref) {
  return SecureStore();
});

/// Whether the app has been configured (server creds + budget).
final FutureProvider<bool> configuredProvider = FutureProvider<bool>((ref) async {
  final s = ref.watch(secureStoreProvider);
  final url = await s.readServerUrl();
  final key = await s.readApiKey();
  final budget = await s.readBudgetSyncId();
  return url != null && url.isNotEmpty &&
      key != null && key.isNotEmpty &&
      budget != null && budget.isNotEmpty;
});

/// Built lazily from secure storage. Throws [StateError] if the
/// app is unconfigured — callers should not invoke this until
/// [configuredProvider] is true.
final FutureProvider<ActualClient> actualClientProvider = FutureProvider<ActualClient>((ref) async {
  final s = ref.watch(secureStoreProvider);
  final url = await s.readServerUrl();
  final key = await s.readApiKey();
  if (url == null || key == null) {
    throw StateError('actual client requested before configuration');
  }
  final encPwd = await s.readBudgetEncryptionPassword();
  return ActualClient(
    baseUrl: url,
    apiKey: key,
    budgetEncryptionPassword: encPwd,
  );
});

final FutureProvider<LlmClient?> llmClientProvider = FutureProvider<LlmClient?>((ref) async {
  final s = ref.watch(secureStoreProvider);
  final base = await s.readLlmBaseUrl();
  final model = await s.readLlmModel();
  final key = await s.readLlmApiKey();
  if (base == null || base.isEmpty || model == null || model.isEmpty) {
    return null;
  }
  return LlmClient(baseUrl: base, model: model, apiKey: key);
});

final StateProvider<ThemeMode> themeModeProvider = StateProvider<ThemeMode>((ref) {
  final p = ref.watch(prefsProvider);
  return switch (p.themeMode) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
});
