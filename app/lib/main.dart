import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/notification_service.dart';
import 'core/prefs.dart';
import 'data/db/database.dart';
import 'features/entry/quick_entry.dart';
import 'features/entry/share_intake.dart';
import 'router/router.dart';
import 'state/providers.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
  ]);

  final db = AppDatabase();
  final prefs = await Prefs.load();
  await NotificationService.instance.init();

  runApp(
    ProviderScope(
      overrides: [
        dbProvider.overrideWithValue(db),
        prefsProvider.overrideWithValue(prefs),
      ],
      child: const GullakApp(),
    ),
  );
}

class GullakApp extends ConsumerWidget {
  const GullakApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final mode = ref.watch(themeModeProvider);

    // Pop the Quick Entry sheet whenever an image lands via the
    // Android share sheet. The sheet's _TypeTab consumes the pending
    // share on init, kicking off the AI parse automatically.
    ref.listen<PendingShare?>(pendingShareProvider, (prev, next) {
      if (next == null || prev != null) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = rootNavigatorKey.currentContext;
        if (ctx != null) openQuickEntry(ctx);
      });
    });

    return MaterialApp.router(
      title: 'Gullak',
      debugShowCheckedModeBanner: false,
      themeMode: mode,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      routerConfig: router,
    );
  }
}
