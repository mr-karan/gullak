import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/db/database.dart';
import '../../../state/providers.dart';
import '../../accounts/data/account_repository.dart';
import '../../categories/data/category_repository.dart';
import '../../entry/entry_memory.dart';
import '../../payees/data/payee_repository.dart';
import '../../rules/data/rule_repository.dart';
import '../../tags/data/tag_repository.dart';
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
    this.suggestedIsIncome = false,
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
  final bool suggestedIsIncome;
  final String? suggestedAccountName;
  final String? suggestedCategoryName;

  bool get hasCandidate => status == 'inbox' && suggestedAmountCents != null;
}

class SmsRepository {
  SmsRepository(this.ref);
  final Ref ref;

  AppDatabase get _db => ref.read(dbProvider);

  // Pre-loaded enrichment data. Warmed once per stream life so
  // _enrichRows stays cheap — no DB queries on every watch event.
  List<AccountRow>? _accounts;
  List<CategoryRow>? _categories;
  List<PayeeRow>? _payees;
  Map<String, dynamic>? _payeeCategoryHints;

  Future<void> _warmCache() async {
    if (_accounts != null) return;
    _accounts = await ref.read(accountRepoProvider).list();
    _categories = await ref.read(categoryRepoProvider).list();
    _payees = await ref.read(payeeRepoProvider).list();
    try {
      _payeeCategoryHints =
          jsonDecode(ref.read(prefsProvider).payeeCategoryHints)
              as Map<String, dynamic>;
    } catch (_) {
      _payeeCategoryHints = const {};
    }
  }

  void invalidateCache() {
    _accounts = null;
    _categories = null;
    _payees = null;
    _payeeCategoryHints = null;
  }

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
  static const _matchedStatuses = ['accepted', 'duplicate'];

