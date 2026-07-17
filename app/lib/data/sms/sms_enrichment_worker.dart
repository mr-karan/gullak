import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:workmanager/workmanager.dart';

import '../../core/logger.dart';
import '../../core/notification_service.dart';
import '../../core/secure_store.dart';
import '../../features/payees/data/payee_repository.dart';
import '../../features/transactions/data/transaction_repository.dart';
import '../../sync/changelog_writer.dart';
import '../db/database.dart';
import 'sms_background_parse_worker.dart';

const String enrichmentTaskName = 'gullak.sms.enrich';

/// Marked `vm:entry-point` so release tree-shaking doesn't drop this
/// callback — WorkManager looks it up by symbol after a cold isolate spin-up.
@pragma('vm:entry-point')
void smsEnrichmentDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    // Periodic background SMS parse pass (drains the broadcast-receiver
    // queue). Distinct task name, routed to its own worker.
    if (task == backgroundParseTaskName) {
      try {
        return await SmsBackgroundParseWorker.run();
      } catch (e, st) {
        log.w('background parse dispatcher crashed: $e\n$st');
        return false;
      }
    }
    if (task != enrichmentTaskName) return true;
    final smsId = (inputData?['smsId'] as num?)?.toInt();
    if (smsId == null) return true;
    try {
      WidgetsFlutterBinding.ensureInitialized();
      return await SmsEnrichmentWorker.run(smsId: smsId);
    } catch (e, st) {
      log.w('enrichment worker crashed for $smsId: $e\n$st');
      return false;
    }
  });
}

class SmsEnrichmentWorker {
  SmsEnrichmentWorker._();

  static Future<bool> run({required int smsId}) async {
    final db = AppDatabase();
    try {
      final row = await (db.select(
        db.smsMessages,
      )..where((t) => t.id.equals(smsId))).getSingleOrNull();
      if (row == null) {
        log.w('enrichment: sms row $smsId not found');
        return true;
      }
      final note = row.userNote?.trim();
      if (note == null || note.isEmpty) {
        log.w('enrichment: sms row $smsId has no user note');
        return true;
      }

      final config = await _readServerConfig();
      if (config == null) {
        log.w('enrichment: sync server not configured; skipping');
        return false;
      }

      Map<String, dynamic>? candidateJson;
      if (row.candidateJson != null && row.candidateJson!.isNotEmpty) {
        try {
          candidateJson =
              jsonDecode(row.candidateJson!) as Map<String, dynamic>;
        } catch (e) {
          log.w('enrichment: cached candidate_json malformed: $e');
        }
      }

      final results = await Future.wait<Object>([
        _categoryLibrary(db),
        _payeeLibrary(db),
      ]);
      final categories = results[0] as List<Map<String, String>>;
      final payees = results[1] as List<Map<String, dynamic>>;

      final body = {
        'smsBody': row.body,
        'receivedAt': row.receivedAt,
        'currentCandidate': {
          'amountCents': (candidateJson?['amount_cents'] as num?)?.toInt() ?? 0,
          'isIncome': candidateJson?['is_income'] == true,
          'payee': candidateJson?['payee'],
          'accountHint': candidateJson?['account_hint'],
          'categoryHint': candidateJson?['category_hint'],
          'date': candidateJson?['date'],
        },
        'userNote': note,
        if (row.locationLat != null && row.locationLng != null)
          'location': {
            'lat': row.locationLat,
            'lng': row.locationLng,
            'accuracyMeters': row.locationAccuracyM,
            'capturedAt': row.locationCapturedAt,
            'placeName': row.locationPlaceName,
          },
        'categories': categories,
        'payees': payees,
      };

      final res = await Dio().post<Map<String, dynamic>>(
        '${config.baseUrl}/v1/ai/sms/enrich',
        data: body,
        options: Options(
          headers: {
            if (config.apiKey != null && config.apiKey!.isNotEmpty)
              'x-api-key': config.apiKey,
            'content-type': 'application/json',
            'accept': 'application/json',
          },
          connectTimeout: const Duration(seconds: 8),
          receiveTimeout: const Duration(seconds: 30),
        ),
      );
      final payload = res.data;
      final candidate = payload?['candidate'];
      if (candidate is! Map<String, dynamic>) {
        // Server returned a malformed body — don't retry forever; drop
        // and surface via the status column.
        log.w('enrichment: server response missing candidate, dropping');
        await _markStatus(db, smsId, 'error');
        return true;
      }

      final enrichedJson = jsonEncode(candidate);
      final at = DateTime.now().millisecondsSinceEpoch;
      await (db.update(db.smsMessages)..where((t) => t.id.equals(smsId))).write(
        SmsMessagesCompanion(
          enrichmentStatus: const Value('enriched'),
          enrichedCandidateJson: Value(enrichedJson),
          enrichedAt: Value(at),
        ),
      );

      final amountCents =
          (candidate['amount_cents'] as num?)?.toInt() ??
          (candidateJson?['amount_cents'] as num?)?.toInt() ??
          0;
      final payee = candidate['payee'] as String?;
      final catId = (candidate['category_id'] as String?)?.trim();
      String? categoryName;
      if (catId != null && catId.isNotEmpty) {
        for (final c in categories) {
          if (c['id'] == catId) {
            categoryName = c['name'];
            break;
          }
        }
      }
      categoryName ??= (candidate['category_hint'] as String?);

      await Future.wait([
        if (row.linkedTransactionId != null)
          _propagateToTransaction(
            db: db,
            transactionId: row.linkedTransactionId!,
            candidate: candidate,
            note: note,
          ),
        NotificationService.instance.showEnrichedSummary(
          smsRowId: smsId,
          amountCents: amountCents,
          payee: payee,
          categoryName: categoryName,
        ),
      ]);

      return true;
    } catch (e, st) {
      log.w('enrichment failed for $smsId: $e\n$st');
      await _markStatus(db, smsId, 'error');
      return false;
    } finally {
      await db.close();
    }
  }

