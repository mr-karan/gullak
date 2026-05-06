import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../accounts/data/account_repository.dart';
import '../../categories/data/category_repository.dart';
import '../../entry/entry_memory.dart';
import '../../payees/data/payee_repository.dart';
import '../../transactions/data/transaction_repository.dart';

class InboxItem {
  const InboxItem({
    required this.id,
    required this.address,
    required this.body,
    required this.receivedAt,
    required this.status,
    this.suggestedPayee,
    this.suggestedAmountCents,
    this.suggestedAccountName,
    this.suggestedCategoryName,
  });

  final int id;
  final String address;
  final String body;
  final int receivedAt;

  /// Underlying [SmsMessages.candidateStatus]. 'inbox' means the parser
  /// produced a candidate the user can confirm. 'error' means the
  /// classifier was confident the SMS is transactional but no parsed
  /// candidate is available — the row still shows up so the user can
  /// open it in QuickEntry manually instead of it disappearing into
  /// the void.
  final String status;
  final String? suggestedPayee;
  final int? suggestedAmountCents;
  final String? suggestedAccountName;
  final String? suggestedCategoryName;

  bool get hasCandidate => status == 'inbox' && suggestedAmountCents != null;
}

class SmsRepository {
  SmsRepository(this.ref);
  final Ref ref;

  AppDatabase get _db => ref.read(dbProvider);

  /// Pending review: classifier-positive SMS that either parsed into a
  /// candidate (status='inbox') or that the parser couldn't structure
  /// (status='error'). The latter still belongs in the user's view —
  /// silently dropping classifier-positive SMS made the Inbox look
  /// permanently empty when the LLM was misconfigured or the parse
  /// cache was poisoned.
  static const _pendingStatuses = ['inbox', 'error'];

  /// Everything we ingested but didn't pin to the pending bucket: the
  /// classifier-rejected SMS (`none`), duplicates of an existing
  /// transaction (`duplicate`), and rows the user explicitly
  /// dismissed (`dismissed`). Surfaced via the Inbox "Ignored" toggle
  /// so a user can still log one of these manually if the classifier
  /// was wrong about it.
  static const _ignoredStatuses = ['none', 'duplicate', 'dismissed'];

