import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show CategoryRow, CategoryGroupRow;

class CategoryRepository {
  CategoryRepository(this._db);
  final AppDatabase _db;
  static const _uuid = Uuid();

  Stream<List<CategoryRow>> watch({bool includeHidden = false}) {
    final q = _db.select(_db.categories);
    if (!includeHidden) q.where((t) => t.hidden.equals(false));
    q.orderBy([
      (t) => OrderingTerm.asc(t.sortOrder),
      (t) => OrderingTerm.asc(t.name),
    ]);
    return q.watch();
  }

  Stream<List<CategoryGroupRow>> watchGroups() {
    return (_db.select(_db.categoryGroups)..orderBy([
          (t) => OrderingTerm.asc(t.sortOrder),
          (t) => OrderingTerm.asc(t.name),
        ]))
        .watch();
  }

  Future<List<CategoryRow>> list({bool includeHidden = false}) {
    final q = _db.select(_db.categories);
    if (!includeHidden) q.where((t) => t.hidden.equals(false));
    q.orderBy([
      (t) => OrderingTerm.asc(t.sortOrder),
      (t) => OrderingTerm.asc(t.name),
    ]);
    return q.get();
  }

  Future<List<CategoryGroupRow>> listGroups() {
    return (_db.select(_db.categoryGroups)..orderBy([
          (t) => OrderingTerm.asc(t.sortOrder),
          (t) => OrderingTerm.asc(t.name),
        ]))
        .get();
  }

  Future<CategoryRow?> byId(String id) => (_db.select(
    _db.categories,
  )..where((t) => t.id.equals(id))).getSingleOrNull();

  Future<String> createGroup({
    required String name,
    bool isIncome = false,
  }) async {
    final id = _uuid.v4();
    final next = await _nextGroupSortOrder();
    await _db
        .into(_db.categoryGroups)
        .insert(
          CategoryGroupsCompanion.insert(
            id: id,
            name: name,
            isIncome: Value(isIncome),
            sortOrder: Value(next),
          ),
        );
    return id;
  }

  Future<String> create({
    required String name,
    required String groupId,
    int? color,
    String? icon,
  }) async {
    final id = _uuid.v4();
    final next = await _nextSortOrder(groupId);
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db
        .into(_db.categories)
        .insert(
          CategoriesCompanion.insert(
            id: id,
            name: name,
            groupId: groupId,
            color: Value(color),
            icon: Value(icon),
            sortOrder: Value(next),
            updatedAt: now,
          ),
        );
    return id;
  }

  Future<void> update(
    String id, {
    String? name,
    String? groupId,
    int? color,
    String? icon,
    bool? hidden,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (_db.update(_db.categories)..where((t) => t.id.equals(id))).write(
      CategoriesCompanion(
        name: name == null ? const Value.absent() : Value(name),
        groupId: groupId == null ? const Value.absent() : Value(groupId),
        color: color == null ? const Value.absent() : Value(color),
        icon: icon == null ? const Value.absent() : Value(icon),
        hidden: hidden == null ? const Value.absent() : Value(hidden),
        updatedAt: Value(now),
      ),
    );
  }

  Future<void> deleteCategory(String id, {String? reassignTo}) async {
    await _db.transaction(() async {
      if (reassignTo != null) {
        await (_db.update(_db.transactions)
              ..where((t) => t.categoryId.equals(id)))
            .write(TransactionsCompanion(categoryId: Value(reassignTo)));
      } else {
        await (_db.update(_db.transactions)
              ..where((t) => t.categoryId.equals(id)))
            .write(const TransactionsCompanion(categoryId: Value(null)));
      }
      await (_db.delete(
        _db.budgets,
      )..where((b) => b.categoryId.equals(id))).go();
      await (_db.delete(_db.categories)..where((t) => t.id.equals(id))).go();
    });
  }

  Future<void> deleteGroup(String id) async {
    await _db.transaction(() async {
      // Re-parent any orphan categories to a synthetic 'ungrouped' group
      // when their group is deleted. Keep them around so transactions
      // don't lose categorisation.
      final ungrouped = await _ensureUngroupedGroup();
      await (_db.update(_db.categories)..where((t) => t.groupId.equals(id)))
          .write(CategoriesCompanion(groupId: Value(ungrouped)));
      await (_db.delete(
        _db.categoryGroups,
      )..where((t) => t.id.equals(id))).go();
    });
  }

  Future<String> _ensureUngroupedGroup() async {
    final existing = await (_db.select(
      _db.categoryGroups,
    )..where((t) => t.name.equals('Other'))).getSingleOrNull();
    if (existing != null) return existing.id;
    return createGroup(name: 'Other');
  }

  Future<int> _nextGroupSortOrder() async {
    final r = await (_db.selectOnly(
      _db.categoryGroups,
    )..addColumns([_db.categoryGroups.sortOrder.max()])).getSingle();
    return (r.read(_db.categoryGroups.sortOrder.max()) ?? -1) + 1;
  }

  Future<int> _nextSortOrder(String groupId) async {
    final r =
        await (_db.selectOnly(_db.categories)
              ..addColumns([_db.categories.sortOrder.max()])
              ..where(_db.categories.groupId.equals(groupId)))
            .getSingle();
    return (r.read(_db.categories.sortOrder.max()) ?? -1) + 1;
  }
}

final Provider<CategoryRepository> categoryRepoProvider =
    Provider<CategoryRepository>(
      (ref) => CategoryRepository(ref.watch(dbProvider)),
    );

final StreamProvider<List<CategoryRow>> categoriesListProvider =
    StreamProvider<List<CategoryRow>>(
      (ref) => ref.watch(categoryRepoProvider).watch(),
    );

final StreamProvider<List<CategoryGroupRow>> categoryGroupsListProvider =
    StreamProvider<List<CategoryGroupRow>>(
      (ref) => ref.watch(categoryRepoProvider).watchGroups(),
    );
