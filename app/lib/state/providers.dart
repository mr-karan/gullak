import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/prefs.dart';
import '../core/secure_store.dart';
import '../data/ai/llm_client.dart';
import '../data/db/database.dart';

final Provider<AppDatabase> dbProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError('dbProvider must be overridden in main()');
});

final Provider<Prefs> prefsProvider = Provider<Prefs>((ref) {
  throw UnimplementedError('prefsProvider must be overridden in main()');
});

final Provider<SecureStore> secureStoreProvider = Provider<SecureStore>((ref) {
  return SecureStore();
});

/// Has the user finished onboarding? Set once on the last onboarding step.
final FutureProvider<bool> onboardedProvider = FutureProvider<bool>((ref) async {
  final db = ref.watch(dbProvider);
  return (await db.kvGet('onboarded')) == 'true';
});

final FutureProvider<LlmClient?> llmClientProvider = FutureProvider<LlmClient?>((ref) async {
  final s = ref.watch(secureStoreProvider);
  final base = await s.readLlmBaseUrl();
  final model = await s.readLlmModel();
  final key = await s.readLlmApiKey();
  if (base == null || base.isEmpty || model == null || model.isEmpty) return null;
  return LlmClient(baseUrl: base, model: model, apiKey: key);
});

final Provider<ThemeMode> themeModeProvider = Provider<ThemeMode>((ref) {
  final p = ref.watch(prefsProvider);
  return switch (p.themeMode) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
});