  /// Push the enriched payee/category/note onto the SMS-origin transaction so
  /// the device's Activity row shows it (and the homelab gets it on the next
  /// sync push). Category/payee only fill when empty (never override a set
  /// category), but the user's note is the whole point of the reply — it's
  /// always written to the transaction's notes.
  static Future<void> _propagateToTransaction({
    required AppDatabase db,
    required String transactionId,
    required Map<String, dynamic> candidate,
    String? note,
  }) async {
    final txn = await (db.select(
      db.transactions,
    )..where((t) => t.id.equals(transactionId))).getSingleOrNull();
    if (txn == null) return;

    final categoryId = (candidate['category_id'] as String?)?.trim();
    final payeeName = (candidate['payee'] as String?)?.trim();
    // The server returns a cleaned `notes`; fall back to the raw user note.
    final serverNote = (candidate['notes'] as String?)?.trim();
    final noteText = (serverNote != null && serverNote.isNotEmpty)
        ? serverNote
        : note?.trim();

    final wantsCategory =
        categoryId != null &&
        categoryId.isNotEmpty &&
        (txn.categoryId == null || txn.categoryId!.isEmpty);
    final wantsPayee =
        payeeName != null &&
        payeeName.isNotEmpty &&
        txn.payeeId == null &&
        (txn.payeeName == null || txn.payeeName!.isEmpty);
    final wantsNote = noteText != null && noteText.isNotEmpty;

    if (!wantsCategory && !wantsPayee && !wantsNote) return;

    final changes = ChangeLogWriter(db);
    String? resolvedPayeeId;
    if (wantsPayee) {
      resolvedPayeeId = await PayeeRepository(
        db,
        changes: changes,
      ).ensure(payeeName);
    }

    await TransactionRepository(db, changes: changes).update(
      transactionId,
      categoryId: wantsCategory ? categoryId : TransactionRepository.unset,
      payeeId: resolvedPayeeId ?? TransactionRepository.unset,
      payeeName: wantsPayee ? payeeName : TransactionRepository.unset,
      notes: wantsNote ? noteText : TransactionRepository.unset,
    );
  }

  static Future<void> _markStatus(
    AppDatabase db,
    int smsId,
    String status,
  ) async {
    try {
      await (db.update(db.smsMessages)..where((t) => t.id.equals(smsId))).write(
        SmsMessagesCompanion(enrichmentStatus: Value(status)),
      );
    } catch (e) {
      log.w('enrichment: failed to write status=$status for $smsId: $e');
    }
  }

  static Future<_ServerConfig?> _readServerConfig() async {
    final store = SecureStore(storage: const FlutterSecureStorage());
    final url = (await store.readSyncBaseUrl())?.trim();
    if (url == null || url.isEmpty) return null;
    final key = (await store.readSyncApiKey())?.trim();
    return _ServerConfig(
      baseUrl: url.endsWith('/') ? url.substring(0, url.length - 1) : url,
      apiKey: key == null || key.isEmpty ? null : key,
    );
  }

  static Future<List<Map<String, String>>> _categoryLibrary(
    AppDatabase db,
  ) async {
    final rows = await (db.select(
      db.categories,
    )..where((c) => c.hidden.equals(false))).get();
    return rows
        .map((c) => {'id': c.id, 'name': c.name})
        .toList(growable: false);
  }

  static Future<List<Map<String, dynamic>>> _payeeLibrary(
    AppDatabase db,
  ) async {
    final rows = await db.select(db.payees).get();
    return rows
        .map<Map<String, dynamic>>((p) => {'id': p.id, 'name': p.name})
        .toList(growable: false);
  }
}

class _ServerConfig {
  const _ServerConfig({required this.baseUrl, this.apiKey});
  final String baseUrl;
  final String? apiKey;
}
