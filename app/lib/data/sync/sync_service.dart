import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/accounts/data/account_repository.dart';
import '../../features/categories/data/category_repository.dart';
import '../../features/payees/data/payee_repository.dart';
import '../../features/transactions/data/transaction_repository.dart';
import '../../state/providers.dart';
import '../actual/actual_client.dart';
import '../actual/actual_dto.dart';
import '../db/database.dart';

class SyncResult {
  const SyncResult({required this.pushed, required this.pulled, required this.errors});
  final int pushed;
  final int pulled;
  final List<String> errors;
}

class SyncService {
  SyncService({
    required this.db,
    required this.client,
    required this.budgetSyncId,
    required this.accountRepo,
    required this.categoryRepo,
    required this.payeeRepo,
    required this.txRepo,
  });

  final AppDatabase db;
  final ActualClient client;
  final String budgetSyncId;
  final AccountRepository accountRepo;
  final CategoryRepository categoryRepo;
  final PayeeRepository payeeRepo;
  final TransactionRepository txRepo;

  /// Initial backfill: accounts, categorygroups, payees, last 90 days of tx.
  Future<SyncResult> initialPull() async {
    final errors = <String>[];
    var pulled = 0;
    try {
      final accounts = await client.getAccounts(budgetSyncId);
      await accountRepo.upsertFromServer(accounts);
      pulled += accounts.length;
    } catch (e) {
      errors.add('accounts: $e');
    }
    try {
      final groups = await client.getCategoryGroups(budgetSyncId);
      await categoryRepo.upsertFromServer(groups);
      pulled += groups.fold<int>(0, (s, g) => s + g.categories.length + 1);
    } catch (e) {
      errors.add('categories: $e');
    }
    try {
      final payees = await client.getPayees(budgetSyncId);
      await payeeRepo.upsertFromServer(payees);
      pulled += payees.length;
    } catch (e) {
      errors.add('payees: $e');
    }

    final since = DateTime.now().subtract(const Duration(days: 90));
    final accts = await accountRepo.list(includeClosed: true);
    for (final a in accts) {
      final actualId = a.actualId;
      if (actualId == null) continue;
      try {
        final tx = await client.getTransactions(
          budgetSyncId: budgetSyncId,
          accountId: actualId,
          sinceDate: since,
        );
        await _ingestRemoteTransactions(a.id, tx);
        pulled += tx.length;
      } catch (e) {
        errors.add('tx ${a.name}: $e');
      }
    }
    return SyncResult(pushed: 0, pulled: pulled, errors: errors);
  }

  Future<SyncResult> pullDelta() => initialPull();

  Future<SyncResult> pushPending() async {
    var pushed = 0;
    final errors = <String>[];

    final pending = await (db.select(db.transactions)
          ..where((t) => t.syncStatus.equals('pending_push')))
        .get();

    final byAccount = <String, List<TransactionRow>>{};
    for (final t in pending) {
      byAccount.putIfAbsent(t.accountId, () => []).add(t);
    }

    for (final entry in byAccount.entries) {
      final acct = await accountRepo.byId(entry.key);
      final actualAcctId = acct?.actualId;
      if (actualAcctId == null) {
        for (final t in entry.value) {
          await txRepo.markPushFailed(t.id, 'account not synced');
          errors.add('account ${acct?.name ?? entry.key} has no server id');
        }
        continue;
      }

      for (final t in entry.value) {
        try {
          final payee = t.payeeId == null ? null : await payeeRepo.byId(t.payeeId!);
          final category = t.categoryId == null
              ? null
              : await categoryRepo.byId(t.categoryId!);
          final dto = ActualTransactionDto(
            id: '',
            account: actualAcctId,
            date: t.date,
            amount: t.amountCents,
            payee: payee?.actualId,
            payeeName: payee == null ? t.payeeName : null,
            category: category?.actualId,
            notes: t.notes,
            importedId: 'gullak:${t.id}',
            cleared: t.cleared,
          );
          await client.importTransactions(
            budgetSyncId: budgetSyncId,
            accountId: actualAcctId,
            transactions: [dto],
          );
          // The next pull will fill in `actualId` once the server returns
          // the row. For now we just mark synced — `imported_id` makes
          // re-pushes idempotent.
          await txRepo.markSynced(t.id, null);
          pushed += 1;
        } catch (e) {
          await txRepo.markPushFailed(t.id, e.toString());
          errors.add(e.toString());
        }
      }
    }

    final pendingDeletes = await (db.select(db.transactions)
          ..where((t) => t.syncStatus.equals('pending_delete')))
        .get();
    for (final t in pendingDeletes) {
      // We can only delete on the server if we know its real id. If we
      // never finished the original push (no actualId yet), drop the
      // tombstone locally — the transaction was never visible to Actual.
      final actualId = t.actualId;
      if (actualId == null) {
        await txRepo.hardDelete(t.id);
        continue;
      }
      try {
        await client.deleteTransaction(
          budgetSyncId: budgetSyncId,
          transactionId: actualId,
        );
        await txRepo.hardDelete(t.id);
        pushed += 1;
      } catch (e) {
        await txRepo.markPushFailed(t.id, e.toString());
        errors.add(e.toString());
      }
    }

    return SyncResult(pushed: pushed, pulled: 0, errors: errors);
  }

