import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/data/sms/sms_models.dart';
import 'package:gullak/data/sms/sms_pipeline.dart';
import 'package:gullak/data/sms/sms_reader.dart';

void main() {
  late AppDatabase db;
  late _FakeSmsReader reader;
  late List<_NotificationCall> notifications;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    reader = _FakeSmsReader();
    notifications = [];
  });

  tearDown(() => db.close());

  test(
    'ingests high-confidence bank SMS into Inbox and notifies once',
    () async {
      final receivedAt = DateTime(2026, 5, 2, 10, 30);
      final sms = IncomingSms(
        id: 'hdfc-1',
        address: 'VK-HDFCBK',
        body: 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.',
        receivedAt: receivedAt,
      );
      reader.backfillMessages = [sms, sms];
      final pipeline = SmsPipeline(
        db: db,
        reader: reader,
        notifyInboxCandidate: ({required amountCents, required payee}) async {
          notifications.add(_NotificationCall(amountCents, payee));
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
          receivedAt: DateTime(2026, 5, 2, 10),
        ),
      ];
      final pipeline = SmsPipeline(
        db: db,
        reader: reader,
        notifyInboxCandidate: ({required amountCents, required payee}) async {
          notifications.add(_NotificationCall(amountCents, payee));
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
    reader
      ..queuedMessages = [
        IncomingSms(
          id: 'queued-1',
          address: 'AD-HDFCBK',
          body: 'Rs.99.00 debited from HDFC Bank card xx1234 at COFFEE.',
          receivedAt: DateTime(2026, 5, 2, 9),
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
    final pipeline = SmsPipeline(db: db, reader: reader);

    final added = await pipeline.backfill(window: const Duration(days: 30));
    final rows = await db.select(db.smsMessages).get();

    expect(added, 1);
    expect(rows, hasLength(1));
    expect(rows.single.androidId, 'queued-1');
  });
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
  Stream<IncomingSms> listen() => _controller.stream;
}

class _NotificationCall {
  const _NotificationCall(this.amountCents, this.payee);

  final int amountCents;
  final String? payee;
}
