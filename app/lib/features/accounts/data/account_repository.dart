import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../../sync/sync_writer.dart';
import '../../transactions/data/transaction_repository.dart';

export '../../../data/db/database.dart' show AccountRow;

/// Bank-ish accounts. Order here is the order shown in the UI
/// dropdown — Savings sits first because that's the default Indian
/// retail bank account; Current (the Indian term for what the rest
/// of the world calls "checking") follows. UI keeps accounts
/// off-budget when the kind implies it (investments, loans), but
/// the user can override via [onBudget].
///
/// `id` strings are persisted in the DB and MUST stay stable even
/// when the display label changes (e.g. 'checking' id → 'Current'
/// label). Don't rename the id without a migration.
enum AccountKind {
  savings('Savings'),
  checking('Current'),
  creditCard('Credit card'),
  cash('Cash'),
  wallet('UPI / Wallet'),
  investment('Investment'),
  loan('Loan');

  const AccountKind(this.label);
  final String label;

  String get id => switch (this) {
    AccountKind.checking => 'checking',
    AccountKind.savings => 'savings',
    AccountKind.creditCard => 'credit_card',
    AccountKind.cash => 'cash',
    AccountKind.wallet => 'wallet',
    AccountKind.investment => 'investment',
    AccountKind.loan => 'loan',
  };

  static AccountKind fromId(String id) =>
      values.firstWhere((k) => k.id == id, orElse: () => AccountKind.savings);

  bool get defaultsOffBudget =>
      this == AccountKind.investment || this == AccountKind.loan;
}

class AccountRepository {
  AccountRepository(this._db, {SyncWriter? changes}) : _changes = changes;
  final AppDatabase _db;
  final SyncWriter? _changes;
  static const _uuid = Uuid();

  Future<T> _command<T>(Future<T> Function() callback) =>
      _changes?.command(callback) ?? _db.transaction(callback);

  Future<void> _logRow(String id, {Set<String>? changedFields}) async {
    if (_changes == null) return;
    final row = await byId(id);
    if (row != null) {
      await _changes.upsert(
        'accounts',
        id,
        row.toJson(),
        changedFields: changedFields,
      );
    }
  }

  Future<List<AccountRow>> list({bool includeArchived = false}) {
    final q = _db.select(_db.accounts);
    if (!includeArchived) q.where((t) => t.archived.equals(false));
    q.orderBy([
      (t) => OrderingTerm.asc(t.sortOrder),
      (t) => OrderingTerm.asc(t.name),
    ]);
    return q.get();
  }

  Stream<List<AccountRow>> watch({bool includeArchived = false}) {
    final q = _db.select(_db.accounts);
    if (!includeArchived) q.where((t) => t.archived.equals(false));
    q.orderBy([
      (t) => OrderingTerm.asc(t.sortOrder),
      (t) => OrderingTerm.asc(t.name),
    ]);
    return q.watch();
  }

  Future<AccountRow?> byId(String id) => (_db.select(
    _db.accounts,
  )..where((t) => t.id.equals(id))).getSingleOrNull();

  Future<String> create({
    required String name,
    required AccountKind kind,
    int openingBalanceCents = 0,
    bool? onBudget,
    int? reconciledBalanceCents,
    int? reconciledAt,
  }) async {
    return _command(() async {
      final id = _uuid.v4();
      final now = DateTime.now().millisecondsSinceEpoch;
      await _db
          .into(_db.accounts)
          .insert(
            AccountsCompanion.insert(
              id: id,
              name: name,
              kind: Value(kind.id),
              openingBalanceCents: Value(openingBalanceCents),
              reconciledBalanceCents: Value(reconciledBalanceCents),
              reconciledAt: Value(reconciledAt),
              onBudget: Value(onBudget ?? !kind.defaultsOffBudget),
              createdAt: now,
              updatedAt: now,
            ),
          );
      await _logRow(id);
      return id;
    });
  }

  Future<void> update(
    String id, {
    String? name,
    AccountKind? kind,
    int? openingBalanceCents,
    bool? onBudget,
    Object? reconciledBalanceCents = _Sentinel.value,
    Object? reconciledAt = _Sentinel.value,
  }) async {
    return _command(() async {
      final now = DateTime.now().millisecondsSinceEpoch;
      await (_db.update(_db.accounts)..where((t) => t.id.equals(id))).write(
        AccountsCompanion(
          name: name == null ? const Value.absent() : Value(name),
          kind: kind == null ? const Value.absent() : Value(kind.id),
          openingBalanceCents: openingBalanceCents == null
              ? const Value.absent()
              : Value(openingBalanceCents),
          reconciledBalanceCents: _v<int?>(reconciledBalanceCents),
          reconciledAt: _v<int?>(reconciledAt),
          onBudget: onBudget == null ? const Value.absent() : Value(onBudget),
          updatedAt: Value(now),
        ),
      );
      await _logRow(
        id,
        changedFields: {
          if (name != null) 'name',
          if (kind != null) 'kind',
          if (openingBalanceCents != null) 'openingBalanceCents',
          if (!identical(reconciledBalanceCents, _Sentinel.value))
            'reconciledBalanceCents',
          if (!identical(reconciledAt, _Sentinel.value)) 'reconciledAt',
          if (onBudget != null) 'onBudget',
          'updatedAt',
        },
      );
    });
  }

