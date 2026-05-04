import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';

export '../../../data/db/database.dart' show AccountRow;

/// Bank-ish accounts: Checking, Savings, Credit Card, Cash, Wallet,
/// Investment, Loan. UI keeps them off-budget when the kind implies
/// it (investments, loans), but the user can override via [onBudget].
enum AccountKind {
  checking('Checking'),
  savings('Savings'),
  creditCard('Credit Card'),
  cash('Cash'),
  wallet('Wallet'),
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
      values.firstWhere((k) => k.id == id, orElse: () => AccountKind.checking);

  bool get defaultsOffBudget =>
      this == AccountKind.investment || this == AccountKind.loan;
}

class AccountRepository {
  AccountRepository(this._db);
  final AppDatabase _db;
  static const _uuid = Uuid();

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
  }) async {
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
            onBudget: Value(onBudget ?? !kind.defaultsOffBudget),
            createdAt: now,
            updatedAt: now,
          ),
        );
    return id;
  }

  Future<void> update(
    String id, {
    String? name,
    AccountKind? kind,
    int? openingBalanceCents,
    bool? onBudget,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (_db.update(_db.accounts)..where((t) => t.id.equals(id))).write(
      AccountsCompanion(
        name: name == null ? const Value.absent() : Value(name),
        kind: kind == null ? const Value.absent() : Value(kind.id),
        openingBalanceCents: openingBalanceCents == null
            ? const Value.absent()
            : Value(openingBalanceCents),
        onBudget: onBudget == null ? const Value.absent() : Value(onBudget),
        updatedAt: Value(now),
      ),
    );
  }

  Future<void> archive(String id) =>
      (_db.update(_db.accounts)..where((t) => t.id.equals(id))).write(
        const AccountsCompanion(archived: Value(true)),
      );

  Future<void> unarchive(String id) =>
      (_db.update(_db.accounts)..where((t) => t.id.equals(id))).write(
        const AccountsCompanion(archived: Value(false)),
      );

  /// Hard delete: drops the account and *also* its transactions. Use
  /// [archive] if you want to preserve history.
  Future<void> delete(String id) async {
    await _db.transaction(() async {
      await (_db.delete(
        _db.transactions,
      )..where((t) => t.accountId.equals(id))).go();
      await (_db.delete(_db.accounts)..where((t) => t.id.equals(id))).go();
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

final Provider<AccountRepository> accountRepoProvider =
    Provider<AccountRepository>(
      (ref) => AccountRepository(ref.watch(dbProvider)),
    );

final StreamProvider<List<AccountRow>> accountsListProvider =
    StreamProvider<List<AccountRow>>((ref) {
      return ref.watch(accountRepoProvider).watch();
    });

final accountBalanceProvider = FutureProvider.family<int, String>((ref, id) {
  // Re-read whenever transactions change, by depending on the stream.
  ref.watch(accountsListProvider);
  return ref.watch(accountRepoProvider).balanceCents(id);
});
