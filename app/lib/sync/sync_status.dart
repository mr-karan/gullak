import 'package:flutter_riverpod/flutter_riverpod.dart';

enum SyncHealthState { unknown, online, checking, offline }

class SyncStatus {
  const SyncStatus({
    this.health = SyncHealthState.unknown,
    this.message,
    this.lastCheckedAt,
    this.lastFailedAt,
    this.failureCount = 0,
    this.syncInFlight = false,
  });

  final SyncHealthState health;
  final String? message;
  final DateTime? lastCheckedAt;
  final DateTime? lastFailedAt;
  final int failureCount;
  final bool syncInFlight;

  bool get offline => health == SyncHealthState.offline;
  bool get checking => health == SyncHealthState.checking;
  bool get isOnline => health == SyncHealthState.online;

  SyncStatus copyWith({
    SyncHealthState? health,
    String? message,
    DateTime? lastCheckedAt,
    DateTime? lastFailedAt,
    int? failureCount,
    bool? syncInFlight,
    bool clearMessage = false,
  }) => SyncStatus(
    health: health ?? this.health,
    message: clearMessage ? null : (message ?? this.message),
    lastCheckedAt: lastCheckedAt ?? this.lastCheckedAt,
    lastFailedAt: lastFailedAt ?? this.lastFailedAt,
    failureCount: failureCount ?? this.failureCount,
    syncInFlight: syncInFlight ?? this.syncInFlight,
  );
}

class SyncStatusController extends Notifier<SyncStatus> {
  @override
  SyncStatus build() => const SyncStatus();

  void online() {
    state = SyncStatus(
      health: SyncHealthState.online,
      lastCheckedAt: DateTime.now(),
      failureCount: 0,
    );
  }

  void offline(String message) {
    state = state.copyWith(
      health: SyncHealthState.offline,
      message: message,
      lastFailedAt: DateTime.now(),
      lastCheckedAt: DateTime.now(),
      failureCount: state.failureCount + 1,
    );
  }

  void markChecking() {
    state = state.copyWith(health: SyncHealthState.checking);
  }

  void markSyncInFlight(bool inFlight) {
    state = state.copyWith(syncInFlight: inFlight);
  }
}

final syncStatusProvider = NotifierProvider<SyncStatusController, SyncStatus>(
  SyncStatusController.new,
);
