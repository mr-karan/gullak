import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/data/sms/parser_registry.dart';
import 'package:gullak/data/sms/sms_models.dart';
import 'package:gullak/data/sms/sms_parser.dart';
import 'package:gullak/data/sms/sms_pipeline.dart';
import 'package:gullak/data/sms/sms_reader.dart';

void main() {
  late AppDatabase db;
  late _FakeSmsReader reader;
  late _FakeSmsParser fakeParser;
  late ParserRegistry registry;
  late List<_NotificationCall> notifications;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    reader = _FakeSmsReader();
    fakeParser = _FakeSmsParser();
    registry = ParserRegistry(db: db, parserFuture: Future.value(fakeParser));
    notifications = [];
  });

  tearDown(() => db.close());

  test(
    'ingests high-confidence bank SMS into Inbox and notifies once',
    () async {
      final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
      final sms = IncomingSms(
        id: 'hdfc-1',
        address: 'VK-HDFCBK',
        body: 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.',
        receivedAt: receivedAt,
      );
      fakeParser.respondTo(
        sms.body,
        SmsCandidate(
          amountCents: 45000,
          isIncome: false,
          date: receivedAt,
          confidence: 0.9,
          payee: 'BLINKIT',
          accountHint: 'HDFC Card xx1234',
          parserVersion: 1,
        ),
      );
      reader.backfillMessages = [sms, sms];
      final pipeline = SmsPipeline(
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
              notifications.add(
                _NotificationCall(amountCents, payee, smsRowId),
              );
            },
      );

      final added = await pipeline.backfill();
      final rows = await db.select(db.smsMessages).get();

      expect(added, 1);
      expect(rows, hasLength(1));
      expect(rows.single.androidId, 'hdfc-1');
      expect(rows.single.classifiedAs, 'transactional');
      expect(rows.single.candidateStatus, 'inbox');
      expect(rows.single.candidateJson, contains('"amount_cents":45000'));
      expect(notifications, hasLength(1));
      expect(notifications.single.amountCents, 45000);
      expect(notifications.single.payee, 'BLINKIT');
      expect(notifications.single.smsRowId, isPositive);
    },
  );

  test('collapses same sender/body even when Android ids differ', () async {
    final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
    const body = 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.';
    final sms1 = IncomingSms(
      id: 'hdfc-1',
      address: 'VK-HDFCBK',
      body: body,
      receivedAt: receivedAt,
    );
    final sms2 = IncomingSms(
      id: 'hdfc-2',
      address: 'VK-HDFCBK',
      body: body,
      receivedAt: receivedAt.add(const Duration(milliseconds: 200)),
    );
    fakeParser.respondTo(
      body,
      SmsCandidate(
        amountCents: 45000,
        isIncome: false,
        date: receivedAt,
        confidence: 0.9,
        payee: 'BLINKIT',
        accountHint: 'HDFC Card xx1234',
        parserVersion: 1,
      ),
    );
    reader.backfillMessages = [sms1, sms2];
    final pipeline = SmsPipeline(
      db: db,
      reader: reader,
      parserRegistry: registry,
    );

    final added = await pipeline.backfill();
    final rows = await db.select(db.smsMessages).get();

    expect(added, 1);
    expect(rows, hasLength(1));
  });

  test(
    'collapses same parsed candidate when SMS body differs slightly',
    () async {
      final receivedAt = DateTime.now().subtract(const Duration(hours: 2));
      const body1 = 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.';
      const body2 = 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT. ';
      final sms1 = IncomingSms(
        id: 'hdfc-1',
        address: 'VK-HDFCBK',
        body: body1,
        receivedAt: receivedAt,
      );
      final sms2 = IncomingSms(
        id: 'hdfc-2',
        address: 'VK-HDFCBK',
        body: body2,
        receivedAt: receivedAt.add(const Duration(seconds: 1)),
      );
      final candidate = SmsCandidate(
        amountCents: 45000,
        isIncome: false,
        date: receivedAt,
        confidence: 0.9,
        payee: 'BLINKIT',
        accountHint: 'HDFC Card xx1234',
        parserVersion: 1,
      );
      fakeParser
        ..respondTo(body1, candidate)
        ..respondTo(body2, candidate);
      reader.backfillMessages = [sms1, sms2];
      final pipeline = SmsPipeline(
        db: db,
        reader: reader,
        parserRegistry: registry,
      );

      final added = await pipeline.backfill();
      final rows = await db.select(db.smsMessages).get();

      expect(added, 1);
      expect(rows, hasLength(1));
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
      final pipeline = SmsPipeline(
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
              notifications.add(
                _NotificationCall(amountCents, payee, smsRowId),
              );
            },
      );

      final added = await pipeline.backfill();
      final rows = await db.select(db.smsMessages).get();

      expect(added, 0);
      expect(rows, hasLength(1));
      expect(rows.single.classifiedAs, 'non_transactional');
      expect(rows.single.candidateStatus, 'none');
      expect(rows.single.candidateJson, isNull);
      expect(notifications, isEmpty);
    },
  );

  test('drains queued background SMS before normal backfill', () async {
    final queuedAt = DateTime.now().subtract(const Duration(days: 1));
    reader
      ..queuedMessages = [
        IncomingSms(
          id: 'queued-1',
          address: 'AD-HDFCBK',
          body: 'Rs.99.00 debited from HDFC Bank card xx1234 at COFFEE.',
          receivedAt: queuedAt,
        ),
      ]
      ..backfillMessages = [
        IncomingSms(
          id: 'old-1',
          address: 'AD-HDFCBK',
          body: 'Rs.100.00 debited from HDFC Bank card xx1234 at OLD.',
          receivedAt: DateTime(2025, 9, 1),
        ),
      ];
    fakeParser.respondTo(
      reader.queuedMessages.first.body,
      SmsCandidate(
        amountCents: 9900,
        isIncome: false,
        date: queuedAt,
        confidence: 0.9,
        payee: 'COFFEE',
        accountHint: 'HDFC Card xx1234',
        parserVersion: 1,
      ),
    );
    final pipeline = SmsPipeline(
      db: db,
      reader: reader,
      parserRegistry: registry,
    );

    final added = await pipeline.backfill(window: const Duration(days: 30));
    final rows = await db.select(db.smsMessages).get();

    expect(added, 1);
    expect(rows, hasLength(1));
    expect(rows.single.androidId, 'queued-1');
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
      final parseGate = Completer<void>();
      fakeParser
        ..delay(sms.body, parseGate.future)
        ..respondTo(
          sms.body,
          SmsCandidate(
            amountCents: 45000,
            isIncome: false,
            date: receivedAt,
            confidence: 0.9,
            payee: 'BLINKIT',
            accountHint: 'HDFC Card xx1234',
            parserVersion: 1,
          ),
        );
      reader.backfillMessages = [sms];
      final pipeline = SmsPipeline(
        db: db,
        reader: reader,
        parserRegistry: registry,
      );

      pipeline.startListening(drainQueued: false);
      reader.emit(sms);
      await Future<void>.delayed(Duration.zero);
      parseGate.complete();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final rows = await db.select(db.smsMessages).get();

      expect(rows, hasLength(1));
      expect(rows.single.androidId, 'race-1');
      await pipeline.dispose();
    },
  );
}

class _FakeSmsParser implements SmsParser {
  final Map<String, SmsCandidate> _responses = {};
  final Map<String, Future<void>> _delays = {};
  void respondTo(String body, SmsCandidate candidate) {
    _responses[body] = candidate;
  }

  void delay(String body, Future<void> future) {
    _delays[body] = future;
  }

  @override
  Future<SmsCandidate?> parse(IncomingSms sms) async {
    final delay = _delays[sms.body];
    if (delay != null) await delay;
    return _responses[sms.body];
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
