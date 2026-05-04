import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/recurrences/data/recurrence_repository.dart';

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
}
