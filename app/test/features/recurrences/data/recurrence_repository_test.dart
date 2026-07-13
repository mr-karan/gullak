import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chavanni/data/db/database.dart';
import 'package:chavanni/features/accounts/data/account_repository.dart';
import 'package:chavanni/features/recurrences/data/recurrence_repository.dart';

void main() {
  late AppDatabase db;
  late RecurrenceRepository recurrences;
  late String accountId;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    recurrences = RecurrenceRepository(db);
    accountId = await AccountRepository(
      db,
    ).create(name: 'Main', kind: AccountKind.checking);
  });

  tearDown(() => db.close());

  test(
    'creates, orders, lists, watches and deletes recurrence templates',
    () async {
      final later = await recurrences.create(
        accountId: accountId,
        payeeName: 'Rent',
        amountCents: -500000,
        cadence: 'monthly',
        nextDate: DateTime(2026, 2, 1),
      );
      final earlier = await recurrences.create(
        accountId: accountId,
        payeeName: 'Salary',
        amountCents: 1000000,
        cadence: 'monthly',
        nextDate: DateTime(2026, 1, 31),
      );

      final rows = await recurrences.list();
      expect(rows.map((r) => r.id), [earlier, later]);
      expect(rows.first.nextDate, '2026-01-31');
      expect(rows.first.amountCents, 1000000);

      final watched = await recurrences.watch().first;
      expect(watched, hasLength(2));

      await recurrences.delete(earlier);
      expect((await recurrences.list()).single.id, later);
    },
  );

  test(
    'postDue books due occurrences, advances the schedule, and is idempotent',
    () async {
      await recurrences.create(
        accountId: accountId,
        payeeName: 'Rent',
        amountCents: -500000,
        cadence: 'monthly',
        nextDate: DateTime(2026, 1, 1),
      );
      // As of mid-March, Jan/Feb/Mar occurrences are all due.
      final posted = await recurrences.postDue(asOf: DateTime(2026, 3, 15));
      expect(posted, 3);

      final txs = await db.select(db.transactions).get();
      expect(txs, hasLength(3));
      expect(txs.every((t) => t.origin == 'recurrence'), isTrue);
      expect(txs.map((t) => t.date).toSet(), {
        '2026-01-01',
        '2026-02-01',
        '2026-03-01',
      });
      // Schedule advanced to the next future occurrence.
      expect((await recurrences.list()).single.nextDate, '2026-04-01');

      // Running again for the same window posts nothing (idempotent).
      final again = await recurrences.postDue(asOf: DateTime(2026, 3, 15));
      expect(again, 0);
      expect(await db.select(db.transactions).get(), hasLength(3));
    },
  );

  test('month-end schedules clamp per short month WITHOUT drifting', () async {
    await recurrences.create(
      accountId: accountId,
      payeeName: 'End of month',
      amountCents: -1000,
      cadence: 'monthly',
      nextDate: DateTime(2026, 1, 31), // anchor day 31
    );
    final posted = await recurrences.postDue(asOf: DateTime(2026, 2, 28));
    expect(posted, 2); // Jan 31 + Feb 28 (clamped to short month)
    final dates = (await db.select(db.transactions).get()).map((t) => t.date);
    expect(dates.toSet(), {'2026-01-31', '2026-02-28'});
    // The anchor (31) is preserved: next occurrence recovers to Mar 31,
    // it does NOT drift to Mar 28.
    expect((await recurrences.list()).single.nextDate, '2026-03-31');

    // Advance through March/April: Mar 31 posts, April clamps to 30, and the
    // stored next recovers to May 31 — no permanent drift.
    final more = await recurrences.postDue(asOf: DateTime(2026, 4, 30));
    expect(more, 2); // Mar 31 + Apr 30
    final all = (await db.select(db.transactions).get()).map((t) => t.date);
    expect(all.toSet(), {
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    });
    expect((await recurrences.list()).single.nextDate, '2026-05-31');
  });
}
