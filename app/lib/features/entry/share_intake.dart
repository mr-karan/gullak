import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import '../../core/logger.dart';

/// Holds the bytes of the most recent image the user shared into
/// Chavanni from another app via the Android share-sheet. QuickEntry's
/// _TypeTab reads + clears it on mount so the receipt shows up
/// pre-loaded and the AI parse kicks off immediately.
class PendingShare {
  const PendingShare({required this.bytes, this.mimeType = 'image/jpeg'});
  final Uint8List bytes;
  final String mimeType;
}

class PendingShareNotifier extends Notifier<PendingShare?> {
  StreamSubscription<List<SharedMediaFile>>? _sub;

  @override
  PendingShare? build() {
    if (Platform.isAndroid || Platform.isIOS) {
      _bootstrap();
    }
    ref.onDispose(() => _sub?.cancel());
    return null;
  }

  Future<void> _bootstrap() async {
    final initial = await ReceiveSharingIntent.instance.getInitialMedia();
    await _ingest(initial);
    _sub = ReceiveSharingIntent.instance.getMediaStream().listen(
      _ingest,
      onError: (Object e) => log.w('share-intake stream error: $e'),
    );
  }

  Future<void> _ingest(List<SharedMediaFile> files) async {
    if (files.isEmpty) return;
    final image = files.firstWhere(
      (f) => f.type == SharedMediaType.image,
      orElse: () => files.first,
    );
    if (image.type != SharedMediaType.image) return;
    try {
      final bytes = await File(image.path).readAsBytes();
      final mime =
          image.mimeType ??
          (image.path.toLowerCase().endsWith('.png')
              ? 'image/png'
              : 'image/jpeg');
      state = PendingShare(bytes: bytes, mimeType: mime);
    } catch (e) {
      log.w('share-intake read failed: $e');
    }
    // Tell the plugin we're done so it doesn't redeliver this on next
    // launch. A real receipt the user re-shares will come through as a
    // fresh stream event.
    await ReceiveSharingIntent.instance.reset();
  }

  void consume() => state = null;
}

final NotifierProvider<PendingShareNotifier, PendingShare?>
pendingShareProvider = NotifierProvider<PendingShareNotifier, PendingShare?>(
  PendingShareNotifier.new,
);