  Future<void> _ingestRemoteTransactions(
      String localAccountId, List<ActualTransactionDto> remote) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.batch((batch) {
      for (final r in remote) {
        final localId = r.importedId != null && r.importedId!.startsWith('gullak:')
            ? r.importedId!.substring('gullak:'.length)
            : r.id;
        batch.insert(
          db.transactions,
          TransactionsCompanion.insert(
            id: localId,
            accountId: localAccountId,
            amountCents: r.amount,
            date: r.date,
            createdAt: now,
            updatedAt: now,
            actualId: Value(r.id),
            categoryId: Value(r.category),
            payeeId: Value(r.payee),
            payeeName: Value(r.payeeName),
            notes: Value(r.notes),
            cleared: Value(r.cleared),
            origin: const Value('imported'),
            originRef: Value(r.importedId),
            syncStatus: const Value('synced'),
          ),
          mode: InsertMode.insertOrReplace,
        );
      }
    });
  }
}

final FutureProvider<SyncService?> syncServiceProvider =
    FutureProvider<SyncService?>((ref) async {
  final clientFuture = ref.watch(actualClientProvider.future);
  final s = ref.watch(secureStoreProvider);
  final budget = await s.readBudgetSyncId();
  if (budget == null) return null;
  final client = await clientFuture;
  return SyncService(
    db: ref.watch(dbProvider),
    client: client,
    budgetSyncId: budget,
    accountRepo: ref.watch(accountRepoProvider),
    categoryRepo: ref.watch(categoryRepoProvider),
    payeeRepo: ref.watch(payeeRepoProvider),
    txRepo: ref.watch(transactionRepoProvider),
  );
});

class SyncController extends AsyncNotifier<SyncResult?> {
  @override
  Future<SyncResult?> build() async => null;

  Future<void> sync({bool initial = false}) async {
    state = const AsyncLoading<SyncResult?>();
    state = await AsyncValue.guard<SyncResult?>(() async {
      final svc = await ref.read(syncServiceProvider.future);
      if (svc == null) throw StateError('not configured');
      final pushed = await svc.pushPending();
      final pulled = initial ? await svc.initialPull() : await svc.pullDelta();
      ref
        ..invalidate(transactionRepoProvider)
        ..invalidate(accountsListProvider)
        ..invalidate(payeesListProvider)
        ..invalidate(categoriesListProvider)
        ..invalidate(categoryGroupsListProvider)
        ..invalidate(monthSpendProvider)
        ..invalidate(todaySpendProvider)
        ..invalidate(recentTransactionsProvider);
      return SyncResult(
        pushed: pushed.pushed,
        pulled: pulled.pulled,
        errors: [...pushed.errors, ...pulled.errors],
      );
    });
  }
}

final AsyncNotifierProvider<SyncController, SyncResult?>
    syncControllerProvider =
    AsyncNotifierProvider<SyncController, SyncResult?>(SyncController.new);
