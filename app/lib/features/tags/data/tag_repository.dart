import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../sync/changelog_writer.dart';

export '../../../data/db/database.dart' show TagRow;

class TagAnalytics {
  const TagAnalytics({
    required this.tag,
    required this.transactionCount,
    required this.totalSpendCents,
  });

  final TagRow tag;
  final int transactionCount;
  final int totalSpendCents;
}

class TagBreakdown {
  const TagBreakdown({
    required this.label,
    required this.amountCents,
    this.icon,
    this.color,
  });

  final String label;
  final int amountCents;
  final String? icon;
  final int? color;
}

class TagTimelinePoint {
  const TagTimelinePoint({required this.month, required this.amountCents});

  final String month;
  final int amountCents;
}

class TagRepository {
  TagRepository(this._db, {ChangeLogWriter? changes}) : _changes = changes;

  final AppDatabase _db;
  final ChangeLogWriter? _changes;
  static const _uuid = Uuid();

  Future<void> _logTag(String id) async {
    if (_changes == null) return;
    final row = await byId(id);
    if (row != null) await _changes.upsert('tags', id, row.toJson());
  }

  Future<void> _logLink(String id) async {
    if (_changes == null) return;
    final row = await (_db.select(
      _db.transactionTags,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (row != null) {
      await _changes.upsert('transaction_tags', id, row.toJson());
    }
  }

  Stream<List<TagRow>> watchAll({bool includeArchived = false}) {
    final q = _db.select(_db.tags)..orderBy([(t) => OrderingTerm.asc(t.name)]);
    if (!includeArchived) q.where((t) => t.archived.equals(false));
    return q.watch();
  }

  Future<List<TagRow>> list({bool includeArchived = false}) {
    final q = _db.select(_db.tags)..orderBy([(t) => OrderingTerm.asc(t.name)]);
    if (!includeArchived) q.where((t) => t.archived.equals(false));
    return q.get();
  }

  Future<TagRow?> byId(String id) {
    return (_db.select(
      _db.tags,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
  }

  Future<String> create({required String name, int? color}) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) throw ArgumentError('tag name cannot be empty');
    final existing =
        await (_db.select(_db.tags)
              ..where((t) => t.name.lower().equals(trimmed.toLowerCase())))
            .getSingleOrNull();
    if (existing != null) return existing.id;
    final id = _uuid.v4();
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db
        .into(_db.tags)
        .insert(
          TagsCompanion.insert(
            id: id,
            name: trimmed,
            createdAt: now,
            updatedAt: now,
            color: Value(color),
          ),
        );
    await _logTag(id);
    return id;
  }

  Future<void> update(
    String id, {
    String? name,
    Object? color = _Sentinel.value,
    bool? archived,
  }) async {
    await (_db.update(_db.tags)..where((t) => t.id.equals(id))).write(
      TagsCompanion(
        name: name == null ? const Value.absent() : Value(name.trim()),
        color: identical(color, _Sentinel.value)
            ? const Value.absent()
            : Value(color as int?),
        archived: archived == null ? const Value.absent() : Value(archived),
        updatedAt: Value(DateTime.now().millisecondsSinceEpoch),
      ),
    );
    await _logTag(id);
  }

  Future<List<TagRow>> tagsForTransaction(String transactionId) async {
    final rows =
        await (_db.select(_db.transactionTags).join([
                innerJoin(
                  _db.tags,
                  _db.tags.id.equalsExp(_db.transactionTags.tagId),
                ),
              ])
              ..where(_db.transactionTags.transactionId.equals(transactionId))
              ..orderBy([OrderingTerm.asc(_db.tags.name)]))
            .get();
    return rows.map((r) => r.readTable(_db.tags)).toList();
  }

  Stream<List<TagRow>> watchTagsForTransaction(String transactionId) {
    final q =
        _db.select(_db.transactionTags).join([
            innerJoin(
              _db.tags,
              _db.tags.id.equalsExp(_db.transactionTags.tagId),
            ),
          ])
          ..where(_db.transactionTags.transactionId.equals(transactionId))
          ..orderBy([OrderingTerm.asc(_db.tags.name)]);
    return q.watch().map(
      (rows) => rows.map((r) => r.readTable(_db.tags)).toList(),
    );
  }

  Future<void> setTransactionTags(
    String transactionId,
    List<String> tagIds,
  ) async {
    final wanted = tagIds.toSet();
    final existing = await (_db.select(
      _db.transactionTags,
    )..where((t) => t.transactionId.equals(transactionId))).get();
    final existingByTag = {for (final row in existing) row.tagId: row};
    final now = DateTime.now().millisecondsSinceEpoch;

    for (final row in existing) {
      if (wanted.contains(row.tagId)) continue;
      await (_db.delete(
        _db.transactionTags,
      )..where((t) => t.id.equals(row.id))).go();
      await _changes?.delete('transaction_tags', row.id);
    }
    for (final tagId in wanted) {
      if (existingByTag.containsKey(tagId)) continue;
      final id = _uuid.v4();
      await _db
          .into(_db.transactionTags)
          .insert(
            TransactionTagsCompanion.insert(
              id: id,
              transactionId: transactionId,
              tagId: tagId,
              updatedAt: now,
            ),
          );
      await _logLink(id);
    }
  }

  Stream<List<TagAnalytics>> watchAnalytics() {
    return _db
        .customSelect(
          'SELECT tags.id, tags.name, tags.color, tags.archived, '
          'tags.created_at, tags.updated_at, '
          'COUNT(transactions.id) AS txn_count, '
          'COALESCE(SUM(CASE WHEN transactions.amount_cents < 0 '
          'THEN -transactions.amount_cents ELSE 0 END), 0) AS spend '
          'FROM tags '
          'LEFT JOIN transaction_tags ON transaction_tags.tag_id = tags.id '
          'LEFT JOIN transactions ON transactions.id = transaction_tags.transaction_id '
          'AND transactions.parent_id IS NULL AND transactions.transfer_group_id IS NULL '
          'WHERE tags.archived = 0 '
          'GROUP BY tags.id '
          'ORDER BY spend DESC, tags.name ASC',
          readsFrom: {_db.tags, _db.transactionTags, _db.transactions},
        )
        .watch()
        .map(
          (rows) => rows.map((r) {
            final tag = TagRow(
              id: r.read<String>('id'),
              name: r.read<String>('name'),
              color: r.readNullable<int>('color'),
              archived: (r.read<int>('archived')) != 0,
              createdAt: r.read<int>('created_at'),
              updatedAt: r.read<int>('updated_at'),
            );
            return TagAnalytics(
              tag: tag,
              transactionCount: r.read<int>('txn_count'),
              totalSpendCents: r.read<int>('spend'),
            );
          }).toList(),
        );
  }

  Future<List<TagBreakdown>> categoryBreakdown(String tagId) async {
    final rows = await _db
        .customSelect(
          'SELECT COALESCE(categories.name, "Uncategorised") AS label, '
          'categories.icon AS icon, categories.color AS color, '
          'COALESCE(SUM(CASE WHEN transactions.amount_cents < 0 '
          'THEN -transactions.amount_cents ELSE 0 END), 0) AS spend '
          'FROM transaction_tags '
          'JOIN transactions ON transactions.id = transaction_tags.transaction_id '
          'LEFT JOIN categories ON categories.id = transactions.category_id '
          'WHERE transaction_tags.tag_id = ? '
          'AND transactions.parent_id IS NULL AND transactions.transfer_group_id IS NULL '
          'GROUP BY label, categories.icon, categories.color '
          'HAVING spend > 0 '
          'ORDER BY spend DESC',
          variables: [Variable.withString(tagId)],
          readsFrom: {_db.transactionTags, _db.transactions, _db.categories},
        )
        .get();
    return [
      for (final r in rows)
        TagBreakdown(
          label: r.read<String>('label'),
          icon: r.readNullable<String>('icon'),
          color: r.readNullable<int>('color'),
          amountCents: r.read<int>('spend'),
        ),
    ];
  }

  Future<List<TagBreakdown>> accountBreakdown(String tagId) async {
    final rows = await _db
        .customSelect(
          'SELECT COALESCE(accounts.name, "Unknown account") AS label, '
          'COALESCE(SUM(CASE WHEN transactions.amount_cents < 0 '
          'THEN -transactions.amount_cents ELSE 0 END), 0) AS spend '
          'FROM transaction_tags '
          'JOIN transactions ON transactions.id = transaction_tags.transaction_id '
          'LEFT JOIN accounts ON accounts.id = transactions.account_id '
          'WHERE transaction_tags.tag_id = ? '
          'AND transactions.parent_id IS NULL AND transactions.transfer_group_id IS NULL '
          'GROUP BY label '
          'HAVING spend > 0 '
          'ORDER BY spend DESC',
          variables: [Variable.withString(tagId)],
          readsFrom: {_db.transactionTags, _db.transactions, _db.accounts},
        )
        .get();
    return [
      for (final r in rows)
        TagBreakdown(
          label: r.read<String>('label'),
          amountCents: r.read<int>('spend'),
        ),
    ];
  }

  Future<List<TagTimelinePoint>> monthlyTimeline(String tagId) async {
    final rows = await _db
        .customSelect(
          'SELECT substr(transactions.date, 1, 7) AS month, '
          'COALESCE(SUM(CASE WHEN transactions.amount_cents < 0 '
          'THEN -transactions.amount_cents ELSE 0 END), 0) AS spend '
          'FROM transaction_tags '
          'JOIN transactions ON transactions.id = transaction_tags.transaction_id '
          'WHERE transaction_tags.tag_id = ? '
          'AND transactions.parent_id IS NULL AND transactions.transfer_group_id IS NULL '
          'GROUP BY month '
          'HAVING spend > 0 '
          'ORDER BY month ASC',
          variables: [Variable.withString(tagId)],
          readsFrom: {_db.transactionTags, _db.transactions},
        )
        .get();
    return [
      for (final r in rows)
        TagTimelinePoint(
          month: r.read<String>('month'),
          amountCents: r.read<int>('spend'),
        ),
    ];
  }
}

enum _Sentinel { value }

final tagRepoProvider = Provider<TagRepository>(
  (ref) => TagRepository(
    ref.watch(dbProvider),
    changes: ref.watch(changeLogWriterProvider),
  ),
);

final tagsListProvider = StreamProvider<List<TagRow>>(
  (ref) => ref.watch(tagRepoProvider).watchAll(),
);

final tagAnalyticsProvider = StreamProvider<List<TagAnalytics>>(
  (ref) => ref.watch(tagRepoProvider).watchAnalytics(),
);

final tagsForTransactionProvider = StreamProvider.family<List<TagRow>, String>(
  (ref, id) => ref.watch(tagRepoProvider).watchTagsForTransaction(id),
);

final tagByIdProvider = FutureProvider.family<TagRow?, String>(
  (ref, id) => ref.watch(tagRepoProvider).byId(id),
);
