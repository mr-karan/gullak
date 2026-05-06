import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/logger.dart';
import 'sync_service.dart';
import 'sync_status.dart';

/// Debounces local mutations into a single sync round-trip and runs
/// sync immediately when the app comes back to the foreground. The
/// in-flight guard means rapid-fire mutations can't fan out into
/// overlapping push/pull cycles.
class SyncScheduler {
  SyncScheduler(this._sync, this._status, {Duration? debounce})
    : _debounce = debounce ?? const Duration(seconds: 5);

  final SyncService _sync;
  final SyncStatusController _status;
  final Duration _debounce;
  Timer? _timer;
  bool _running = false;
  // Set when a schedule()/runNow() arrives while a sync is already
  // in flight. We re-arm after the in-flight one finishes so the
  // mutation that caused the second call doesn't sit unsynced until
  // the next unrelated trigger.
  bool _rerunRequested = false;

  /// Schedule a sync after [_debounce]. Repeated calls within the
  /// window collapse to a single run, so a flurry of writes (split
  /// transactions, batch imports) only triggers one round-trip.
  void schedule() {
    if (_running) {
      _rerunRequested = true;
      return;
    }
    _timer?.cancel();
    _timer = Timer(_debounce, _runIfPossible);
  }

  /// Cancel any pending debounce and sync right now. Used on app
  /// foreground so the user sees fresh data after coming back.
  Future<void> runNow() async {
    if (_running) {
      _rerunRequested = true;
      return;
    }
    _timer?.cancel();
    await _runIfPossible();
  }

  Future<void> _runIfPossible() async {
    if (_running) {
      _rerunRequested = true;
      return;
    }
    if (!await _sync.isConfigured()) return;
    _running = true;
    try {
      final result = await _sync.syncOnce();
      if (result.error != null) {
        log.w('auto-sync failed: ${result.error}');
        _status.offline(result.error!);
      } else {
        _status.online();
      }
    } finally {
      _running = false;
      if (_rerunRequested) {
        _rerunRequested = false;
        schedule();
      }
    }
  }

  void dispose() => _timer?.cancel();
}

final Provider<SyncScheduler> syncSchedulerProvider = Provider<SyncScheduler>((
  ref,
) {
  final scheduler = SyncScheduler(
    ref.read(syncServiceProvider),
    ref.read(syncStatusProvider.notifier),
  );
  ref.onDispose(scheduler.dispose);
  return scheduler;
});
