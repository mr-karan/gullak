import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/notification_service.dart';
import 'core/prefs.dart';
import 'core/secure_store.dart';
import 'data/ai/pi_ai_client.dart';
import 'data/db/database.dart';
import 'data/sms/sms_pipeline.dart';
import 'features/entry/quick_entry.dart';
import 'features/entry/share_intake.dart';
import 'router/router.dart';
import 'state/providers.dart';
import 'data/sms/sms_background_parse_worker.dart';
import 'data/sms/sms_enrichment_worker.dart';
import 'sync/sync_health_monitor.dart';
import 'sync/sync_scheduler.dart';
import 'package:workmanager/workmanager.dart';
import 'ui/theme.dart';

const String _buildSha = String.fromEnvironment('GULLAK_BUILD_SHA');
const String _buildAt = String.fromEnvironment('GULLAK_BUILD_AT');

final ValueNotifier<FlutterErrorDetails?> appErrorNotifier =
    ValueNotifier<FlutterErrorDetails?>(null);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    appErrorNotifier.value = details;
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    final details = FlutterErrorDetails(
      exception: error,
      stack: stack,
      library: 'platform dispatcher',
    );
    FlutterError.presentError(details);
    appErrorNotifier.value = details;
    return true;
  };
  ErrorWidget.builder = (details) => _AppErrorScreen(details: details);
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
  ]);

  final db = AppDatabase();
  final prefs = await Prefs.load();
  await NotificationService.instance.init();
  // WorkManager dispatcher needs to be initialised every cold start so
  // background-enqueued enrichment jobs (from notification replies the
  // user typed while the app was dead) can fire on the next launch and
  // on their own schedule.
  await Workmanager().initialize(smsEnrichmentDispatcher);
  // Periodic safety-net so SMS that arrive while the app is closed get
  // parsed without waiting for the next foreground open. The broadcast
  // receiver queues them; this drains the queue on a schedule. Android's
  // minimum periodic interval is 15 minutes. The worker itself no-ops when
  // SMS capture is disabled.
  await Workmanager().registerPeriodicTask(
    'gullak.sms.parse.periodic',
    backgroundParseTaskName,
    frequency: const Duration(minutes: 15),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
    constraints: Constraints(networkType: NetworkType.connected),
  );

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
        ref.read(syncHealthMonitorProvider).start();
        if (ref.read(prefsProvider).smsEnabled) {
          unawaited(ref.read(smsPipelineProvider).catchUpRecent());
        }
      },
      onHide: () => ref.read(syncHealthMonitorProvider).stop(),
      onPause: () => ref.read(syncHealthMonitorProvider).stop(),
    );
    // Initial arm on launch — AppLifecycleListener.onResume only fires on
    // subsequent resumes (background→foreground), not on first start.
    // We have to manually pull server changes here too, otherwise a fresh
    // open shows stale local data when the server has new mutations from
    // another device or a server-side edit.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(syncSchedulerProvider).runNow();
      ref.read(syncHealthMonitorProvider).start();
    });
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
      builder: (context, child) {
        return ValueListenableBuilder<FlutterErrorDetails?>(
          valueListenable: appErrorNotifier,
          builder: (context, details, _) {
            if (details != null) {
              return _AppErrorScreen(
                details: details,
                onDismiss: () => appErrorNotifier.value = null,
              );
            }
            return child ?? const SizedBox.shrink();
          },
        );
      },
    );
  }
}

class _AppErrorScreen extends StatefulWidget {
  const _AppErrorScreen({required this.details, this.onDismiss});

  final FlutterErrorDetails details;
  final VoidCallback? onDismiss;

  @override
  State<_AppErrorScreen> createState() => _AppErrorScreenState();
}

class _AppErrorScreenState extends State<_AppErrorScreen> {
  bool _sending = false;
  bool _sent = false;
  String? _result;

  @override
  Widget build(BuildContext context) {
    const scheme = ColorScheme.light();
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Material(
        color: scheme.surface,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.error_outline, color: scheme.error, size: 40),
                const SizedBox(height: 16),
                Text(
                  'Something went wrong',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.details.exceptionAsString(),
                  textAlign: TextAlign.center,
                  maxLines: 6,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                if (_result != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _result!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _sent ? scheme.primary : scheme.error,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _sending || _sent ? null : _sendFeedback,
                  icon: _sending
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.bug_report_outlined),
                  label: Text(_sending ? 'Sending…' : 'Send feedback'),
                ),
                if (widget.onDismiss != null) ...[
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: widget.onDismiss,
                    child: const Text('Try to continue'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _sendFeedback() async {
    setState(() {
      _sending = true;
      _result = null;
    });
    try {
      final client = await PiAiClient.fromSecure(SecureStore());
      if (client == null) {
        throw PiAiException(
          'Sync server is not configured. Settings → Sync server.',
        );
      }
      final id = await client
          .sendFeedback(
            kind: 'app_error',
            message: widget.details.exceptionAsString(),
            payload: _errorPayload(widget.details),
          )
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      setState(() {
        _sending = false;
        _sent = true;
        _result = id == null ? 'Feedback sent' : 'Feedback sent (#$id)';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _result = e is PiAiException ? e.message : '$e';
      });
    }
  }
}

Map<String, dynamic> _errorPayload(FlutterErrorDetails details) {
  return {
    'exception': details.exceptionAsString(),
    'library': details.library,
    'context': details.context?.toDescription(),
    'stack': details.stack?.toString(),
    'details': details.toString(),
    'sentAt': DateTime.now().toIso8601String(),
    'build': {'sha': _buildSha, 'at': _buildAt},
    'platform': {
      'operatingSystem': Platform.operatingSystem,
      'operatingSystemVersion': Platform.operatingSystemVersion,
      'locale': PlatformDispatcher.instance.locale.toLanguageTag(),
    },
  };
}
