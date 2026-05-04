import 'package:drift/drift.dart' hide isNotNull, isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/features/transactions/data/transaction_repository.dart';

void main() {
  late AppDatabase db;
  late AccountRepository accounts;
  late CategoryRepository categories;
  late TransactionRepository txs;
  late String checkingId;
  late String walletId;
  late String groceriesId;
  late String diningId;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    accounts = AccountRepository(db);
    categories = CategoryRepository(db);
    txs = TransactionRepository(db);

    checkingId = await accounts.create(
      name: 'Checking',
      kind: AccountKind.checking,
      openingBalanceCents: 100000,
    );
    walletId = await accounts.create(name: 'Wallet', kind: AccountKind.wallet);
    final groupId = await categories.createGroup(name: 'Everyday');
    groceriesId = await categories.create(name: 'Groceries', groupId: groupId);
    diningId = await categories.create(name: 'Dining', groupId: groupId);
  });

  tearDown(() => db.close());

  test(
    'creates, updates, deletes, and restores a normal transaction',
    () async {
      final id = await txs.create(
        accountId: checkingId,
        categoryId: groceriesId,
        payeeName: 'Blinkit',
        amountCents: -45000,
        date: DateTime(2026, 1, 2),
        notes: 'weekly shop',
      );

      await txs.update(
        id,
        categoryId: diningId,
        amountCents: -50000,
        notes: 'corrected',
      );
      var row = await txs.byRow(id);
      expect(row!.categoryId, diningId);
      expect(row.amountCents, -50000);
      expect(row.notes, 'corrected');

      final snap = await txs.delete(id);
      expect(snap.isEmpty, isFalse);
      expect(await txs.byRow(id), isNull);

      await txs.restore(snap);
      row = await txs.byRow(id);
      expect(row, isNotNull);
      expect(row!.categoryId, diningId);
      expect(row.amountCents, -50000);

      await txs.restore(snap);
      final count = await _transactionCount(db);
      expect(count, 1);
    },
  );

  test(
    'creates transfers as paired rows and restore round-trips both legs',
    () async {
      final groupId = await txs.createTransfer(
        fromAccountId: checkingId,
        toAccountId: walletId,
        amountCents: 25000,
        date: DateTime(2026, 1, 3),
      );

      final rows = await (db.select(
        db.transactions,
      )..where((t) => t.transferGroupId.equals(groupId))).get();
      expect(rows.map((r) => r.amountCents).toSet(), {-25000, 25000});
      expect(await txs.sumSpendInRange(), 0);
      expect(await txs.sumIncomeInRange(), 0);

      final snap = await txs.delete(rows.first.id);
      expect(await _transactionCount(db), 0);

      await txs.restore(snap);
      expect(await _transactionCount(db), 2);
    },
  );

  test('creates split parent and category children for sums', () async {
    final parentId = await txs.createSplit(
      accountId: checkingId,
      payeeName: 'Amazon',
      date: DateTime(2026, 1, 4),
      splits: [
        (amountCents: -30000, categoryId: groceriesId, notes: 'pantry'),
        (amountCents: -20000, categoryId: diningId, notes: 'snacks'),
      ],
    );

    final parent = await txs.byRow(parentId);
    expect(parent!.amountCents, -50000);
    expect(parent.splitTotalCents, -50000);
    expect(await txs.sumSpendInRange(), -50000);
    expect(await txs.sumByCategoryInMonth(groceriesId, '2026-01'), -30000);
    expect(await txs.sumByCategoryInMonth(diningId, '2026-01'), -20000);

    final visible = await txs.watchAll().first;
    expect(visible, hasLength(1));
    expect(visible.single.isSplit, isTrue);
  });

  test(
    'finds near duplicate by account amount date and closest payee',
    () async {
      await txs.create(
        accountId: checkingId,
        payeeName: 'Blinkit',
        amountCents: -45000,
        date: DateTime(2026, 1, 2),
      );

      final duplicate = await txs.findNearDuplicate(
        accountId: checkingId,
        amountCents: -45000,
        date: DateTime(2026, 1, 4),
        payeeName: 'Blinkt',
      );

      expect(duplicate, isNotNull);
      expect(duplicate!.payeeName, 'Blinkit');
    },
  );
}

Future<int> _transactionCount(AppDatabase db) async {
  final count = db.transactions.id.count();
  final row = await (db.selectOnly(
    db.transactions,
  )..addColumns([count])).getSingle();
  return row.read(count) ?? 0;
}
