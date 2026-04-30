import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../db/database.dart';
import '../../state/providers.dart';
import 'classifier.dart';
import 'parser_registry.dart';
import 'sms_models.dart';
import 'sms_reader.dart';

/// Glue: SMS reader → classifier → parser → store.
class SmsPipeline {
  SmsPipeline({required this.db, required this.reader});

  final AppDatabase db;
  final SmsReader reader;

  StreamSubscription<IncomingSms>? _sub;

  Future<int> backfill({Duration window = const Duration(days: 90)}) async {
    final since = DateTime.now().subtract(window);
    final messages = await reader.backfill(since: since);
    var added = 0;
    for (final m in messages) {
      if (await _ingest(m)) added += 1;
    }
    log.i('sms backfill ingested $added/${messages.length}');
    return added;
  }

  void startListening() {
    if (_sub != null) return;
    _sub = reader.listen().listen((m) async {
      await _ingest(m);
    });
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }

  Future<bool> _ingest(IncomingSms sms) async {
    if (sms.id != null) {
      final existing = await (db.select(db.smsMessages)
            ..where((t) => t.androidId.equals(sms.id!)))
          .getSingleOrNull();
      if (existing != null) return false;
    }
    final cls = SmsClassifier.classify(sms);
    if (cls == SmsClassification.nonTransactional) {
      await db.into(db.smsMessages).insert(
            SmsMessagesCompanion.insert(
              androidId: Value(sms.id),
              address: sms.address,
              body: sms.body,
              receivedAt: sms.receivedAt.millisecondsSinceEpoch,
              classifiedAs: const Value('non_transactional'),
            ),
          );
      return false;
    }

    final candidate = ParserRegistry.tryParse(sms);
    final candidateJson = candidate == null
        ? null
        : jsonEncode({
            'amount_cents': candidate.amountCents,
            'is_income': candidate.isIncome,
            'date': candidate.date.toIso8601String(),
            'payee': candidate.payee,
            'account_hint': candidate.accountHint,
            'bank_ref': candidate.bankRef,
            'confidence': candidate.confidence,
          });
    final status = candidate == null ? 'error' : 'inbox';
    await db.into(db.smsMessages).insert(
          SmsMessagesCompanion.insert(
            androidId: Value(sms.id),
            address: sms.address,
            body: sms.body,
            receivedAt: sms.receivedAt.millisecondsSinceEpoch,
            classifiedAs: Value(cls == SmsClassification.transactionalHigh
                ? 'transactional'
                : 'transactional'),
            parserVersion: Value(candidate?.parserVersion),
            candidateJson: Value(candidateJson),
            candidateStatus: Value(status),
          ),
        );
    return candidate != null;
  }
}

final Provider<SmsPipeline> smsPipelineProvider = Provider<SmsPipeline>((ref) {
  return SmsPipeline(
    db: ref.watch(dbProvider),
    reader: ref.watch(smsReaderProvider),
  );
});
