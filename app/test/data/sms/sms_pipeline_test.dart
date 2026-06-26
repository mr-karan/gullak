import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/data/sms/parser_registry.dart';
import 'package:gullak/data/sms/sms_models.dart';
import 'package:gullak/data/sms/sms_parser.dart';
import 'package:gullak/data/sms/sms_pipeline.dart';
import 'package:gullak/data/sms/sms_reader.dart';

// The pipeline is now capture-only: _ingest queues a transactional SMS as
// `pending_parse`, and drainPendingParses() (invoked at the end of backfill /
// bg-queue / live capture) sends it to the server-backed parser. With no
// transactionRepo + no resolved category, a parsed candidate lands in the
// Inbox as `parsed`. A transport failure keeps the SMS queued for retry.

void main() {
  late AppDatabase db;
  late _FakeSmsReader reader;
  late _FakeSmsParser fakeParser;
  late ParserRegistry registry;
  late List<_NotificationCall> notifications;

  SmsPipeline build({void Function(_NotificationCall)? onNotify}) => SmsPipeline(
    db: db,
    reader: reader,
    parserRegistry: registry,
    notifyInboxCandidate:
        ({
          required smsRowId,
          required amountCents,
          required payee,
          accountHint,
        }) async {
          (onNotify ?? notifications.add)(
            _NotificationCall(amountCents, payee, smsRowId),
          );
        },
  );

  SmsCandidate candidate(DateTime date, {String? categoryId}) => SmsCandidate(
    amountCents: 45000,
    isIncome: false,
    date: date,
    confidence: 0.9,
    payee: 'BLINKIT',
    accountHint: 'HDFC Card xx1234',
    categoryId: categoryId,
    parserVersion: 4,
  );

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    reader = _FakeSmsReader();
    fakeParser = _FakeSmsParser();
    registry = ParserRegistry(db: db, parserFuture: Future.value(fakeParser));
    notifications = [];
  });

  tearDown(() => db.close());

  test('transactional SMS is queued then parsed to the Inbox', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    final sms = IncomingSms(
      id: 'hdfc-1',
      address: 'VK-HDFCBK',
      body: 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.',
      receivedAt: receivedAt,
    );
    fakeParser.respondTo(sms.body, candidate(receivedAt));
    reader.backfillMessages = [sms, sms];

    final added = await build().backfill();
    final rows = await db.select(db.smsMessages).get();

    expect(added, 1); // both dedupe to one queued row
    expect(rows, hasLength(1));
    expect(rows.single.androidId, 'hdfc-1');
    expect(rows.single.classifiedAs, 'transactional');
    // No transactionRepo + no category → routed to Inbox as 'parsed'.
    expect(rows.single.candidateStatus, 'parsed');
    expect(rows.single.candidateJson, contains('"amount_cents":45000'));
    expect(rows.single.stableSmsId, 'android:hdfc-1');
    expect(rows.single.parsedAt, isNotNull);
    expect(notifications, hasLength(1));
    expect(notifications.single.payee, 'BLINKIT');
  });

  test('a transport failure keeps the SMS queued for retry', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    final sms = IncomingSms(
      id: 'hdfc-net',
      address: 'VK-HDFCBK',
      body: 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.',
      receivedAt: receivedAt,
    );
    fakeParser.failWith(
      sms.body,
      const SmsServerUnavailable('server unreachable'),
    );
    reader.backfillMessages = [sms];

    await build().backfill();
    final row = (await db.select(db.smsMessages).get()).single;

    expect(row.candidateStatus, 'pending_parse'); // NOT lost, NOT errored
    expect(row.parseAttemptCount, 1);
    expect(row.nextParseAfter, isNotNull);
    expect(row.lastParseError, contains('unreachable'));
    expect(notifications, isEmpty);
  });

  test('not_a_txn from the server is terminal', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    final sms = IncomingSms(
      id: 'hdfc-nt',
      address: 'VK-HDFCBK',
      body: 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.',
      receivedAt: receivedAt,
    );
    fakeParser.respondNotTxn(sms.body);
    reader.backfillMessages = [sms];

    await build().backfill();
    final row = (await db.select(db.smsMessages).get()).single;

    expect(row.candidateStatus, 'not_a_txn');
    expect(row.parsedAt, isNotNull);
    expect(notifications, isEmpty);
  });

  test('dedupes identical sender/body even when Android ids differ', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    const body = 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.';
    fakeParser.respondTo(body, candidate(receivedAt));
    reader.backfillMessages = [
      IncomingSms(
        id: 'hdfc-1',
        address: 'VK-HDFCBK',
        body: body,
        receivedAt: receivedAt,
      ),
      IncomingSms(
        id: 'hdfc-2',
        address: 'VK-HDFCBK',
        body: body,
        receivedAt: receivedAt.add(const Duration(milliseconds: 200)),
      ),
    ];

    final added = await build().backfill();
    expect(added, 1);
    expect(await db.select(db.smsMessages).get(), hasLength(1));
  });

  test('sibling double-alert is linked as duplicate, not double-counted', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    const body1 = 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.';
    const body2 = 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT. ';
    fakeParser
      ..respondTo(body1, candidate(receivedAt))
      ..respondTo(body2, candidate(receivedAt));
    reader.backfillMessages = [
      IncomingSms(
        id: 'hdfc-1',
        address: 'VK-HDFCBK',
        body: body1,
        receivedAt: receivedAt,
      ),
      IncomingSms(
        id: 'hdfc-2',
        address: 'VK-HDFCBK',
        body: body2,
        receivedAt: receivedAt.add(const Duration(seconds: 1)),
      ),
    ];

    await build().backfill();
    final statuses =
        (await db.select(db.smsMessages).get())
            .map((r) => r.candidateStatus)
            .toList()
          ..sort();
    // Both captured (bodies differ), but the second parse is recognised as a
    // sibling of the first and marked duplicate rather than creating a 2nd txn.
    expect(statuses, ['duplicate', 'parsed']);
  });

  test('stores non-transactional SMS without candidate or notification', () async {
    reader.backfillMessages = [
      IncomingSms(
        id: 'otp-1',
        address: 'VM-HDFCBK',
        body: 'OTP 123456 for HDFC Bank login. Do not share it.',
        receivedAt: DateTime.now().subtract(const Duration(hours: 3)),
      ),
    ];

    final added = await build().backfill();
    final rows = await db.select(db.smsMessages).get();

    expect(added, 0);
    expect(rows, hasLength(1));
    expect(rows.single.classifiedAs, 'non_transactional');
    expect(rows.single.candidateStatus, 'none');
    expect(rows.single.candidateJson, isNull);
    expect(notifications, isEmpty);
  });

  test('drains queued background SMS during backfill', () async {
    final queuedAt = DateTime.now().subtract(const Duration(days: 1));
    final queued = IncomingSms(
      id: 'queued-1',
      address: 'AD-HDFCBK',
      body: 'Rs.99.00 debited from HDFC Bank card xx1234 at COFFEE.',
      receivedAt: queuedAt,
    );
    reader
      ..queuedMessages = [queued]
      ..backfillMessages = [
        IncomingSms(
          id: 'old-1',
          address: 'AD-HDFCBK',
          body: 'Rs.100.00 debited from HDFC Bank card xx1234 at OLD.',
          receivedAt: DateTime(2025, 9, 1),
        ),
      ];
    fakeParser.respondTo(
      queued.body,
      SmsCandidate(
        amountCents: 9900,
        isIncome: false,
        date: queuedAt,
        confidence: 0.9,
        payee: 'COFFEE',
        parserVersion: 4,
      ),
    );

    final added = await build().backfill(window: const Duration(days: 30));
    final rows = await db.select(db.smsMessages).get();

    expect(added, 1);
    expect(rows, hasLength(1));
    expect(rows.single.androidId, 'queued-1');
    expect(rows.single.candidateStatus, 'parsed');
  });

  test('live listener and catch-up do not double-ingest the same SMS', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    final sms = IncomingSms(
      id: 'race-1',
      address: 'VK-HDFCBK',
      body: 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.',
      receivedAt: receivedAt,
    );
    fakeParser.respondTo(sms.body, candidate(receivedAt));
    reader.backfillMessages = [sms];
    final pipeline = build();

    pipeline.startListening(drainQueued: false);
    reader.emit(sms);
    await Future<void>.delayed(const Duration(milliseconds: 30));
    final rows = await db.select(db.smsMessages).get();

    expect(rows, hasLength(1));
    expect(rows.single.androidId, 'race-1');
    await pipeline.dispose();
  });
}

