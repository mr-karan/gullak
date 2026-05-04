import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/backup/backup_service.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/features/payees/data/payee_repository.dart';
import 'package:gullak/features/transactions/data/transaction_repository.dart';

void main() {
  test(
    'export/import preserves accounts, categories, payees, tx, budgets and kv',
    () async {
      final source = AppDatabase.forTesting(NativeDatabase.memory());

      final accounts = AccountRepository(source);
      final categories = CategoryRepository(source);
      final payees = PayeeRepository(source);
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
      await txs.create(
        accountId: accountId,
        categoryId: categoryId,
        payeeId: payeeId,
        amountCents: -45000,
        date: DateTime(2026, 1, 2),
        notes: 'weekly',
        cleared: true,
        origin: 'manual',
      );
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

      expect(imported, 7);
      expect(_stablePayload(reexported), _stablePayload(exported));
    },
  );
}

Map<String, dynamic> _stablePayload(String json) {
  final payload = jsonDecode(json) as Map<String, dynamic>;
  payload.remove('exported_at');
  return payload;
}
