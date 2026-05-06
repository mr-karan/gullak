import 'package:flutter_riverpod/flutter_riverpod.dart';

class SyncStatus {
  const SyncStatus({this.message, this.lastFailedAt});

  final String? message;
  final DateTime? lastFailedAt;

  bool get offline => message != null;
}

class SyncStatusController extends Notifier<SyncStatus> {
  @override
  SyncStatus build() => const SyncStatus();

  void online() {
    if (!state.offline) return;
    state = const SyncStatus();
  }

  void offline(String message) {
    state = SyncStatus(message: message, lastFailedAt: DateTime.now());
  }
}

final syncStatusProvider = NotifierProvider<SyncStatusController, SyncStatus>(
  SyncStatusController.new,
);
