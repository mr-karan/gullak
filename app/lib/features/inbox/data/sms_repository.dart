import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/db/database.dart';
import '../../../data/sync/sync_service.dart';
import '../../../state/providers.dart';
import '../../accounts/data/account_repository.dart';
import '../../transactions/data/transaction_repository.dart';

class InboxItem {
  const InboxItem({
    required this.id,
    required this.address,
    required this.body,
    required this.receivedAt,
    this.suggestedPayee,
    this.suggestedAmountCents,
  });

  final int id;
  final String address;
  final String body;
  final int receivedAt;
  final String? suggestedPayee;
  final int? suggestedAmountCents;
}

class SmsRepository {
  SmsRepository(this.ref);
  final Ref ref;
  AppDatabase get _db => ref.read(dbProvider);

  Future<List<InboxItem>> listInbox() async {
    final rows = await (_db.select(_db.smsMessages)
          ..where((t) => t.candidateStatus.equals('inbox'))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
        .get();
    return rows.map(_mapRow).toList();
  }

  InboxItem _mapRow(SmsRow r) {
    String? payee;
    int? amount;
    if (r.candidateJson != null && r.candidateJson!.isNotEmpty) {
      try {
        final j = jsonDecode(r.candidateJson!) as Map<String, dynamic>;
        payee = j['payee'] as String?;
        amount = (j['amount_cents'] as num?)?.toInt();
      } catch (_) {}
    }
    return InboxItem(
      id: r.id,
      address: r.address,
      body: r.body,
      receivedAt: r.receivedAt,
      suggestedPayee: payee,
      suggestedAmountCents: amount,
    );
  }

  Future<void> dismiss(int id) async {
    await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
      const SmsMessagesCompanion(
        candidateStatus: Value('dismissed'),
      ),
    );
    ref.invalidate(inboxItemsProvider);
  }

  /// Confirm: turn the candidate into a real transaction.
  ///
  /// Account selection is best-effort: we match the candidate's account
  /// hint against local accounts; on no match we fall back to the user's
  /// default account.
  Future<void> confirm(int id) async {
    final row = await (_db.select(_db.smsMessages)..where((t) => t.id.equals(id))).getSingleOrNull();
    if (row == null) return;
    if (row.candidateJson == null) return;
    Map<String, dynamic> j;
    try {
      j = jsonDecode(row.candidateJson!) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final amount = (j['amount_cents'] as num?)?.toInt() ?? 0;
    if (amount == 0) return;
    final isIncome = j['is_income'] == true;
    final payee = j['payee'] as String?;
    final accountHint = (j['account_hint'] as String?)?.toLowerCase();
    final dateStr = j['date'] as String?;
    final date = (dateStr != null) ? DateTime.tryParse(dateStr) ?? DateTime.fromMillisecondsSinceEpoch(row.receivedAt) : DateTime.fromMillisecondsSinceEpoch(row.receivedAt);

    final accounts = await ref.read(accountRepoProvider).list(includeClosed: true);
    String? acctId;
    if (accountHint != null) {
      for (final a in accounts) {
        if (accountHint.contains(a.name.toLowerCase()) || a.name.toLowerCase().contains(accountHint)) {
          acctId = a.id;
          break;
        }
      }
    }
    acctId ??= accounts.where((a) => !a.offbudget && !a.closed).firstOrNull?.id ?? accounts.firstOrNull?.id;
    if (acctId == null) return;

    final signed = isIncome ? amount.abs() : -amount.abs();
    await ref.read(transactionRepoProvider).insertDraft(
          accountId: acctId,
          payeeName: payee,
          amountCents: signed,
          date: date,
          notes: 'SMS · ${row.address}',
          origin: 'sms',
          originRef: row.id.toString(),
        );

    await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
      const SmsMessagesCompanion(
        candidateStatus: Value('accepted'),
      ),
    );
    ref.invalidate(inboxItemsProvider);
    ref.invalidate(monthSpendProvider);
    ref.invalidate(todaySpendProvider);
    ref.invalidate(recentTransactionsProvider);
    ref.invalidate(transactionsListProvider);
    unawaited(ref.read(syncControllerProvider.notifier).sync());
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}

final Provider<SmsRepository> smsRepositoryProvider =
    Provider<SmsRepository>((ref) => SmsRepository(ref));

final FutureProvider<List<InboxItem>> inboxItemsProvider =
    FutureProvider<List<InboxItem>>((ref) {
  return ref.watch(smsRepositoryProvider).listInbox();
});
