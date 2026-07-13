import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../core/notification_service.dart';
import '../../core/prefs.dart';
import '../../features/transactions/data/transaction_repository.dart';
import '../../state/providers.dart';
import '../db/database.dart';
import 'parser_registry.dart';
import 'sms_pipeline.dart';
import 'sms_reader.dart';

/// WorkManager task name for the periodic background SMS parse pass.
const String backgroundParseTaskName = 'chavanni.sms.parse';

/// Periodic background worker that parses SMS captured while the app was
/// closed. The `another_telephony` broadcast receiver enqueues inbound SMS
/// into a SharedPreferences queue ([chavanniBackgroundSmsHandler]); this worker
/// drains and ingests that queue on a schedule so transactions land without
/// the user having to open the app.
///
/// Runs in a cold WorkManager isolate — it builds the pipeline from a
/// throwaway [ProviderContainer] (db + prefs overridden) and constructs
/// [SmsPipeline] directly rather than reading [smsPipelineProvider], which
/// would auto-start the live telephony listener (unsafe off the main isolate).
class SmsBackgroundParseWorker {
  SmsBackgroundParseWorker._();

  static Future<bool> run() async {
    WidgetsFlutterBinding.ensureInitialized();
    final prefs = await Prefs.load();
    if (!prefs.smsEnabled) return true; // feature off — nothing to do

    final db = AppDatabase();
    final container = ProviderContainer(
      overrides: [
        dbProvider.overrideWithValue(db),
        prefsProvider.overrideWithValue(prefs),
      ],
    );
    try {
      await NotificationService.instance.init();
      final pipeline = SmsPipeline(
        db: db,
        reader: container.read(smsReaderProvider),
        parserRegistry: container.read(parserRegistryProvider),
        notifications: container.read(notificationServiceProvider),
        transactionRepo: container.read(transactionRepoProvider),
        prefs: prefs,
      );
      await pipeline.ingestBackgroundQueue();
      return true;
    } catch (e, st) {
      log.w('background sms parse failed: $e\n$st');
      return false; // let WorkManager retry with backoff
    } finally {
      container.dispose();
      await db.close();
    }
  }
}
