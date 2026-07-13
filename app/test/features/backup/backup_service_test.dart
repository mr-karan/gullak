import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chavanni/data/db/database.dart';
import 'package:chavanni/features/accounts/data/account_repository.dart';
import 'package:chavanni/features/backup/backup_service.dart';
import 'package:chavanni/features/categories/data/category_repository.dart';
import 'package:chavanni/features/payees/data/payee_repository.dart';
import 'package:chavanni/features/tags/data/tag_repository.dart';
import 'package:chavanni/features/transactions/data/transaction_repository.dart';

void main() {
  test(
    'export/import preserves financial rows, tags, locations, budgets and kv',
    () async {
      final source = AppDatabase.forTesting(NativeDatabase.memory());

      final accounts = AccountRepository(source);
      final categories = CategoryRepository(source);
      final payees = PayeeRepository(source);
      final tags = TagRepository(source);
      final txs = TransactionRepository(source);

      final accountId = await accounts.create(
        name: 'Main',
        kind: AccountKind.checking,
        openingBalanceCents: 123456,
      );
      final groupId = await categories.createGroup(name: 'Daily');
      final categoryId = await categories.create(
        name: 'Groceries',
        groupId: groupId,
        color: 0xff00aa00,
        icon: 'cart',
      );
      final payeeId = await payees.create('Blinkit');
      final transactionId = await txs.create(
        accountId: accountId,
        categoryId: categoryId,
        payeeId: payeeId,
        amountCents: -45000,
        date: DateTime(2026, 1, 2),
        notes: 'weekly',
        latitude: 12.9716,
        longitude: 77.5946,
        locationName: 'Bengaluru',
        cleared: true,
        origin: 'manual',
      );
      final tagId = await tags.create(name: 'Coorg trip', color: 0xff3366cc);
      await tags.setTransactionTags(transactionId, [tagId]);
      await source
          .into(source.budgets)
          .insert(
            BudgetsCompanion.insert(
              id: 'budget-1',
              categoryId: categoryId,
              month: '2026-01',
              targetCents: 100000,
              rolloverCents: const Value(5000),
              updatedAt: 123,
            ),
          );
      await source.kvSet('onboarded', 'true');

      final exported = await BackupService(source).exportToJson();
      await source.close();

      final target = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(target.close);
      final imported = await BackupService(target).importFromJson(exported);
      final reexported = await BackupService(target).exportToJson();

      expect(imported, 9);
      expect(_stablePayload(reexported), _stablePayload(exported));

      final restoredTx = await target.select(target.transactions).getSingle();
      expect(restoredTx.latitude, 12.9716);
      expect(restoredTx.longitude, 77.5946);
      expect(restoredTx.locationName, 'Bengaluru');
      expect(await target.select(target.tags).get(), hasLength(1));
      expect(await target.select(target.transactionTags).get(), hasLength(1));
    },
  );
}

Map<String, dynamic> _stablePayload(String json) {
  final payload = jsonDecode(json) as Map<String, dynamic>;
  payload.remove('exported_at');
  return payload;
}