  Future<List<InboxItem>> listInbox() async {
    final rows =
        await (_db.select(_db.smsMessages)
              ..where((t) => t.candidateStatus.isIn(_pendingStatuses))
              ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
            .get();
    return _enrichRows(rows);
  }

  /// Reactive inbox: emits a fresh list whenever [SmsMessages] changes.
  /// Drift watches the underlying table, so newly-ingested SMS show
  /// up automatically without anyone calling [Ref.invalidate].
  Stream<List<InboxItem>> watchInbox() {
    final query = _db.select(_db.smsMessages)
      ..where((t) => t.candidateStatus.isIn(_pendingStatuses))
      ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]);
    return query.watch().asyncMap(_enrichRows);
  }

  /// Reactive feed of SMS the pipeline classified as non-transactional,
  /// duplicate, or the user dismissed. Caller is the Inbox screen's
  /// "Ignored" view. Capped at the most recent 200 so the list stays
  /// manageable without paging.
  Stream<List<InboxItem>> watchIgnored() {
    final query = _db.select(_db.smsMessages)
      ..where((t) => t.candidateStatus.isIn(_ignoredStatuses))
      ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)])
      ..limit(200);
    return query.watch().asyncMap(_enrichRows);
  }

  /// Force a row back into the pending Inbox bucket, e.g. when the
  /// user disagrees with the classifier's "non-transactional" call.
  /// Status flips to `inbox`; the parser cache is dropped so the next
  /// re-scan reparses this template.
  Future<void> reopen(int id) async {
    await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
      const SmsMessagesCompanion(candidateStatus: Value('inbox')),
    );
  }

  Future<List<InboxItem>> _enrichRows(List<SmsRow> rows) async {
    if (rows.isEmpty) return const [];
    final accounts = await ref.read(accountRepoProvider).list();
    final categories = await ref.read(categoryRepoProvider).list();
    final payees = await ref.read(payeeRepoProvider).list();
    Map<String, dynamic> categoryHintsByPayeeId = const {};
    try {
      categoryHintsByPayeeId =
          jsonDecode(ref.read(prefsProvider).payeeCategoryHints)
              as Map<String, dynamic>;
    } catch (_) {}
    return rows
        .map(
          (r) =>
              _mapRow(r, accounts, categories, payees, categoryHintsByPayeeId),
        )
        .toList();
  }

  InboxItem _mapRow(
    SmsRow r,
    List<AccountRow> accounts,
    List<CategoryRow> categories,
    List<PayeeRow> payees,
    Map<String, dynamic> categoryHintsByPayeeId,
  ) {
    String? payeeText;
    int? amount;
    String? accountHint;
    String? categoryId;
    String? categoryHint;
    if (r.candidateJson != null && r.candidateJson!.isNotEmpty) {
      try {
        final j = jsonDecode(r.candidateJson!) as Map<String, dynamic>;
        payeeText = j['payee'] as String?;
        amount = (j['amount_cents'] as num?)?.toInt();
        accountHint = (j['account_hint'] as String?)?.toLowerCase();
        categoryId = j['category_id'] as String?;
        categoryHint = (j['category_hint'] as String?)?.toLowerCase();
      } catch (_) {}
    }

    String? accountName;
    if (accountHint != null && accountHint.isNotEmpty) {
      for (final a in accounts) {
        final n = a.name.toLowerCase();
        if (n == accountHint ||
            n.contains(accountHint) ||
            accountHint.contains(n)) {
          accountName = a.name;
          break;
        }
      }
    }

    String? categoryName;
    if (categoryId != null) {
      for (final c in categories) {
        if (c.id == categoryId) {
          categoryName = c.name;
          break;
        }
      }
    }
    if (categoryName == null &&
        categoryHint != null &&
        categoryHint.isNotEmpty) {
      for (final c in categories) {
        final n = c.name.toLowerCase();
        if (n == categoryHint ||
            n.contains(categoryHint) ||
            categoryHint.contains(n)) {
          categoryName = c.name;
          break;
        }
      }
    }
    if (categoryName == null && payeeText != null && payeeText.isNotEmpty) {
      final pn = payeeText.toLowerCase();
      for (final p in payees) {
        final n = p.name.toLowerCase();
        if (n == pn || n.contains(pn) || pn.contains(n)) {
          final cid = categoryHintsByPayeeId[p.id];
          if (cid is String) {
            for (final c in categories) {
              if (c.id == cid) {
                categoryName = c.name;
                break;
              }
            }
          }
          break;
        }
      }
    }

    return InboxItem(
      id: r.id,
      address: r.address,
      body: r.body,
      receivedAt: r.receivedAt,
      status: r.candidateStatus,
      suggestedPayee: payeeText,
      suggestedAmountCents: amount,
      suggestedAccountName: accountName,
      suggestedCategoryName: categoryName,
    );
  }

  Future<void> dismiss(int id) async {
    await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
      const SmsMessagesCompanion(candidateStatus: Value('dismissed')),
    );
    ref.invalidate(inboxItemsProvider);
  }

  /// Confirm: turn the candidate into a real transaction.
  Future<void> confirm(int id) async {
    await _confirmOne(id);
    ref.invalidate(inboxItemsProvider);
  }

  Future<bool> _confirmOne(int id) async {
    final row = await (_db.select(
      _db.smsMessages,
    )..where((t) => t.id.equals(id))).getSingleOrNull();
    if (row == null || row.candidateJson == null) return false;
    Map<String, dynamic> j;
    try {
      j = jsonDecode(row.candidateJson!) as Map<String, dynamic>;
    } catch (_) {
      return false;
    }
    final amount = (j['amount_cents'] as num?)?.toInt() ?? 0;
    if (amount == 0) return false;
    final isIncome = j['is_income'] == true;
    final payee = j['payee'] as String?;
    final accountHint = (j['account_hint'] as String?)?.toLowerCase();
    var categoryId = j['category_id'] as String?;
    final categoryHint = (j['category_hint'] as String?)?.toLowerCase();
    final dateStr = j['date'] as String?;
    final date = (dateStr != null)
        ? DateTime.tryParse(dateStr) ??
              DateTime.fromMillisecondsSinceEpoch(row.receivedAt)
        : DateTime.fromMillisecondsSinceEpoch(row.receivedAt);

    final accounts = await ref
        .read(accountRepoProvider)
        .list(includeArchived: false);
    String? acctId;
    if (accountHint != null) {
      for (final a in accounts) {
        if (accountHint.contains(a.name.toLowerCase()) ||
            a.name.toLowerCase().contains(accountHint)) {
          acctId = a.id;
          break;
        }
      }
    }
    acctId ??= accounts.firstOrNull?.id;
    if (acctId == null) return false;

    if (categoryId == null && categoryHint != null) {
      final categories = await ref.read(categoryRepoProvider).list();
      for (final c in categories) {
        final n = c.name.toLowerCase();
        if (n == categoryHint ||
            n.contains(categoryHint) ||
            categoryHint.contains(n)) {
          categoryId = c.id;
          break;
        }
      }
    }

    String? payeeId;
    if (payee != null && payee.trim().isNotEmpty) {
      payeeId = await ref.read(payeeRepoProvider).ensure(payee);
    }

    final signed = isIncome ? amount.abs() : -amount.abs();
    await ref
        .read(transactionRepoProvider)
        .create(
          accountId: acctId,
          categoryId: categoryId,
          payeeId: payeeId,
          payeeName: payee,
          amountCents: signed,
          date: date,
          notes: 'SMS · ${row.address}',
          origin: 'sms',
          originRef: row.id.toString(),
        );

    if (payeeId != null) {
      await ref
          .read(entryMemoryProvider)
          .rememberPayeeMapping(
            payeeId: payeeId,
            accountId: acctId,
            categoryId: categoryId,
          );
    }

    await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
      const SmsMessagesCompanion(candidateStatus: Value('accepted')),
    );
    return true;
  }

  /// Returns (ok, failed) counts. Invalidates the inbox once at the end so
  /// the list rebuilds a single time, not per-row.
  Future<({int ok, int failed})> confirmAll() async {
    final rows = await listInbox();
    var ok = 0;
    var failed = 0;
    for (final r in rows) {
      try {
        if (await _confirmOne(r.id)) {
          ok++;
        } else {
          failed++;
        }
      } catch (_) {
        failed++;
      }
    }
    ref.invalidate(inboxItemsProvider);
    return (ok: ok, failed: failed);
  }
}

final Provider<SmsRepository> smsRepositoryProvider = Provider<SmsRepository>(
  (ref) => SmsRepository(ref),
);

final StreamProvider<List<InboxItem>> inboxItemsProvider =
    StreamProvider<List<InboxItem>>((ref) {
      return ref.watch(smsRepositoryProvider).watchInbox();
    });

final StreamProvider<List<InboxItem>> ignoredInboxItemsProvider =
    StreamProvider<List<InboxItem>>((ref) {
      return ref.watch(smsRepositoryProvider).watchIgnored();
    });

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}