class _FakeSmsParser implements SmsParser {
  final Map<String, SmsCandidate> _responses = {};
  final Set<String> _notTxn = {};
  final Map<String, Object> _failures = {};

  void respondTo(String body, SmsCandidate candidate) =>
      _responses[body] = candidate;
  void respondNotTxn(String body) => _notTxn.add(body);
  void failWith(String body, Object error) => _failures[body] = error;

  @override
  Future<SmsParseOutcome> parse(IncomingSms sms) async {
    final failure = _failures[sms.body];
    if (failure != null) throw failure; // transport failure → caller retries
    if (_notTxn.contains(sms.body)) {
      return const SmsParseOutcome(SmsParseStatus.notATxn);
    }
    final c = _responses[sms.body];
    if (c == null) return const SmsParseOutcome(SmsParseStatus.notATxn);
    return SmsParseOutcome(SmsParseStatus.transaction, c);
  }
}

class _FakeSmsReader implements SmsReader {
  List<IncomingSms> backfillMessages = [];
  List<IncomingSms> queuedMessages = [];
  final _controller = StreamController<IncomingSms>.broadcast();

  @override
  bool get isSupported => true;

  @override
  Future<bool> ensurePermission() async => true;

  @override
  Future<List<IncomingSms>> backfill({DateTime? since}) async {
    return backfillMessages
        .where((m) => since == null || m.receivedAt.isAfter(since))
        .toList(growable: false);
  }

  @override
  Future<List<IncomingSms>> drainBackgroundQueue() async {
    final drained = queuedMessages;
    queuedMessages = [];
    return drained;
  }

  @override
  Future<void> clearBackgroundQueue() async {
    queuedMessages = [];
  }

  @override
  Stream<IncomingSms> listen() => _controller.stream;

  void emit(IncomingSms sms) => _controller.add(sms);
}

class _NotificationCall {
  const _NotificationCall(this.amountCents, this.payee, this.smsRowId);

  final int amountCents;
  final String? payee;
  final int smsRowId;
}
