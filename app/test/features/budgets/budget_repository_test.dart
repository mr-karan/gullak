import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/features/budgets/data/budget_repository.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/data/db/database.dart';

void main() {
  test('copies previous month targets into current month', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    final categories = CategoryRepository(db);
    final budgets = BudgetRepository(db);

    final groupId = await categories.createGroup(name: 'Daily');
    final foodId = await categories.create(name: 'Food', groupId: groupId);
    final travelId = await categories.create(name: 'Travel', groupId: groupId);
    await budgets.setTarget(
      categoryId: foodId,
      month: '2026-04',
      targetCents: 250000,
    );
    await budgets.setTarget(
      categoryId: travelId,
      month: '2026-04',
      targetCents: 150000,
    );

    final copied = await budgets.copyTargetsFromPreviousMonth('2026-05');
    final may = await budgets.summary('2026-05');

    expect(copied, 2);
    expect({
      for (final e in may.entries) e.categoryName: e.targetCents,
    }, containsPair('Food', 250000));
    expect({
      for (final e in may.entries) e.categoryName: e.targetCents,
    }, containsPair('Travel', 150000));
  });
}
