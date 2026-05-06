import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/notification_service.dart';
import 'core/prefs.dart';
import 'data/db/database.dart';
import 'data/sms/sms_pipeline.dart';
import 'features/entry/quick_entry.dart';
import 'features/entry/share_intake.dart';
import 'router/router.dart';
import 'state/providers.dart';
import 'sync/sync_scheduler.dart';
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

class GullakApp extends ConsumerStatefulWidget {
  const GullakApp({super.key});

  @override
  ConsumerState<GullakApp> createState() => _GullakAppState();
}

class _GullakAppState extends ConsumerState<GullakApp> {
  AppLifecycleListener? _lifecycle;

  @override
  void initState() {
    super.initState();
    // Sync on every resume so we get whatever the homelab learned
    // about while we were backgrounded (wife's iPhone logged
    // expenses, WhatsApp messages came through, etc.).
    _lifecycle = AppLifecycleListener(
      onResume: () {
        ref.read(syncSchedulerProvider).runNow();
        if (ref.read(prefsProvider).smsEnabled) {
          unawaited(ref.read(smsPipelineProvider).catchUpRecent());
        }
      },
    );
    // If the user already enabled SMS in a previous session, the
    // listener has to be re-armed each launch — the pref persists
    // but the Stream subscription doesn't.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (ref.read(prefsProvider).smsEnabled) {
        final pipeline = ref.read(smsPipelineProvider);
        pipeline.startListening();
        // The platform SMS background callback is best-effort on modern
        // Android. On launch, sweep only recent SMS so new rows land quickly
        // without walking the full historical inbox.
        unawaited(pipeline.catchUpRecent());
      }
    });
  }

  @override
  void dispose() {
    _lifecycle?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
