import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/logger.dart';
import '../data/db/database.dart';
import '../state/providers.dart';

/// Applies server-side change-log entries to the local Drift store
/// using last-write-wins per row by `updatedAt`. Bypasses the
/// repository layer so it doesn't recursively log into the local
/// change_log (which would push back to the server in the next sync).
class RemoteApplier {
  RemoteApplier(this._db);
  final AppDatabase _db;

  Future<void> apply(Map<String, dynamic> change) async {
    final resource = change['resource'] as String?;
    final id = change['resourceId'] as String?;
    final op = change['op'] as String?;
    final payload = change['payload'];
    if (resource == null || id == null || op == null) return;

    try {
      switch (resource) {
        case 'accounts':
          await _applyAccount(id, op, payload);
          return;
        case 'category_groups':
          await _applyCategoryGroup(id, op, payload);
          return;
        case 'categories':
          await _applyCategory(id, op, payload);
          return;
        case 'payees':
          await _applyPayee(id, op, payload);
          return;
        case 'transactions':
          await _applyTransaction(id, op, payload);
          return;
        case 'budgets':
          await _applyBudget(id, op, payload);
          return;
        case 'recurrences':
          await _applyRecurrence(id, op, payload);
          return;
        default:
          log.w('sync: unknown resource $resource — skipping');
      }
    } catch (e) {
      log.w('sync: failed to apply $resource/$id: $e');
    }
  }

  bool _isNewer(int? localUpdatedAt, dynamic remoteUpdatedAt) {
    if (localUpdatedAt == null) return true;
    if (remoteUpdatedAt is! num) return false;
    return remoteUpdatedAt.toInt() >= localUpdatedAt;
  }