  Future<List<InboxItem>> listInbox() async {
    await _warmCache();
    final rows =
        await (_db.select(_db.smsMessages)
              ..where((t) => t.candidateStatus.isIn(_pendingStatuses))
              ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
            .get();
    return _enrichSynced(rows);
  }

  /// Synchronous enrichment — assumes [_warmCache] has already run.
  /// Called from the watch streams after the first event so
  /// progressive updates are fast (no DB queries per event).
  List<InboxItem> _enrichSynced(List<SmsRow> rows) {
    if (rows.isEmpty) return const [];
    final seen = <String>{};
    return rows
        .where((r) => seen.add(_smsDisplayKey(r)))
        .map(
          (r) => _mapRow(
            r,
            _accounts!,
            _categories!,
            _payees!,
            _payeeCategoryHints!,
          ),
        )
        .toList();
  }

  String _smsDisplayKey(SmsRow r) {
    final candidateKey = _candidateDisplayKey(r.candidateJson);
    if (candidateKey != null) {
      return '${r.address.trim().toLowerCase()}|$candidateKey';
    }
    final body = r.body
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), ' ')
        .replaceAll(RegExp(r'\s+([.,;:])'), r'$1')
        .trim();
    return '${r.address.trim().toLowerCase()}|$body';
  }

  String? _candidateDisplayKey(String? candidateJson) {
    if (candidateJson == null || candidateJson.isEmpty) return null;
    try {
      final j = jsonDecode(candidateJson) as Map<String, dynamic>;
      final amount = (j['amount_cents'] as num?)?.toInt();
      final date = DateTime.tryParse(j['date'] as String? ?? '');
      if (amount == null || date == null) return null;
      return [
        (j['is_income'] as bool? ?? false) ? 'in' : 'out',
        amount.toString(),
        _dayKey(date),
        _normalizeKeyPart(j['bank_ref'] as String?),
        _normalizeKeyPart(j['payee'] as String?),
        _normalizeKeyPart(j['account_hint'] as String?),
      ].join('|');
    } catch (_) {
      return null;
    }
  }

  String _dayKey(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  String _normalizeKeyPart(String? value) {
    return (value ?? '').toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  /// Reactive inbox: emits a fresh list whenever [SmsMessages] changes.
  /// Drift watches the underlying table, so newly-ingested SMS show
  /// up automatically without anyone calling [Ref.invalidate].
  Stream<List<InboxItem>> watchInbox() {
    final query = _db.select(_db.smsMessages)
      ..where((t) => t.candidateStatus.isIn(_pendingStatuses))
      ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]);
    // Pre-warm the enrichment cache on the very first watch event so
    // the body of the stream is a synchronous map thereafter.
    var warmed = false;
    return query.watch().asyncExpand((rows) async* {
      if (!warmed) {
        await _warmCache();
        warmed = true;
      }
      yield _enrichSynced(rows);
    });
  }

  Stream<List<InboxItem>> watchMatched() {
    final query = _db.select(_db.smsMessages)
      ..where((t) => t.candidateStatus.isIn(_matchedStatuses))
      ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)])
      ..limit(200);
    var warmed = false;
    return query.watch().asyncExpand((rows) async* {
      if (!warmed) {
        await _warmCache();
        warmed = true;
      }
      yield _enrichSynced(rows);
    });
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
    var warmed = false;
    return query.watch().asyncExpand((rows) async* {
      if (!warmed) {
        await _warmCache();
        warmed = true;
      }
      yield _enrichSynced(rows);
    });
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

  InboxItem _mapRow(
    SmsRow r,
    List<AccountRow> accounts,
    List<CategoryRow> categories,
    List<PayeeRow> payees,
    Map<String, dynamic> categoryHintsByPayeeId,
  ) {
    String? payeeText;
    int? amount;
    var isIncome = false;
    String? accountHint;
    String? categoryId;
    String? categoryHint;
    if (r.candidateJson != null && r.candidateJson!.isNotEmpty) {
      try {
        final j = jsonDecode(r.candidateJson!) as Map<String, dynamic>;
        payeeText = j['payee'] as String?;
        amount = (j['amount_cents'] as num?)?.toInt();
        isIncome = j['is_income'] == true;
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
      suggestedIsIncome: isIncome,
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
    var payee = j['payee'] as String?;
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
    final ruleAction = await ref
        .read(ruleRepoProvider)
        .actionForSms(
          address: row.address,
          body: row.body,
          payeeName: payee,
          accountHint: accountHint,
          amountCents: amount,
        );
    if (ruleAction.ignore == true) {
      await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
        const SmsMessagesCompanion(candidateStatus: Value('dismissed')),
      );
      return true;
    }
    payee = ruleAction.payeeName ?? payee;
    categoryId = ruleAction.categoryId ?? categoryId;

    String? acctId;
    if (ruleAction.accountId != null &&
        accounts.any((a) => a.id == ruleAction.accountId)) {
      acctId = ruleAction.accountId;
    }
    if (accountHint != null) {
      for (final a in accounts) {
        if (acctId != null) break;
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
    final txRepo = ref.read(transactionRepoProvider);
    final existing = await txRepo.findNearDuplicate(
      accountId: acctId,
      amountCents: signed,
      date: date,
      payeeName: payee,
    );
    if (existing != null) {
      await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
        SmsMessagesCompanion(
          candidateStatus: const Value('duplicate'),
          linkedTransactionId: Value(existing.id),
        ),
      );
      return true;
    }

    final transactionId = await txRepo.create(
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
    if (ruleAction.tagIds.isNotEmpty) {
      await ref
          .read(tagRepoProvider)
          .setTransactionTags(transactionId, ruleAction.tagIds);
    }

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
    final rows = (await listInbox()).where((r) => r.hasCandidate);
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

final StreamProvider<List<InboxItem>> matchedInboxItemsProvider =
    StreamProvider<List<InboxItem>>((ref) {
      return ref.watch(smsRepositoryProvider).watchMatched();
    });

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}
