import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
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

class SmsScanState {
  const SmsScanState({
    required this.running,
    required this.label,
    required this.processed,
    required this.total,
    required this.added,
  });

  const SmsScanState.idle()
    : running = false,
      label = '',
      processed = 0,
      total = 0,
      added = 0;

  final bool running;
  final String label;
  final int processed;
  final int total;
  final int added;

  double? get progress => total <= 0 ? null : processed / total;

  String get message {
    if (!running) return '';
    if (total <= 0) return label;
    return '$label · $processed/$total checked · $added new';
  }
}

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
  // Test seam — bypasses the real plugin in pipeline tests.
  final Future<void> Function({
    required int smsRowId,
    required int amountCents,
    required String? payee,
    String? accountHint,
  })?
  notifyInboxCandidate;

  /// Required for auto-confirm and dedupe. Optional so existing tests
  /// that exercise pipeline-only behaviour stay green.
  final TransactionRepository? transactionRepo;
  final Prefs? prefs;

  StreamSubscription<IncomingSms>? _sub;
  int _generation = 0;
  bool _scanRunning = false;
  bool _disposed = false;
  final Set<String> _inFlightSmsKeys = <String>{};
  final ValueNotifier<SmsScanState> scanState = ValueNotifier<SmsScanState>(
    const SmsScanState.idle(),
  );

  void _updateScanState(SmsScanState state) {
    if (!_disposed) scanState.value = state;
  }

  Future<int> backfill({
    Duration window = const Duration(days: 7),
    String label = 'Scanning SMS',
    bool showProgress = true,
  }) async {
    if (_scanRunning) return 0;
    _scanRunning = true;
    final generation = _generation;
    try {
      if (showProgress) {
        _updateScanState(
          SmsScanState(
            running: true,
            label: label,
            processed: 0,
            total: 0,
            added: 0,
          ),
        );
      }
      final since = DateTime.now().subtract(window);
      final queued = await reader.drainBackgroundQueue();
      if (generation != _generation) return 0;
      final messages = [
        ...queued.where((m) => m.receivedAt.isAfter(since)),
        ...await reader.backfill(since: since),
      ];
      var added = 0;
      if (showProgress) {
        _updateScanState(
          SmsScanState(
            running: true,
            label: label,
            processed: 0,
            total: messages.length,
            added: 0,
          ),
        );
      }
      for (var i = 0; i < messages.length; i++) {
        if (generation != _generation) break;
        final parsed = await _safeIngest(messages[i], generation: generation)
            .timeout(
              const Duration(seconds: 25),
              onTimeout: () {
                log.w('sms ingest timed out for ${messages[i].address}');
                return false;
              },
            );
        if (parsed) added += 1;
        if (showProgress) {
          _updateScanState(
            SmsScanState(
              running: true,
              label: label,
              processed: i + 1,
              total: messages.length,
              added: added,
            ),
          );
        }
      }
      log.i('sms backfill ingested $added/${messages.length}');
      return added;
    } finally {
      _scanRunning = false;
      if (showProgress) _updateScanState(const SmsScanState.idle());
    }
  }

  Future<int> catchUpRecent({
    Duration window = const Duration(days: 2),
    bool showProgress = false,
  }) {
    return backfill(
      window: window,
      label: 'Checking recent SMS',
      showProgress: showProgress,
    );
  }

  void startListening({bool drainQueued = true}) {
    if (_sub != null) return;
    final generation = _generation;
    if (drainQueued) {
      reader.drainBackgroundQueue().then((messages) async {
        if (generation != _generation) return;
        for (final message in messages) {
          if (generation != _generation) break;
          await _safeIngest(message, generation: generation);
        }
      });
    }
    _sub = reader.listen().listen((m) async {
      await _safeIngest(m, generation: generation);
    });
    unawaited(catchUpRecent());
  }

  /// Each message is parsed independently — the LLM, the network, or
  /// the SQLite write can fail mid-scan. We log and move on so one bad
  /// SMS does not abort the rest of a backfill or kill the live
  /// listener for the rest of the session.
  Future<bool> _safeIngest(IncomingSms sms, {int? generation}) async {
    if (generation != null && generation != _generation) return false;
    final key = _smsKey(sms);
    if (!_inFlightSmsKeys.add(key)) return false;
    try {
      return await _ingest(sms, generation: generation);
    } catch (e, st) {
      log.w('sms ingest failed for ${sms.address}', error: e, stackTrace: st);
      return false;
    } finally {
      _inFlightSmsKeys.remove(key);
    }
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }

  Future<void> dispose() async {
    _disposed = true;
    _generation += 1;
    await stop();
    scanState.dispose();
  }

  Future<void> clearStoredState() async {
    _generation += 1;
    await stop();
    await reader.clearBackgroundQueue();
    await db.customStatement('DELETE FROM sms_parse_cache');
    await db.customStatement('DELETE FROM sms_messages');
  }

  Future<int> retryFailedBackfill({
    Duration window = const Duration(days: 14),
  }) async {
    final cutoff = DateTime.now().subtract(window).millisecondsSinceEpoch;
    await db.customStatement('DELETE FROM sms_parse_cache');
    await db.customStatement(
      "DELETE FROM sms_messages WHERE candidate_status IN ('error', 'none', 'duplicate') AND received_at >= ?",
      [cutoff],
    );
    return backfill(window: window, label: 'Refreshing SMS');
  }

  Future<int> retryFailuresAndRescan({
    Duration minimumWindow = const Duration(days: 7),
  }) async {
    final oldest =
        await (db.select(db.smsMessages)
              ..where((t) => t.candidateStatus.equals('error'))
              ..orderBy([(t) => OrderingTerm.asc(t.receivedAt)])
              ..limit(1))
            .getSingleOrNull();
    if (oldest == null) {
      return retryFailedBackfill(window: minimumWindow);
    }

    final oldestAt = DateTime.fromMillisecondsSinceEpoch(oldest.receivedAt);
    final failureWindow =
        DateTime.now().difference(oldestAt) + const Duration(days: 1);
    final window = failureWindow > minimumWindow
        ? failureWindow
        : minimumWindow;
    final cutoff = DateTime.now().subtract(window).millisecondsSinceEpoch;

    await db.customStatement('DELETE FROM sms_parse_cache');
    await db.customStatement(
      "DELETE FROM sms_messages WHERE candidate_status IN ('error', 'none', 'duplicate') AND received_at >= ?",
      [cutoff],
    );
    return backfill(window: window, label: 'Retrying failed SMS');
  }

  Future<bool> _ingest(IncomingSms sms, {int? generation}) async {
    if (generation != null && generation != _generation) return false;
    final existingQuery = db.select(db.smsMessages)
      ..where(
        (t) =>
            (sms.id == null
                ? const Constant(false)
                : t.androidId.equals(sms.id!)) |
            (t.address.equals(sms.address) & t.body.equals(sms.body)) |
            (t.address.equals(sms.address) &
                t.body.equals(sms.body) &
                t.receivedAt.equals(sms.receivedAt.millisecondsSinceEpoch)),
      );
    if (await existingQuery.getSingleOrNull() != null) return false;
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
      // Let the event loop drain so Drift's watch fires and the
      // Inbox UI updates before the next SMS is ingested. Without
      // this, non-transactional SMS process in a tight synchronous
      // loop and all batched rows surface at once.
      await Future<void>.delayed(Duration.zero);
      return false;
    }

    final candidate = await parserRegistry.tryParse(sms);
    if (generation != null && generation != _generation) return false;
    final candidateJson = candidate == null
        ? null
        : jsonEncode({
            'amount_cents': candidate.amountCents,
            'is_income': candidate.isIncome,
            'date': candidate.date.toIso8601String(),
            'payee': candidate.payee,
            'account_hint': candidate.accountHint,
            'category_hint': candidate.categoryHint,
            'category_id': candidate.categoryId,
            'bank_ref': candidate.bankRef,
            'confidence': candidate.confidence,
          });
    if (candidate != null &&
        await _hasDuplicateSmsCandidate(sms, candidate, candidateJson!)) {
      return false;
    }

    String status;
    String? linkedTransactionId;
    var notify = _NotifyKind.none;

    if (candidate == null) {
      status = 'error';
    } else {
      final dupId = await _findDuplicateTransaction(candidate);
      if (dupId != null) {
        status = 'duplicate';
        linkedTransactionId = dupId;
      } else if (await _shouldAutoConfirm(candidate)) {
        if (generation != null && generation != _generation) return false;
        try {
          linkedTransactionId = await _autoCreateTransaction(candidate, sms);
          status = 'accepted';
          notify = _NotifyKind.autoConfirmed;
        } catch (e) {
          log.w('auto-confirm failed, falling back to inbox: $e');
          status = 'inbox';
          notify = _NotifyKind.highConfidence;
        }
      } else {
        status = 'inbox';
        if (candidate.confidence >= 0.8) notify = _NotifyKind.highConfidence;
      }
    }

    if (generation != null && generation != _generation) return false;
    final smsRowId = await db
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

    if (candidate != null && notify == _NotifyKind.highConfidence) {
      final fn = notifyInboxCandidate ?? notifications?.showInboxCandidate;
      await fn?.call(
        smsRowId: smsRowId,
        amountCents: candidate.amountCents,
        payee: candidate.payee,
        accountHint: candidate.accountHint,
      );
    } else if (candidate != null && notify == _NotifyKind.autoConfirmed) {
      await notifications?.showAutoConfirmed(
        smsRowId: smsRowId,
        amountCents: candidate.amountCents,
        payee: candidate.payee,
        accountHint: candidate.accountHint,
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

  static String _smsKey(IncomingSms sms) {
    final address = sms.address.trim().toLowerCase();
    final body = sms.body.replaceAll(RegExp(r'\s+'), ' ').trim();
    return '$address|$body';
  }

  Future<bool> _hasDuplicateSmsCandidate(
    IncomingSms sms,
    SmsCandidate candidate,
    String candidateJson,
  ) async {
    final key = _candidateDedupeKey(candidate);
    final windowStart = sms.receivedAt
        .subtract(const Duration(minutes: 10))
        .millisecondsSinceEpoch;
    final windowEnd = sms.receivedAt
        .add(const Duration(minutes: 10))
        .millisecondsSinceEpoch;
    final recent =
        await (db.select(db.smsMessages)..where(
              (t) =>
                  t.address.equals(sms.address) &
                  t.candidateJson.isNotNull() &
                  t.receivedAt.isBiggerOrEqualValue(windowStart) &
                  t.receivedAt.isSmallerOrEqualValue(windowEnd),
            ))
            .get();
    for (final row in recent) {
      if (row.candidateJson == candidateJson) return true;
      final rowKey = _candidateJsonDedupeKey(row.candidateJson);
      if (rowKey != null && rowKey == key) return true;
    }
    return false;
  }

  static String _candidateDedupeKey(SmsCandidate c) {
    return [
      c.isIncome ? 'in' : 'out',
      c.amountCents.toString(),
      _dayKey(c.date),
      _normalizeKeyPart(c.bankRef),
      _normalizeKeyPart(c.payee),
      _normalizeKeyPart(c.accountHint),
    ].join('|');
  }

  static String? _candidateJsonDedupeKey(String? candidateJson) {
    if (candidateJson == null || candidateJson.isEmpty) return null;
    try {
      final j = jsonDecode(candidateJson) as Map<String, dynamic>;
      final amount = (j['amount_cents'] as num?)?.toInt();
      final date = DateTime.tryParse(j['date'] as String? ?? '');
      if (amount == null || date == null) return null;
      return [
        (j['is_income'] as bool? ?? false) ? 'in' : 'out',
        amount.toString(),
        _dayKey(date),
        _normalizeKeyPart(j['bank_ref'] as String?),
        _normalizeKeyPart(j['payee'] as String?),
        _normalizeKeyPart(j['account_hint'] as String?),
      ].join('|');
    } catch (_) {
      return null;
    }
  }

  static String _dayKey(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  static String _normalizeKeyPart(String? value) {
    return (value ?? '').toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();
  }
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
  ref.onDispose(() {
    unawaited(pipeline.dispose());
  });
  return pipeline;
});

enum _NotifyKind { none, highConfidence, autoConfirmed }