  Future<void> _applyAccount(String id, String op, dynamic payload) async {
    if (op == 'delete') {
      await (_db.delete(_db.accounts)..where((t) => t.id.equals(id))).go();
      return;
    }
    if (payload is! Map) return;
    final local = await (_db.select(
      _db.accounts,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (!_isNewer(local?.updatedAt, payload['updatedAt'])) return;
    await _db
        .into(_db.accounts)
        .insertOnConflictUpdate(
          AccountsCompanion(
            id: Value(id),
            name: Value(payload['name'] as String? ?? local?.name ?? ''),
            kind: Value(payload['kind'] as String? ?? 'checking'),
            openingBalanceCents: Value(
              (payload['openingBalanceCents'] as num?)?.toInt() ?? 0,
            ),
            onBudget: Value(payload['onBudget'] as bool? ?? true),
            archived: Value(payload['archived'] as bool? ?? false),
            sortOrder: Value((payload['sortOrder'] as num?)?.toInt() ?? 0),
            createdAt: Value(
              (payload['createdAt'] as num?)?.toInt() ??
                  local?.createdAt ??
                  DateTime.now().millisecondsSinceEpoch,
            ),
            updatedAt: Value((payload['updatedAt'] as num).toInt()),
          ),
        );
  }

  Future<void> _applyCategoryGroup(
    String id,
    String op,
    dynamic payload,
  ) async {
    if (op == 'delete') {
      await (_db.delete(
        _db.categoryGroups,
      )..where((t) => t.id.equals(id))).go();
      return;
    }
    if (payload is! Map) return;
    // CategoryGroups has no updatedAt in our schema — always apply.
    await _db
        .into(_db.categoryGroups)
        .insertOnConflictUpdate(
          CategoryGroupsCompanion(
            id: Value(id),
            name: Value(payload['name'] as String? ?? ''),
            isIncome: Value(payload['isIncome'] as bool? ?? false),
            sortOrder: Value((payload['sortOrder'] as num?)?.toInt() ?? 0),
          ),
        );
  }

  Future<void> _applyCategory(String id, String op, dynamic payload) async {
    if (op == 'delete') {
      await (_db.delete(_db.categories)..where((t) => t.id.equals(id))).go();
      return;
    }
    if (payload is! Map) return;
    final local = await (_db.select(
      _db.categories,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (!_isNewer(local?.updatedAt, payload['updatedAt'])) return;
    await _db
        .into(_db.categories)
        .insertOnConflictUpdate(
          CategoriesCompanion(
            id: Value(id),
            name: Value(payload['name'] as String? ?? ''),
            groupId: Value(payload['groupId'] as String? ?? ''),
            color: Value((payload['color'] as num?)?.toInt()),
            icon: Value(payload['icon'] as String?),
            hidden: Value(payload['hidden'] as bool? ?? false),
            sortOrder: Value((payload['sortOrder'] as num?)?.toInt() ?? 0),
            updatedAt: Value((payload['updatedAt'] as num).toInt()),
          ),
        );
  }

  Future<void> _applyPayee(String id, String op, dynamic payload) async {
    if (op == 'delete') {
      await (_db.delete(_db.payees)..where((t) => t.id.equals(id))).go();
      return;
    }
    if (payload is! Map) return;
    final local = await (_db.select(
      _db.payees,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (!_isNewer(local?.updatedAt, payload['updatedAt'])) return;
    await _db
        .into(_db.payees)
        .insertOnConflictUpdate(
          PayeesCompanion(
            id: Value(id),
            name: Value(payload['name'] as String? ?? ''),
            useCount: Value((payload['useCount'] as num?)?.toInt() ?? 0),
            updatedAt: Value((payload['updatedAt'] as num).toInt()),
          ),
        );
  }

  Future<void> _applyTransaction(String id, String op, dynamic payload) async {
    if (op == 'delete') {
      await (_db.delete(_db.transactions)..where((t) => t.id.equals(id))).go();
      return;
    }
    if (payload is! Map) return;
    final local = await (_db.select(
      _db.transactions,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (!_isNewer(local?.updatedAt, payload['updatedAt'])) return;
    await _db
        .into(_db.transactions)
        .insertOnConflictUpdate(
          TransactionsCompanion(
            id: Value(id),
            accountId: Value(payload['accountId'] as String? ?? ''),
            categoryId: Value(payload['categoryId'] as String?),
            payeeId: Value(payload['payeeId'] as String?),
            payeeName: Value(payload['payeeName'] as String?),
            amountCents: Value((payload['amountCents'] as num?)?.toInt() ?? 0),
            date: Value(payload['date'] as String? ?? ''),
            notes: Value(payload['notes'] as String?),
            cleared: Value(payload['cleared'] as bool? ?? false),
            origin: Value(payload['origin'] as String? ?? 'manual'),
            originRef: Value(payload['originRef'] as String?),
            transferAccountId: Value(payload['transferAccountId'] as String?),
            transferGroupId: Value(payload['transferGroupId'] as String?),
            parentId: Value(payload['parentId'] as String?),
            splitTotalCents: Value(
              (payload['splitTotalCents'] as num?)?.toInt(),
            ),
            createdAt: Value(
              (payload['createdAt'] as num?)?.toInt() ??
                  local?.createdAt ??
                  DateTime.now().millisecondsSinceEpoch,
            ),
            updatedAt: Value((payload['updatedAt'] as num).toInt()),
          ),
        );
  }

  Future<void> _applyBudget(String id, String op, dynamic payload) async {
    if (op == 'delete') {
      await (_db.delete(_db.budgets)..where((t) => t.id.equals(id))).go();
      return;
    }
    if (payload is! Map) return;
    final local = await (_db.select(
      _db.budgets,
    )..where((b) => b.id.equals(id))).getSingleOrNull();
    if (!_isNewer(local?.updatedAt, payload['updatedAt'])) return;
    await _db
        .into(_db.budgets)
        .insertOnConflictUpdate(
          BudgetsCompanion(
            id: Value(id),
            categoryId: Value(payload['categoryId'] as String? ?? ''),
            month: Value(payload['month'] as String? ?? ''),
            targetCents: Value((payload['targetCents'] as num?)?.toInt() ?? 0),
            rolloverCents: Value(
              (payload['rolloverCents'] as num?)?.toInt() ?? 0,
            ),
            updatedAt: Value((payload['updatedAt'] as num).toInt()),
          ),
        );
  }

  Future<void> _applyRecurrence(String id, String op, dynamic payload) async {
    if (op == 'delete') {
      await (_db.delete(_db.recurrences)..where((t) => t.id.equals(id))).go();
      return;
    }
    if (payload is! Map) return;
    final local = await (_db.select(
      _db.recurrences,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (!_isNewer(local?.updatedAt, payload['updatedAt'])) return;
    await _db
        .into(_db.recurrences)
        .insertOnConflictUpdate(
          RecurrencesCompanion(
            id: Value(id),
            accountId: Value(payload['accountId'] as String? ?? ''),
            categoryId: Value(payload['categoryId'] as String?),
            payeeId: Value(payload['payeeId'] as String?),
            payeeName: Value(payload['payeeName'] as String?),
            amountCents: Value((payload['amountCents'] as num?)?.toInt() ?? 0),
            notes: Value(payload['notes'] as String?),
            cadence: Value(payload['cadence'] as String? ?? 'monthly'),
            nextDate: Value(payload['nextDate'] as String? ?? ''),
            createdAt: Value(
              (payload['createdAt'] as num?)?.toInt() ??
                  local?.createdAt ??
                  DateTime.now().millisecondsSinceEpoch,
            ),
            updatedAt: Value((payload['updatedAt'] as num).toInt()),
          ),
        );
  }
}

final Provider<RemoteApplier> remoteApplierProvider = Provider<RemoteApplier>(
  (ref) => RemoteApplier(ref.read(dbProvider)),
);
