import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/logger.dart';
import 'sync_service.dart';

/// Debounces local mutations into a single sync round-trip and runs
/// sync immediately when the app comes back to the foreground. The
/// in-flight guard means rapid-fire mutations can't fan out into
/// overlapping push/pull cycles.
class SyncScheduler {
  SyncScheduler(this._sync, {Duration? debounce})
    : _debounce = debounce ?? const Duration(seconds: 5);

  final SyncService _sync;
  final Duration _debounce;
  Timer? _timer;
  bool _running = false;

  /// Schedule a sync after [_debounce]. Repeated calls within the
  /// window collapse to a single run, so a flurry of writes (split
  /// transactions, batch imports) only triggers one round-trip.
  void schedule() {
    _timer?.cancel();
    _timer = Timer(_debounce, _runIfPossible);
  }

  /// Cancel any pending debounce and sync right now. Used on app
  /// foreground so the user sees fresh data after coming back.
  Future<void> runNow() async {
    _timer?.cancel();
    await _runIfPossible();
  }

  Future<void> _runIfPossible() async {
    if (_running) return;
    if (!await _sync.isConfigured()) return;
    _running = true;
    try {
      final result = await _sync.syncOnce();
      if (result.error != null) {
        log.w('auto-sync failed: ${result.error}');
      }
    } finally {
      _running = false;
    }
  }

  void dispose() => _timer?.cancel();
}

final Provider<SyncScheduler> syncSchedulerProvider = Provider<SyncScheduler>((
  ref,
) {
  final scheduler = SyncScheduler(ref.read(syncServiceProvider));
  ref.onDispose(scheduler.dispose);
  return scheduler;
});
