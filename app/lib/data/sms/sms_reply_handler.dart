import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:geolocator/geolocator.dart';
import 'package:workmanager/workmanager.dart';

import '../../core/logger.dart';
import '../db/database.dart';
import 'sms_enrichment_worker.dart' show enrichmentTaskName;

/// Lives outside the main isolate. Called from the notification's
/// background action receiver — the Flutter engine spins up a short-lived
/// isolate for this. Must:
///   1. Persist the note synchronously (the receiver has a ~10s budget).
///   2. Capture a best-effort cached location (no GPS wake).
///   3. Enqueue a one-time WorkManager job for the LLM enrichment call;
///      the actual network can take longer than a receiver can survive.
class SmsReplyHandler {
  SmsReplyHandler._();

  static Future<void> persistReplyAndEnqueue({
    required int smsId,
    required String note,
  }) async {
    AppDatabase? db;
    try {
      db = AppDatabase();
      await _persist(db: db, smsId: smsId, note: note);
      await _enqueue(smsId: smsId);
    } catch (e, st) {
      log.w('SmsReplyHandler failed for $smsId: $e\n$st');
    } finally {
      await db?.close();
    }
  }

  static Future<void> _persist({
    required AppDatabase db,
    required int smsId,
    required String note,
  }) async {
    final at = DateTime.now().millisecondsSinceEpoch;
    final loc = await _safeCachedLocation();
    await (db.update(db.smsMessages)..where((t) => t.id.equals(smsId))).write(
      SmsMessagesCompanion(
        userNote: Value(note),
        noteCapturedAt: Value(at),
        locationLat: Value(loc?.latitude),
        locationLng: Value(loc?.longitude),
        locationAccuracyM: Value(loc?.accuracy?.round()),
        locationCapturedAt: Value(loc?.capturedAt),
        enrichmentStatus: const Value('pending'),
      ),
    );
  }

  static Future<void> _enqueue({required int smsId}) async {
    // Unique by sms id — typing a new note replaces any pending job so
    // we never run two enrichments in parallel for the same row.
    final name = 'sms-enrich-$smsId';
    await Workmanager().registerOneOffTask(
      name,
      enrichmentTaskName,
      inputData: {'smsId': smsId},
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingWorkPolicy.replace,
      backoffPolicy: BackoffPolicy.exponential,
      backoffPolicyDelay: const Duration(seconds: 30),
    );
  }

  static Future<_CachedLocation?> _safeCachedLocation() async {
    // Background isolates can't request permissions — only use what the
    // user already granted. `getLastKnownPosition` returns null cheaply
    // when nothing is cached or permission is missing.
    if (!Platform.isAndroid && !Platform.isIOS) return null;
    try {
      final pos = await Geolocator.getLastKnownPosition();
      if (pos == null) return null;
      return _CachedLocation(
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        capturedAt: pos.timestamp.millisecondsSinceEpoch,
      );
    } catch (e) {
      log.w('SMS note: location fetch failed: $e');
      return null;
    }
  }
}

class _CachedLocation {
  const _CachedLocation({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    required this.capturedAt,
  });
  final double latitude;
  final double longitude;
  final double? accuracy;
  final int capturedAt;
}