  Future<void> archive(String id) async {
    return _command(() async {
      await (_db.update(_db.accounts)..where((t) => t.id.equals(id))).write(
        AccountsCompanion(
          archived: const Value(true),
          updatedAt: Value(DateTime.now().millisecondsSinceEpoch),
        ),
      );
      await _logRow(id, changedFields: {'archived', 'updatedAt'});
    });
  }

  Future<void> unarchive(String id) async {
    return _command(() async {
      await (_db.update(_db.accounts)..where((t) => t.id.equals(id))).write(
        AccountsCompanion(
          archived: const Value(false),
          updatedAt: Value(DateTime.now().millisecondsSinceEpoch),
        ),
      );
      await _logRow(id, changedFields: {'archived', 'updatedAt'});
    });
  }

  Future<void> reconcile(String id, int balanceCents) async {
    await update(
      id,
      reconciledBalanceCents: balanceCents,
      reconciledAt: DateTime.now().millisecondsSinceEpoch,
    );
  }

  /// Hard delete: drops the account and *also* its transactions. Use
  /// [archive] if you want to preserve history.
  Future<void> delete(String id) async {
    return _command(() async {
      final directTransactions = await (_db.select(
        _db.transactions,
      )..where((t) => t.accountId.equals(id))).get();
      final transferGroups = directTransactions
          .map((row) => row.transferGroupId)
          .whereType<String>()
          .toSet();
      final pairedTransactions = transferGroups.isEmpty
          ? <TransactionRow>[]
          : await (_db.select(
              _db.transactions,
            )..where((row) => row.transferGroupId.isIn(transferGroups))).get();
      final txIds = {
        ...directTransactions.map((row) => row.id),
        ...pairedTransactions.map((row) => row.id),
      }.toList();
      final linkIds = txIds.isEmpty
          ? <String>[]
          : (await (_db.select(
                  _db.transactionTags,
                )..where((row) => row.transactionId.isIn(txIds))).get())
                .map((row) => row.id)
                .toList();
      final recurrenceIds =
          (await (_db.select(
                _db.recurrences,
              )..where((row) => row.accountId.equals(id))).get())
              .map((row) => row.id)
              .toList();
      await _db.transaction(() async {
        if (linkIds.isNotEmpty) {
          await (_db.delete(
            _db.transactionTags,
          )..where((row) => row.id.isIn(linkIds))).go();
        }
        await (_db.delete(
          _db.transactions,
        )..where((t) => t.id.isIn(txIds))).go();
        await (_db.delete(
          _db.recurrences,
        )..where((row) => row.accountId.equals(id))).go();
        await (_db.delete(_db.accounts)..where((t) => t.id.equals(id))).go();
      });
      if (_changes != null) {
        for (final linkId in linkIds) {
          await _changes.delete('transaction_tags', linkId);
        }
        for (final tid in txIds) {
          await _changes.delete('transactions', tid);
        }
        for (final recurrenceId in recurrenceIds) {
          await _changes.delete('recurrences', recurrenceId);
        }
        await _changes.delete('accounts', id);
      }
    });
  }

  /// Sum of opening balance + all transactions on this account.
  /// Transfers are double-entry rows so they balance themselves.
  Future<int> balanceCents(String id) async {
    final acct = await byId(id);
    if (acct == null) return 0;
    final sumExpr = _db.transactions.amountCents.sum();
    final r =
        await (_db.selectOnly(_db.transactions)
              ..addColumns([sumExpr])
              ..where(
                _db.transactions.accountId.equals(id) &
                    _db.transactions.parentId.isNull(),
              ))
            .getSingle();
    final txSum = r.read(sumExpr) ?? 0;
    return acct.openingBalanceCents + txSum;
  }
}

enum _Sentinel { value }

Value<T?> _v<T>(Object? v) =>
    identical(v, _Sentinel.value) ? const Value.absent() : Value(v as T?);

final Provider<AccountRepository> accountRepoProvider =
    Provider<AccountRepository>(
      (ref) => AccountRepository(
        ref.watch(dbProvider),
        changes: ref.watch(syncWriterProvider),
      ),
    );

final StreamProvider<List<AccountRow>> accountsListProvider =
    StreamProvider<List<AccountRow>>((ref) {
      return ref.watch(accountRepoProvider).watch();
    });

final accountBalanceProvider = FutureProvider.family<int, String>((ref, id) {
  // Re-read whenever transactions change. Drift's reactive query reflects
  // any mutation on the transactions table, so this stays in sync as the
  // user adds/edits/deletes rows. accountsListProvider only fires on
  // accounts-table mutations and is not enough on its own.
  ref.watch(recentTransactionsProvider);
  return ref.watch(accountRepoProvider).balanceCents(id);
});
