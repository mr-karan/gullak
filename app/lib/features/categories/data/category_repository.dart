import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../sync/sync_writer.dart';
import '../category_visuals.dart';

export '../../../data/db/database.dart' show CategoryRow, CategoryGroupRow;

class CategoryRepository {
  CategoryRepository(this._db, {SyncWriter? changes}) : _changes = changes;
  final AppDatabase _db;
  final SyncWriter? _changes;
  static const _uuid = Uuid();

  Future<T> _command<T>(Future<T> Function() callback) =>
      _changes?.command(callback) ?? _db.transaction(callback);
  static const List<_DefaultCategoryNode> _defaultSpendingTree = [
    _DefaultCategoryNode(
      'Daily Living',
      children: ['Groceries', 'Eating Out', 'Transport', 'Health'],
    ),
    _DefaultCategoryNode(
      'Home & Bills',
      children: ['Rent', 'Utilities', 'Phone & Internet', 'Insurance'],
    ),
    _DefaultCategoryNode(
      'Lifestyle',
      children: ['Shopping', 'Entertainment', 'Travel', 'Personal Care'],
    ),
    _DefaultCategoryNode(
      'Savings & Goals',
      children: ['Emergency Fund', 'Investments'],
    ),
    _DefaultCategoryNode('Giving', children: ['Gifts', 'Donations']),
  ];
  static const List<_DefaultCategoryNode> _defaultIncomeTree = [
    _DefaultCategoryNode(
      'Income',
      children: ['Salary', 'Interest', 'Refunds', 'Other Income'],
    ),
  ];

  Future<void> _logCategory(String id, {Set<String>? changedFields}) async {
    if (_changes == null) return;
    final row = await byId(id);
    if (row != null) {
      await _changes.upsert(
        'categories',
        id,
        row.toJson(),
        changedFields: changedFields,
      );
    }
  }

