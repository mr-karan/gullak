import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/logger.dart';
import 'sync_scheduler.dart';
import 'sync_service.dart';
import 'sync_status.dart';

/// Periodic reachability probe for the sync server. Kept separate from
/// `SyncScheduler` (which owns mutation debouncing and full push/pull) so
/// a transient network blip recovers automatically without waiting for the
/// next user mutation.
///
/// Cadence:
///  - while offline: exponential backoff with ±20% jitter, capped at 5m
///    (5s → 15s → 30s → 1m → 2m → 5m).
///  - while online or unknown: low-rate poll every 2m so we catch
///    the server going down even when the user is idle.
///  - foreground only: stop the timer on background to spare battery
///    and radio.
class SyncHealthMonitor {
  SyncHealthMonitor(
    this._service,
    this._scheduler,
    this._readState,
    this._status,
  );

  final SyncService _service;
  final SyncScheduler _scheduler;
  final SyncStatus Function() _readState;
  final SyncStatusController _status;

  static const _backoff = <Duration>[
    Duration(seconds: 5),
    Duration(seconds: 15),
    Duration(seconds: 30),
    Duration(minutes: 1),
    Duration(minutes: 2),
    Duration(minutes: 5),
  ];
  static const _healthyInterval = Duration(minutes: 2);

  Timer? _timer;
  bool _foregrounded = false;
  bool _running = false;
  final Random _rng = Random();

  /// Begin periodic probing. Idempotent — repeated calls just (re)arm
  /// the timer without firing immediately.
  void start() {
    _foregrounded = true;
    _scheduleNext();
  }

  /// Halt probing. Called on app pause/hide so we don't poll the
  /// network while the user isn't watching.
  void stop() {
    _foregrounded = false;
    _timer?.cancel();
    _timer = null;
  }

  /// Manual retry from the offline banner. Probes immediately, ignoring
  /// the current backoff timer, and rearms the next scheduled probe
  /// based on the new state.
  Future<void> retryNow() async {
    _timer?.cancel();
    if (_running) return;
    await _check();
    _scheduleNext();
  }

  void _scheduleNext() {
    _timer?.cancel();
    if (!_foregrounded) return;
    _timer = Timer(_delayForCurrentState(), () async {
      await _check();
      _scheduleNext();
    });
  }

  Duration _delayForCurrentState() {
    final s = _readState();
    final base = s.health == SyncHealthState.offline
        ? _backoff[(s.failureCount - 1).clamp(0, _backoff.length - 1)]
        : _healthyInterval;
    return _withJitter(base);
  }

  Duration _withJitter(Duration base) {
    final ms = base.inMilliseconds;
    final spread = (ms * 0.2).round();
    if (spread <= 0) return base;
    final delta = _rng.nextInt(spread * 2 + 1) - spread;
    return Duration(milliseconds: ms + delta);
  }

  Future<void> _check() async {
    if (_running) return;
    if (!await _service.isConfigured()) return;
    _running = true;
    final wasOffline = _readState().health == SyncHealthState.offline;
    _status.markChecking();
    try {
      final result = await _service.probeHealth();
      if (result.ok) {
        _status.online();
        // If we just recovered, push/pull anything queued while we
        // were down. Don't await — the scheduler runs on its own.
        if (wasOffline) {
          unawaited(_scheduler.runNow());
        }
      } else {
        log.w('sync health probe failed: ${result.message}');
        _status.offline(result.message);
      }
    } finally {
      _running = false;
    }
  }

  void dispose() => stop();
}

final Provider<SyncHealthMonitor> syncHealthMonitorProvider =
    Provider<SyncHealthMonitor>((ref) {
      final monitor = SyncHealthMonitor(
        ref.read(syncServiceProvider),
        ref.read(syncSchedulerProvider),
        () => ref.read(syncStatusProvider),
        ref.read(syncStatusProvider.notifier),
      );
      ref.onDispose(monitor.dispose);
      return monitor;
    });
