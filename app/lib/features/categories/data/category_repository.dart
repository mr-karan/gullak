import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/actual/actual_dto.dart';
import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show CategoryRow, CategoryGroupRow;

class CategoryRepository {
  CategoryRepository(this._db);
  final AppDatabase _db;

  Future<List<CategoryRow>> list({bool includeHidden = false}) async {
    final q = _db.select(_db.categories);
    if (!includeHidden) q.where((t) => t.hidden.equals(false));
    q.orderBy([(t) => OrderingTerm.asc(t.sortOrder), (t) => OrderingTerm.asc(t.name)]);
    return q.get();
  }

  Future<List<CategoryGroupRow>> listGroups() {
    return (_db.select(_db.categoryGroups)
          ..orderBy([(t) => OrderingTerm.asc(t.sortOrder), (t) => OrderingTerm.asc(t.name)]))
        .get();
  }

  Future<CategoryRow?> byId(String id) {
    return (_db.select(_db.categories)..where((t) => t.id.equals(id))).getSingleOrNull();
  }

  Future<CategoryRow?> byActualId(String actualId) {
    return (_db.select(_db.categories)..where((t) => t.actualId.equals(actualId))).getSingleOrNull();
  }

  Future<void> upsertFromServer(List<ActualCategoryGroupDto> groups) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db.batch((batch) {
      for (final g in groups) {
        batch.insert(
          _db.categoryGroups,
          CategoryGroupsCompanion.insert(
            id: g.id,
            actualId: Value(g.id),
            name: g.name,
            isIncome: Value(g.isIncome),
            sortOrder: Value(g.sortOrder),
          ),
          mode: InsertMode.insertOrReplace,
        );
        for (final c in g.categories) {
          batch.insert(
            _db.categories,
            CategoriesCompanion.insert(
              id: c.id,
              actualId: Value(c.id),
              name: c.name,
              groupId: c.groupId.isEmpty ? g.id : c.groupId,
              isIncome: Value(c.isIncome),
              hidden: Value(c.hidden),
              sortOrder: Value(c.sortOrder),
              updatedAt: now,
              syncStatus: const Value('synced'),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      }
    });
  }
}

final Provider<CategoryRepository> categoryRepoProvider =
    Provider<CategoryRepository>((ref) => CategoryRepository(ref.watch(dbProvider)));

final FutureProvider<List<CategoryRow>> categoriesListProvider =
    FutureProvider<List<CategoryRow>>((ref) => ref.watch(categoryRepoProvider).list());

final FutureProvider<List<CategoryGroupRow>> categoryGroupsListProvider =
    FutureProvider<List<CategoryGroupRow>>((ref) => ref.watch(categoryRepoProvider).listGroups());