  Future<void> _logGroup(String id, {Set<String>? changedFields}) async {
    if (_changes == null) return;
    final row = await (_db.select(
      _db.categoryGroups,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (row != null) {
      await _changes.upsert(
        'category_groups',
        id,
        row.toJson(),
        changedFields: changedFields,
      );
    }
  }

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

  Stream<CategoryRow?> watchById(String id) =>
      (_db.select(_db.categories)..where((t) => t.id.equals(id))).watch().map(
        (rows) => rows.isEmpty ? null : rows.first,
      );

  Future<String> createGroup({
    required String name,
    bool isIncome = false,
  }) async {
    return _command(() async {
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
      await _logGroup(id);
      return id;
    });
  }

  Future<String> create({
    required String name,
    required String groupId,
    int? color,
    String? icon,
    String? parentId,
  }) async {
    return _command(() async {
      var resolvedGroupId = groupId;
      if (parentId != null) {
        final parent = await _ensureTopLevel(parentId);
        resolvedGroupId = parent.groupId;
      }
      final id = _uuid.v4();
      final next = await _nextSortOrder(resolvedGroupId);
      final now = DateTime.now().millisecondsSinceEpoch;
      await _db
          .into(_db.categories)
          .insert(
            CategoriesCompanion.insert(
              id: id,
              name: name,
              groupId: resolvedGroupId,
              color: Value(color),
              icon: Value(icon),
              parentId: Value(parentId),
              sortOrder: Value(next),
              updatedAt: now,
            ),
          );
      await _logCategory(id);
      return id;
    });
  }

  Future<void> update(
    String id, {
    String? name,
    String? groupId,
    int? color,
    String? icon,
    bool? hidden,
    Object? parentId = _Sentinel.value,
  }) async {
    return _command(() async {
      String? resolvedGroupId = groupId;
      if (parentId != _Sentinel.value && parentId != null) {
        if (parentId == id) {
          throw ArgumentError('a category cannot be its own parent');
        }
        final parent = await _ensureTopLevel(parentId as String);
        resolvedGroupId = parent.groupId;
        // Block promoting a category that already has children: that would
        // create a 2-level chain. The UI prevents this; this is a guardrail.
        final hasKids =
            await (_db.select(_db.categories)
                  ..where((t) => t.parentId.equals(id))
                  ..limit(1))
                .getSingleOrNull();
        if (hasKids != null) {
          throw StateError(
            'cannot make a category a sub-category while it has children',
          );
        }
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      await (_db.update(_db.categories)..where((t) => t.id.equals(id))).write(
        CategoriesCompanion(
          name: name == null ? const Value.absent() : Value(name),
          groupId: resolvedGroupId == null
              ? const Value.absent()
              : Value(resolvedGroupId),
          color: color == null ? const Value.absent() : Value(color),
          icon: icon == null ? const Value.absent() : Value(icon),
          hidden: hidden == null ? const Value.absent() : Value(hidden),
          parentId: identical(parentId, _Sentinel.value)
              ? const Value.absent()
              : Value(parentId as String?),
          updatedAt: Value(now),
        ),
      );
      await _logCategory(
        id,
        changedFields: {
          if (name != null) 'name',
          if (resolvedGroupId != null) 'groupId',
          if (color != null) 'color',
          if (icon != null) 'icon',
          if (hidden != null) 'hidden',
          if (!identical(parentId, _Sentinel.value)) 'parentId',
          'updatedAt',
        },
      );
    });
  }

  Future<CategoryRow> _ensureTopLevel(String id) async {
    final row = await byId(id);
    if (row == null) {
      throw ArgumentError('parent category $id not found');
    }
    if (row.parentId != null) {
      throw StateError('parent category must itself be top-level');
    }
    return row;
  }

  Future<void> deleteCategory(String id, {String? reassignTo}) async {
    return _command(() async {
      final affectedTx =
          (await (_db.select(
                _db.transactions,
              )..where((t) => t.categoryId.equals(id))).get())
              .map((t) => t.id)
              .toList();
      final affectedBudgets =
          (await (_db.select(
                _db.budgets,
              )..where((b) => b.categoryId.equals(id))).get())
              .map((b) => b.id)
              .toList();
      final affectedRecurrences =
          (await (_db.select(
                _db.recurrences,
              )..where((row) => row.categoryId.equals(id))).get())
              .map((row) => row.id)
              .toList();
      // Children of the deleted category get promoted to top-level so they
      // don't dangle. If we deleted them too, the user would lose history
      // tagged against those subcategories silently.
      final orphaned = (await (_db.select(
        _db.categories,
      )..where((t) => t.parentId.equals(id))).get()).map((c) => c.id).toList();
      final now = DateTime.now().millisecondsSinceEpoch;
      await _db.transaction(() async {
        if (orphaned.isNotEmpty) {
          await (_db.update(
            _db.categories,
          )..where((t) => t.parentId.equals(id))).write(
            CategoriesCompanion(
              parentId: const Value(null),
              updatedAt: Value(now),
            ),
          );
        }
        if (reassignTo != null) {
          await (_db.update(
            _db.transactions,
          )..where((t) => t.categoryId.equals(id))).write(
            TransactionsCompanion(
              categoryId: Value(reassignTo),
              updatedAt: Value(now),
            ),
          );
          await (_db.update(
            _db.recurrences,
          )..where((row) => row.categoryId.equals(id))).write(
            RecurrencesCompanion(
              categoryId: Value(reassignTo),
              updatedAt: Value(now),
            ),
          );
        } else {
          await (_db.update(
            _db.transactions,
          )..where((t) => t.categoryId.equals(id))).write(
            TransactionsCompanion(
              categoryId: const Value(null),
              updatedAt: Value(now),
            ),
          );
          await (_db.update(
            _db.recurrences,
          )..where((row) => row.categoryId.equals(id))).write(
            RecurrencesCompanion(
              categoryId: const Value(null),
              updatedAt: Value(now),
            ),
          );
        }
        await (_db.delete(
          _db.budgets,
        )..where((b) => b.categoryId.equals(id))).go();
        await (_db.delete(_db.categories)..where((t) => t.id.equals(id))).go();
      });
      if (_changes != null) {
        for (final cid in orphaned) {
          await _logCategory(cid, changedFields: {'parentId', 'updatedAt'});
        }
        for (final tid in affectedTx) {
          final row = await (_db.select(
            _db.transactions,
          )..where((t) => t.id.equals(tid))).getSingleOrNull();
          if (row != null) {
            await _changes.upsert(
              'transactions',
              tid,
              row.toJson(),
              changedFields: {'categoryId', 'updatedAt'},
            );
          }
        }
        for (final bid in affectedBudgets) {
          await _changes.delete('budgets', bid);
        }
        for (final recurrenceId in affectedRecurrences) {
          final row =
              await (_db.select(_db.recurrences)
                    ..where((recurrence) => recurrence.id.equals(recurrenceId)))
                  .getSingleOrNull();
          if (row != null) {
            await _changes.upsert(
              'recurrences',
              recurrenceId,
              row.toJson(),
              changedFields: {'categoryId', 'updatedAt'},
            );
          }
        }
        await _changes.delete('categories', id);
      }
    });
  }

  Future<void> deleteGroup(String id) async {
    return _command(() async {
      final ungroupedId = await _ensureUngroupedGroup();
      final now = DateTime.now().millisecondsSinceEpoch;
      final reparented = (await (_db.select(
        _db.categories,
      )..where((t) => t.groupId.equals(id))).get()).map((c) => c.id).toList();
      await _db.transaction(() async {
        await (_db.update(
          _db.categories,
        )..where((t) => t.groupId.equals(id))).write(
          CategoriesCompanion(
            groupId: Value(ungroupedId),
            updatedAt: Value(now),
          ),
        );
        await (_db.delete(
          _db.categoryGroups,
        )..where((t) => t.id.equals(id))).go();
      });
      if (_changes != null) {
        for (final cid in reparented) {
          await _logCategory(cid, changedFields: {'groupId', 'updatedAt'});
        }
        await _changes.delete('category_groups', id);
      }
    });
  }

  Future<void> resetToDefaultTree() async {
    return _command(() async {
      final oldCategories = await list(includeHidden: true);
      final oldGroups = await listGroups();
      final affectedTx = (await _db.select(_db.transactions).get())
          .where((t) => t.categoryId != null)
          .map((t) => t.id)
          .toList();
      final affectedRecurrences = (await _db.select(_db.recurrences).get())
          .where((row) => row.categoryId != null)
          .map((row) => row.id)
          .toList();
      final oldBudgets = (await _db.select(_db.budgets).get())
          .map((b) => b.id)
          .toList();

      final now = DateTime.now().millisecondsSinceEpoch;
      final spendingGroupId = _uuid.v4();
      final incomeGroupId = _uuid.v4();
      final inserted = <CategoryRow>[];
      await _db.transaction(() async {
        await (_db.update(_db.transactions)).write(
          TransactionsCompanion(
            categoryId: const Value(null),
            updatedAt: Value(now),
          ),
        );
        await (_db.update(_db.recurrences)).write(
          RecurrencesCompanion(
            categoryId: const Value(null),
            updatedAt: Value(now),
          ),
        );
        await _db.delete(_db.budgets).go();
        await _db.delete(_db.categories).go();
        await _db.delete(_db.categoryGroups).go();
        await _db
            .into(_db.categoryGroups)
            .insert(
              CategoryGroupsCompanion.insert(
                id: spendingGroupId,
                name: 'Spending',
                isIncome: const Value(false),
                sortOrder: const Value(0),
              ),
            );
        await _db
            .into(_db.categoryGroups)
            .insert(
              CategoryGroupsCompanion.insert(
                id: incomeGroupId,
                name: 'Income',
                isIncome: const Value(true),
                sortOrder: const Value(1),
              ),
            );
        Future<void> insertTree(
          String groupId,
          List<_DefaultCategoryNode> nodes,
        ) async {
          var order = 0;
          for (final node in nodes) {
            final parentId = _uuid.v4();
            final parent = CategoryRow(
              id: parentId,
              name: node.name,
              groupId: groupId,
              parentId: null,
              color: null,
              icon: defaultCategoryEmoji(node.name),
              hidden: false,
              sortOrder: order++,
              updatedAt: now,
            );
            inserted.add(parent);
            await _db
                .into(_db.categories)
                .insert(
                  CategoriesCompanion.insert(
                    id: parent.id,
                    name: parent.name,
                    groupId: parent.groupId,
                    parentId: const Value(null),
                    icon: Value(parent.icon),
                    sortOrder: Value(parent.sortOrder),
                    updatedAt: parent.updatedAt,
                  ),
                );
            for (final childName in node.children) {
              final child = CategoryRow(
                id: _uuid.v4(),
                name: childName,
                groupId: groupId,
                parentId: parentId,
                color: null,
                icon: defaultCategoryEmoji(childName),
                hidden: false,
                sortOrder: order++,
                updatedAt: now,
              );
              inserted.add(child);
              await _db
                  .into(_db.categories)
                  .insert(
                    CategoriesCompanion.insert(
                      id: child.id,
                      name: child.name,
                      groupId: child.groupId,
                      parentId: Value(parentId),
                      icon: Value(child.icon),
                      sortOrder: Value(child.sortOrder),
                      updatedAt: child.updatedAt,
                    ),
                  );
            }
          }
        }

        await insertTree(spendingGroupId, _defaultSpendingTree);
        await insertTree(incomeGroupId, _defaultIncomeTree);
      });

      if (_changes == null) return;
      for (final txId in affectedTx) {
        final row = await (_db.select(
          _db.transactions,
        )..where((t) => t.id.equals(txId))).getSingleOrNull();
        if (row != null) {
          await _changes.upsert(
            'transactions',
            txId,
            row.toJson(),
            changedFields: {'categoryId', 'updatedAt'},
          );
        }
      }
      for (final recurrenceId in affectedRecurrences) {
        final row =
            await (_db.select(_db.recurrences)
                  ..where((recurrence) => recurrence.id.equals(recurrenceId)))
                .getSingleOrNull();
        if (row != null) {
          await _changes.upsert(
            'recurrences',
            recurrenceId,
            row.toJson(),
            changedFields: {'categoryId', 'updatedAt'},
          );
        }
      }
      for (final id in oldBudgets) {
        await _changes.delete('budgets', id);
      }
      for (final row in oldCategories) {
        await _changes.delete('categories', row.id);
      }
      for (final row in oldGroups) {
        await _changes.delete('category_groups', row.id);
      }
      await _logGroup(spendingGroupId);
      await _logGroup(incomeGroupId);
      for (final row in inserted) {
        await _changes.upsert('categories', row.id, row.toJson());
      }
    });
  }

  Future<void> reorderVisible(List<String> orderedIds) async {
    return _command(() async {
      final now = DateTime.now().millisecondsSinceEpoch;
      await _db.transaction(() async {
        for (var i = 0; i < orderedIds.length; i++) {
          await (_db.update(
            _db.categories,
          )..where((t) => t.id.equals(orderedIds[i]))).write(
            CategoriesCompanion(
              sortOrder: Value(i * 10),
              updatedAt: Value(now),
            ),
          );
        }
      });
      for (final id in orderedIds) {
        await _logCategory(id, changedFields: {'sortOrder', 'updatedAt'});
      }
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
      (ref) => CategoryRepository(
        ref.watch(dbProvider),
        changes: ref.watch(syncWriterProvider),
      ),
    );

final StreamProvider<List<CategoryRow>> categoriesListProvider =
    StreamProvider<List<CategoryRow>>(
      (ref) => ref.watch(categoryRepoProvider).watch(),
    );

final StreamProvider<List<CategoryGroupRow>> categoryGroupsListProvider =
    StreamProvider<List<CategoryGroupRow>>(
      (ref) => ref.watch(categoryRepoProvider).watchGroups(),
    );

final categoryByIdProvider = StreamProvider.family<CategoryRow?, String>(
  (ref, id) => ref.watch(categoryRepoProvider).watchById(id),
);

enum _Sentinel { value }

class _DefaultCategoryNode {
  const _DefaultCategoryNode(this.name, {required this.children});

  final String name;
  final List<String> children;
}
