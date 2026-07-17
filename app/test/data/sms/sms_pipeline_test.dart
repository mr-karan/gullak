import 'dart:async';

import 'package:drift/drift.dart' show Value;
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

  SmsPipeline build({void Function(_NotificationCall)? onNotify}) =>
      SmsPipeline(
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

  test(
    'sibling double-alert is linked as duplicate, not double-counted',
    () async {
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
    },
  );

  test(
    'stores non-transactional SMS without candidate or notification',
    () async {
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
    },
  );

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

  // ---- Duplicate detection: a same-amount/date coincidence must NOT be
  // treated as a duplicate without a corroborating signal, or a real spend
  // gets silently linked-away and never booked nor shown. ----

  Future<void> insertAccount(
    String id,
    String name, {
    String kind = 'checking',
  }) => db
      .into(db.accounts)
      .insert(
        AccountsCompanion.insert(
          id: id,
          name: name,
          kind: Value(kind),
          createdAt: 0,
          updatedAt: 0,
        ),
      );

  Future<void> insertManualTxn({
    required String id,
    required String accountId,
    required int amountCents,
    required DateTime date,
    String? payeeName,
    String? transferAccountId,
    String? parentId,
  }) => db
      .into(db.transactions)
      .insert(
        TransactionsCompanion.insert(
          id: id,
          accountId: accountId,
          amountCents: amountCents,
          date:
              '${date.year.toString().padLeft(4, '0')}-'
              '${date.month.toString().padLeft(2, '0')}-'
              '${date.day.toString().padLeft(2, '0')}',
          createdAt: 0,
          updatedAt: 0,
          payeeName: Value(payeeName),
          transferAccountId: Value(transferAccountId),
          parentId: Value(parentId),
        ),
      );

  // Drives one SMS (matching candidate()) through the pipeline and returns the
  // resulting sms_messages row.
  Future<SmsRow> runOneSms(DateTime receivedAt) async {
    const body = 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.';
    fakeParser.respondTo(body, candidate(receivedAt));
    reader.backfillMessages = [
      IncomingSms(
        id: 'dup-sms',
        address: 'VK-HDFCBK',
        body: body,
        receivedAt: receivedAt,
      ),
    ];
    await build().backfill();
    return (await db.select(db.smsMessages).get()).single;
  }

  test('unrelated same-amount manual txn does NOT swallow the SMS', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    // candidate() is ₹450 on an "HDFC Card xx1234" hint, payee BLINKIT. This
    // manual row is the same ₹450 on the same day but a DIFFERENT account and
    // payee — a coincidence, not a duplicate.
    await insertAccount('acc-icici', 'ICICI Bank');
    await insertManualTxn(
      id: 'm-unrelated',
      accountId: 'acc-icici',
      amountCents: -45000,
      date: receivedAt,
      payeeName: 'Grocery Store',
    );

    final row = await runOneSms(receivedAt);

    // The regression: old code marked this 'duplicate' (amount+date only) and
    // dropped it. It must now reach the Inbox for review instead.
    expect(row.candidateStatus, 'parsed');
    expect(row.linkedTransactionId, isNull);
    expect(notifications, hasLength(1));
  });

  test('same-amount manual txn on the resolved account IS linked', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    // "HDFC Card xx1234" resolves to this account (brand + last-4 + card), so
    // the same-amount/day row is corroborated → safe to link, don't re-book.
    await insertAccount(
      'acc-hdfc',
      'HDFC Credit Card 1234',
      kind: 'credit_card',
    );
    await insertManualTxn(
      id: 'm-hdfc',
      accountId: 'acc-hdfc',
      amountCents: -45000,
      date: receivedAt,
      payeeName: 'Some Shop',
    );

    final row = await runOneSms(receivedAt);

    expect(row.candidateStatus, 'duplicate');
    expect(row.linkedTransactionId, 'm-hdfc');
    expect(notifications, isEmpty);
  });

  test('same-amount manual txn with matching payee IS linked', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    // Account hint won't resolve (no HDFC account), but the payee matches the
    // candidate's "BLINKIT" → corroborated, link it.
    await insertAccount('acc-wallet', 'Random Wallet');
    await insertManualTxn(
      id: 'm-payee',
      accountId: 'acc-wallet',
      amountCents: -45000,
      date: receivedAt,
      payeeName: 'blinkit',
    );

    final row = await runOneSms(receivedAt);

    expect(row.candidateStatus, 'duplicate');
    expect(row.linkedTransactionId, 'm-payee');
  });

  test('a same-amount transfer leg never shadows the SMS', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    // Even though this resolves to the HDFC account at the same amount/day, a
    // transfer leg (transferAccountId set) must be excluded from dedupe.
    await insertAccount(
      'acc-hdfc',
      'HDFC Credit Card 1234',
      kind: 'credit_card',
    );
    await insertAccount('acc-dest', 'Savings');
    await insertManualTxn(
      id: 'm-transfer',
      accountId: 'acc-hdfc',
      amountCents: -45000,
      date: receivedAt,
      transferAccountId: 'acc-dest',
    );

    final row = await runOneSms(receivedAt);

    // Not a duplicate (transfer leg excluded) → no category → Inbox, unlinked.
    expect(row.candidateStatus, 'parsed');
    expect(row.linkedTransactionId, isNull);
  });

  test('recoverStuckParses re-queues rows stranded by a crash', () async {
    final pipeline = build();
    // Simulate a crash that left one row mid-parse and one mid-confirm.
    await db
        .into(db.smsMessages)
        .insert(
          SmsMessagesCompanion.insert(
            address: 'HDFC',
            body: 'stuck parsing',
            receivedAt: DateTime(2026, 6, 1).millisecondsSinceEpoch,
            classifiedAs: const Value('transactional'),
            candidateStatus: const Value('parsing'),
            stableSmsId: const Value('android:stuck1'),
          ),
        );
    await db
        .into(db.smsMessages)
        .insert(
          SmsMessagesCompanion.insert(
            address: 'ICICI',
            body: 'stuck confirming',
            receivedAt: DateTime(2026, 6, 1).millisecondsSinceEpoch,
            classifiedAs: const Value('transactional'),
            candidateStatus: const Value('processing'),
            stableSmsId: const Value('android:stuck2'),
          ),
        );

    final recovered = await pipeline.recoverStuckParses();
    expect(recovered, 2);

    final rows = await db.select(db.smsMessages).get();
    final byBody = {for (final r in rows) r.body: r.candidateStatus};
    expect(byBody['stuck parsing'], 'pending_parse');
    expect(byBody['stuck confirming'], 'parsed');
  });

  test(
    'live listener and catch-up do not double-ingest the same SMS',
    () async {
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
    },
  );
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
