import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'account_matcher.dart';
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
      // Parse everything we just queued via the server.
      if (generation == _generation) await drainPendingParses(limit: 200);
      return added;
    } finally {
      _scanRunning = false;
      if (showProgress) _updateScanState(const SmsScanState.idle());
    }
  }

  /// Background-isolate entry point: drains only the broadcast-receiver
  /// queue (SharedPreferences-backed, populated by [gullakBackgroundSmsHandler])
  /// and ingests those SMS. Deliberately does NOT query the telephony plugin,
  /// which isn't reliable off the main isolate — the periodic WorkManager
  /// task uses this so SMS received while the app is closed get parsed
  /// without waiting for the next foreground open. Returns the count ingested.
  Future<int> ingestBackgroundQueue() async {
    final queued = await reader.drainBackgroundQueue();
    var added = 0;
    for (final m in queued) {
      if (await _safeIngest(m)) added += 1;
    }
    if (queued.isNotEmpty) {
      log.i('sms bg-queue ingested $added/${queued.length}');
    }
    // Send everything we just captured (and any earlier stragglers) to the
    // server. Safe to call even when nothing was queued — it just no-ops.
    await drainPendingParses(limit: 200);
    return added;
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
      final queued = await _safeIngest(m, generation: generation);
      // A live SMS is captured then immediately sent to the server.
      if (queued && generation == _generation) {
        await drainPendingParses(limit: 10);
      }
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

  /// Re-queue parses that previously failed (no row deletion — the old code
  /// deleted rows, which lost the captured SMS). Resets parse_failed/legacy
  /// error rows back to `pending_parse`, clears backoff, rescans recent SMS to
  /// capture any missed, then drains the queue against the server.
  Future<int> retryFailedBackfill({
    Duration window = const Duration(days: 14),
  }) async {
    await db.customStatement(
      "UPDATE sms_messages SET candidate_status = 'pending_parse', "
      'parse_attempt_count = 0, next_parse_after = NULL, last_parse_error = NULL '
      "WHERE candidate_status IN ('parse_failed', 'error')",
    );
    final added = await backfill(window: window, label: 'Refreshing SMS');
    await drainPendingParses(limit: 500);
    return added;
  }

  /// Alias retained for existing callers — same reset-and-drain behaviour.
  Future<int> retryFailuresAndRescan({
    Duration minimumWindow = const Duration(days: 7),
  }) => retryFailedBackfill(window: minimumWindow);

  /// Capture-only. Classifies the SMS and, if it looks transactional, queues
  /// it as `pending_parse` for the server-parse drainer. There is NO on-device
  /// parsing or transaction creation here — that all happens in
  /// [drainPendingParses] after the pi-server answers. Returns true when a row
  /// was queued for parsing.
  Future<bool> _ingest(IncomingSms sms, {int? generation}) async {
    if (generation != null && generation != _generation) return false;
    final stableId = stableSmsId(sms);
    final existing =
        await (db.select(db.smsMessages)..where(
              (t) =>
                  t.stableSmsId.equals(stableId) |
                  (sms.id == null
                      ? const Constant(false)
                      : t.androidId.equals(sms.id!)) |
                  (t.address.equals(sms.address) & t.body.equals(sms.body)),
            ))
            .getSingleOrNull();
    if (existing != null) return false;
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
              stableSmsId: Value(stableId),
            ),
          );
      // Let the event loop drain so Drift's watch fires and the Inbox UI
      // updates before the next SMS is ingested.
      await Future<void>.delayed(Duration.zero);
      return false;
    }
    await db
        .into(db.smsMessages)
        .insert(
          SmsMessagesCompanion.insert(
            androidId: Value(sms.id),
            address: sms.address,
            body: sms.body,
            receivedAt: sms.receivedAt.millisecondsSinceEpoch,
            classifiedAs: const Value('transactional'),
            candidateStatus: const Value('pending_parse'),
            stableSmsId: Value(stableId),
          ),
        );
    return true;
  }

  /// Stable idempotency key for an SMS — also the created transaction's
  /// originRef, so a retried parse can never double-create. Prefers the
  /// platform SMS id; falls back to a deterministic content hash.
  static String stableSmsId(IncomingSms sms) {
    if (sms.id != null && sms.id!.isNotEmpty) return 'android:${sms.id}';
    final material =
        '${sms.address}|${sms.receivedAt.millisecondsSinceEpoch}|${sms.body}';
    return 'body:${_fnv1a(material)}';
  }

  // FNV-1a 64-bit (hex). Deterministic across runs/isolates — unlike
  // String.hashCode — so it's safe to persist as an idempotency key.
  static String _fnv1a(String s) {
    var hash = 0xcbf29ce484222325;
    const prime = 0x100000001b3;
    for (final b in s.codeUnits) {
      hash ^= b & 0xff;
      hash = (hash * prime) & 0xFFFFFFFFFFFFFFFF;
    }
    return hash.toUnsigned(64).toRadixString(16).padLeft(16, '0');
  }

  /// Drains the server-parse queue. For each due `pending_parse` SMS, send it
  /// to the pi-server. A network failure requeues it with exponential backoff
  /// (never lost); a server answer routes to a terminal state. On a clean parse
  /// with a resolvable account + category the transaction is auto-created;
  /// otherwise it lands in the Inbox for one-tap review.
  Future<int> drainPendingParses({int limit = 25}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final due =
        await (db.select(db.smsMessages)
              ..where(
                (t) =>
                    t.candidateStatus.equals('pending_parse') &
                    (t.nextParseAfter.isNull() |
                        t.nextParseAfter.isSmallerOrEqualValue(now)),
              )
              ..orderBy([(t) => OrderingTerm.asc(t.receivedAt)])
              ..limit(limit))
            .get();
    var processed = 0;
    for (final row in due) {
      // Claim the row so a concurrent drain can't double-send it.
      final claimed =
          await (db.update(db.smsMessages)..where(
                (t) =>
                    t.id.equals(row.id) &
                    t.candidateStatus.equals('pending_parse'),
              ))
              .write(
                const SmsMessagesCompanion(
                  candidateStatus: Value('parsing'),
                ),
              );
      if (claimed == 0) continue;
      final sms = IncomingSms(
        id: row.androidId,
        address: row.address,
        body: row.body,
        receivedAt: DateTime.fromMillisecondsSinceEpoch(row.receivedAt),
      );
      try {
        final outcome = await parserRegistry.parse(sms);
        switch (outcome.status) {
          case SmsParseStatus.transaction:
            await _applyParsed(row, sms, outcome.candidate!);
          case SmsParseStatus.notATxn:
            await _markParsedStatus(row.id, 'not_a_txn');
          case SmsParseStatus.parseFailed:
            await _markParsedStatus(
              row.id,
              'parse_failed',
              error: 'server could not parse this SMS',
            );
        }
        processed += 1;
      } catch (e) {
        // Transport failure: server unreachable / not configured yet. Keep the
        // SMS queued and back off so it parses once the server is reachable.
        final attempt = row.parseAttemptCount + 1;
        await (db.update(db.smsMessages)..where((t) => t.id.equals(row.id)))
            .write(
              SmsMessagesCompanion(
                candidateStatus: const Value('pending_parse'),
                parseAttemptCount: Value(attempt),
                nextParseAfter: Value(now + _backoffMs(attempt)),
                lastParseError: Value(e.toString()),
              ),
            );
      }
    }
    return processed;
  }

  // min(6h, 2^attempt · 5min) + small deterministic jitter (no RNG so tests
  // stay reproducible).
  static int _backoffMs(int attempt) {
    const fiveMin = 5 * 60 * 1000;
    const sixHours = 6 * 60 * 60 * 1000;
    final base = fiveMin * (1 << attempt.clamp(0, 10));
    final capped = base > sixHours ? sixHours : base;
    return capped + (attempt * 9973) % 30000;
  }

  Future<void> _markParsedStatus(
    int rowId,
    String status, {
    String? error,
  }) async {
    await (db.update(db.smsMessages)..where((t) => t.id.equals(rowId))).write(
      SmsMessagesCompanion(
        candidateStatus: Value(status),
        parsedAt: Value(DateTime.now().millisecondsSinceEpoch),
        lastParseError: Value(error),
      ),
    );
  }

  /// Applies a successful server parse: dedupes, then either auto-creates the
  /// transaction (Option A: amount + account + category all resolved) or routes
  /// to the Inbox as `parsed` for one-tap review.
  Future<void> _applyParsed(
    SmsRow row,
    IncomingSms sms,
    SmsCandidate candidate,
  ) async {
    final candidateJson = jsonEncode({
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
    final now = DateTime.now().millisecondsSinceEpoch;
    final stableId = row.stableSmsId ?? stableSmsId(sms);

    // Idempotency: if a transaction already exists for this exact SMS (a prior
    // run created it before we recorded the status), link to it, never recreate.
    final existingTxn =
        await (db.select(db.transactions)..where(
              (t) => t.origin.equals('sms') & t.originRef.equals(stableId),
            ))
            .getSingleOrNull();
    String status;
    String? linkedTxnId = existingTxn?.id;
    var autoCreated = false;
    if (existingTxn != null) {
      status = 'accepted';
    } else {
      // Link (don't double-count) if a non-SMS txn, or a recently-parsed sibling
      // SMS (bank + card double-alert), already covers this spend.
      final dupId = await _findDuplicateTransaction(candidate);
      final siblingDup = await _hasDuplicateSmsCandidate(
        sms,
        candidate,
        candidateJson,
      );
      if (dupId != null || siblingDup) {
        status = 'duplicate';
        linkedTxnId = dupId;
      } else if (candidate.categoryId != null &&
          candidate.categoryId!.isNotEmpty) {
        // Try to auto-create. _autoCreateTransaction throws when the account is
        // ambiguous, which falls through to the Inbox (never a guessed account).
        try {
          linkedTxnId = await _autoCreateTransaction(
            candidate,
            stableId,
            sms.address,
          );
          status = 'accepted';
          autoCreated = true;
        } catch (e) {
          log.i('sms auto-create deferred to inbox: $e');
          status = 'parsed';
        }
      } else {
        // No category resolved → Inbox for review.
        status = 'parsed';
      }
    }

    await (db.update(db.smsMessages)..where((t) => t.id.equals(row.id))).write(
      SmsMessagesCompanion(
        candidateStatus: Value(status),
        candidateJson: Value(candidateJson),
        parserVersion: Value(candidate.parserVersion),
        linkedTransactionId: Value(linkedTxnId),
        parsedAt: Value(now),
      ),
    );

    // Notify either way so nothing is logged invisibly.
    if (autoCreated) {
      await notifications?.showAutoConfirmed(
        smsRowId: row.id,
        amountCents: candidate.amountCents,
        payee: candidate.payee,
        accountHint: candidate.accountHint,
      );
    } else if (status == 'parsed') {
      final fn = notifyInboxCandidate ?? notifications?.showInboxCandidate;
      await fn?.call(
        smsRowId: row.id,
        amountCents: candidate.amountCents,
        payee: candidate.payee,
        accountHint: candidate.accountHint,
      );
    }
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
    String originRef,
    String address,
  ) async {
    final accounts = await (db.select(
      db.accounts,
    )..where((a) => a.archived.equals(false))).get();
    if (accounts.isEmpty) {
      throw StateError('no accounts available for auto-confirm');
    }
    final matchedAcct = matchAccountHint(
      candidate.accountHint,
      accounts.map((a) => (id: a.id, name: a.name, kind: a.kind)).toList(),
    );
    // Never silently auto-confirm onto a guessed account. If the bank can't
    // be identified (and there's more than one account to choose from), throw
    // so the caller leaves this SMS in the Inbox for manual account selection.
    final acctId =
        matchedAcct ?? (accounts.length == 1 ? accounts.first.id : null);
    if (acctId == null) {
      throw StateError(
        'ambiguous account for SMS (hint="${candidate.accountHint}"); '
        'routing to inbox for review',
      );
    }
    final signed = candidate.isIncome
        ? candidate.amountCents.abs()
        : -candidate.amountCents.abs();
    return transactionRepo!.create(
      accountId: acctId,
      categoryId: candidate.categoryId,
      payeeName: candidate.payee,
      amountCents: signed,
      date: candidate.date,
      notes: 'SMS · $address',
      origin: 'sms',
      originRef: originRef,
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

