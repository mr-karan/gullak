import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../core/notification_service.dart';
import '../../core/prefs.dart';
import '../../features/transactions/data/transaction_repository.dart';
import '../../state/providers.dart';
import '../db/database.dart';
import 'classifier.dart';
import 'parser_registry.dart';
import 'sms_models.dart';
import 'sms_reader.dart';

/// Glue: SMS reader → classifier → parser → store.
class SmsPipeline {
  SmsPipeline({
    required this.db,
    required this.reader,
    required this.parserRegistry,
    this.notifications,
    this.notifyInboxCandidate,
    this.transactionRepo,
    this.prefs,
  });

  final AppDatabase db;
  final SmsReader reader;
  final ParserRegistry parserRegistry;
  final NotificationService? notifications;
  final Future<void> Function({
    required int amountCents,
    required String? payee,
  })?
  notifyInboxCandidate;

  /// Required for auto-confirm and dedupe. Optional so existing tests
  /// that exercise pipeline-only behaviour stay green.
  final TransactionRepository? transactionRepo;
  final Prefs? prefs;

  StreamSubscription<IncomingSms>? _sub;

  Future<int> backfill({Duration window = const Duration(days: 90)}) async {
    final since = DateTime.now().subtract(window);
    final queued = await reader.drainBackgroundQueue();
    final messages = [
      ...queued.where((m) => m.receivedAt.isAfter(since)),
      ...await reader.backfill(since: since),
    ];
    var added = 0;
    for (final m in messages) {
      if (await _safeIngest(m)) added += 1;
    }
    log.i('sms backfill ingested $added/${messages.length}');
    return added;
  }

  void startListening() {
    if (_sub != null) return;
    reader.drainBackgroundQueue().then((messages) async {
      for (final message in messages) {
        await _safeIngest(message);
      }
    });
    _sub = reader.listen().listen((m) async {
      await _safeIngest(m);
    });
  }

  /// Each message is parsed independently — the LLM, the network, or
  /// the SQLite write can fail mid-scan. We log and move on so one bad
  /// SMS does not abort the rest of a 90-day backfill or kill the live
  /// listener for the rest of the session.
  Future<bool> _safeIngest(IncomingSms sms) async {
    try {
      return await _ingest(sms);
    } catch (e, st) {
      log.w('sms ingest failed for ${sms.address}', error: e, stackTrace: st);
      return false;
    }
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }

  Future<bool> _ingest(IncomingSms sms) async {
    if (sms.id != null) {
      final existing = await (db.select(
        db.smsMessages,
      )..where((t) => t.androidId.equals(sms.id!))).getSingleOrNull();
      if (existing != null) return false;
    }
    final cls = SmsClassifier.classify(sms);
    if (cls == SmsClassification.nonTransactional) {
      await db
          .into(db.smsMessages)
          .insert(
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

    final candidate = await parserRegistry.tryParse(sms);
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

    String status;
    String? linkedTransactionId;
    var notifyHighConfidence = false;

    if (candidate == null) {
      status = 'error';
    } else {
      final dupId = await _findDuplicateTransaction(candidate);
      if (dupId != null) {
        status = 'duplicate';
        linkedTransactionId = dupId;
      } else if (await _shouldAutoConfirm(candidate)) {
        try {
          linkedTransactionId = await _autoCreateTransaction(candidate, sms);
          status = 'accepted';
        } catch (e) {
          log.w('auto-confirm failed, falling back to inbox: $e');
          status = 'inbox';
          notifyHighConfidence = true;
        }
      } else {
        status = 'inbox';
        notifyHighConfidence = candidate.confidence >= 0.8;
      }
    }

    await db
        .into(db.smsMessages)
        .insert(
          SmsMessagesCompanion.insert(
            androidId: Value(sms.id),
            address: sms.address,
            body: sms.body,
            receivedAt: sms.receivedAt.millisecondsSinceEpoch,
            classifiedAs: Value(
              cls == SmsClassification.transactionalHigh
                  ? 'transactional'
                  : 'transactional',
            ),
            parserVersion: Value(candidate?.parserVersion),
            candidateJson: Value(candidateJson),
            candidateStatus: Value(status),
            linkedTransactionId: Value(linkedTransactionId),
          ),
        );

    if (notifyHighConfidence && candidate != null) {
      final notify = notifyInboxCandidate ?? notifications?.showInboxCandidate;
      await notify?.call(
        amountCents: candidate.amountCents,
        payee: candidate.payee,
      );
    }
    return candidate != null;
  }

  Future<bool> _shouldAutoConfirm(SmsCandidate candidate) async {
    if (transactionRepo == null || prefs == null) return false;
    if (!prefs!.smsAutoConfirm) return false;
    return candidate.confidence >= prefs!.smsAutoConfirmThreshold;
  }

  /// Look for an existing non-SMS transaction matching this candidate
  /// (same signed amount, within ±1 day). Returns the transaction id
  /// if a match is found so the SMS row can link to it instead of
  /// double-counting.
  Future<String?> _findDuplicateTransaction(SmsCandidate candidate) async {
    final signed = candidate.isIncome
        ? candidate.amountCents.abs()
        : -candidate.amountCents.abs();
    final lo = _ymd(candidate.date.subtract(const Duration(days: 1)));
    final hi = _ymd(candidate.date.add(const Duration(days: 1)));
    final matches =
        await (db.select(db.transactions)..where(
              (t) =>
                  t.amountCents.equals(signed) &
                  t.date.isBiggerOrEqualValue(lo) &
                  t.date.isSmallerOrEqualValue(hi) &
                  t.origin.equals('sms').not(),
            ))
            .get();
    if (matches.isEmpty) return null;
    return matches.first.id;
  }

  Future<String> _autoCreateTransaction(
    SmsCandidate candidate,
    IncomingSms sms,
  ) async {
    final accounts = await (db.select(
      db.accounts,
    )..where((a) => a.archived.equals(false))).get();
    if (accounts.isEmpty) {
      throw StateError('no accounts available for auto-confirm');
    }
    String? acctId;
    final hint = candidate.accountHint?.toLowerCase();
    if (hint != null && hint.isNotEmpty) {
      for (final a in accounts) {
        final n = a.name.toLowerCase();
        if (n == hint || n.contains(hint) || hint.contains(n)) {
          acctId = a.id;
          break;
        }
      }
    }
    acctId ??= accounts.first.id;
    final signed = candidate.isIncome
        ? candidate.amountCents.abs()
        : -candidate.amountCents.abs();
    return transactionRepo!.create(
      accountId: acctId,
      payeeName: candidate.payee,
      amountCents: signed,
      date: candidate.date,
      notes: 'SMS · ${sms.address}',
      origin: 'sms',
      originRef: sms.id,
    );
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

final Provider<SmsPipeline> smsPipelineProvider = Provider<SmsPipeline>((ref) {
  final prefs = ref.watch(prefsProvider);
  final pipeline = SmsPipeline(
    db: ref.watch(dbProvider),
    reader: ref.watch(smsReaderProvider),
    parserRegistry: ref.watch(parserRegistryProvider),
    notifications: ref.watch(notificationServiceProvider),
    transactionRepo: ref.watch(transactionRepoProvider),
    prefs: prefs,
  );
  // Re-arm the live listener whenever this provider rebuilds (e.g. after
  // the user updates the LLM API key, which invalidates parserRegistry
  // and therefore this provider). Otherwise rebuild → onDispose → stop()
  // silently kills incoming SMS for the rest of the session.
  if (prefs.smsEnabled) pipeline.startListening();
  ref.onDispose(pipeline.stop);
  return pipeline;
});
