import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/logger.dart';
import '../../../core/money.dart';
import '../../../data/ai/pi_ai_client.dart';
import '../../../data/db/database.dart';
import '../../../data/sms/account_matcher.dart';
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

  /// Underlying [SmsMessages.candidateStatus]. 'parsed' means the server
  /// produced a candidate the user can confirm (the auto-create gate didn't
  /// fire — e.g. no category resolved). 'parse_failed' means the server
  /// couldn't structure the SMS — the row still shows so the user can open it
  /// in QuickEntry manually. ('inbox'/'error' are the legacy equivalents kept
  /// for rows captured before the server-queue refactor.)
  final String status;
  final String? suggestedPayee;
  final int? suggestedAmountCents;
  final bool suggestedIsIncome;
  final String? suggestedAccountName;
  final String? suggestedCategoryName;

  bool get hasCandidate =>
      (status == 'parsed' || status == 'inbox') && suggestedAmountCents != null;
}

/// A parsed SMS row resolved into the fields a transaction needs.
/// Carries everything the Quick Entry sheet needs to hydrate, plus
/// SMS-specific bookkeeping the inbox layer applies after save.
class SmsTransactionDraft {
  const SmsTransactionDraft({
    required this.smsRowId,
    required this.smsAddress,
    required this.smsBody,
    required this.amountCentsSigned,
    required this.isIncome,
    required this.date,
    required this.accountId,
    this.payeeName,
    this.payeeId,
    this.categoryId,
    this.tagIds = const [],
    this.duplicateOf,
  });

  final int smsRowId;
  final String smsAddress;
  final String smsBody;

  /// Already signed: positive for income, negative for spend.
  final int amountCentsSigned;
  final bool isIncome;
  final DateTime date;
  final String accountId;
  final String? payeeName;
  final String? payeeId;
  final String? categoryId;
  final List<String> tagIds;

  /// Set when an existing transaction looks like a near-duplicate. The
  /// modal surfaces this as a warning so the user can cancel and link
  /// instead of creating a second row.
  final String? duplicateOf;

  bool get categoryRequired => categoryId == null;
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
  // Exact-match lookups built once per warm so per-row enrichment doesn't
  // linear-scan the category/payee lists on every SMS. The substring-hint
  // fallbacks still iterate, but only when an exact match misses.
  Map<String, CategoryRow>? _categoriesById;
  Map<String, CategoryRow>? _categoriesByLowerName;
  Map<String, PayeeRow>? _payeesByLowerName;

  Future<void> _warmCache() async {
    if (_accounts != null) return;
    _accounts = await ref.read(accountRepoProvider).list();
    final categories = await ref.read(categoryRepoProvider).list();
    _categories = categories;
    final payees = await ref.read(payeeRepoProvider).list();
    _payees = payees;
    _categoriesById = {for (final c in categories) c.id: c};
    _categoriesByLowerName = {
      for (final c in categories) c.name.toLowerCase(): c,
    };
    _payeesByLowerName = {for (final p in payees) p.name.toLowerCase(): p};
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
    _categoriesById = null;
    _categoriesByLowerName = null;
    _payeesByLowerName = null;
  }

  /// Pending review: server-parsed SMS that needs the user (status='parsed',
  /// e.g. no category resolved so the auto-create gate didn't fire) or that the
  /// server couldn't structure (status='parse_failed'). 'inbox'/'error' are the
  /// legacy equivalents for rows captured before the server-queue refactor.
  /// `pending_parse`/`parsing` are intentionally excluded — they're in-flight,
  /// not yet reviewable.
  static const _pendingStatuses = ['parsed', 'parse_failed', 'inbox', 'error'];

  /// Ingested but not pending review: classifier-rejected (`none`), server said
  /// not-a-transaction (`not_a_txn`), duplicates (`duplicate`), and
  /// user-dismissed (`dismissed`). Surfaced via the Inbox "Ignored" toggle so a
  /// user can still log one manually if the classification was wrong.
  static const _ignoredStatuses = [
    'none',
    'not_a_txn',
    'duplicate',
    'dismissed',
  ];
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
            _categoriesById!,
            _categoriesByLowerName!,
            _payeesByLowerName!,
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

  /// Cheap pending/failed counts for surfaces (the Home Daily Review) that need
  /// the numbers but not the enriched rows. Watching [watchInbox] from Home
  /// kept the whole enrichment pipeline warm on every SMS change just to render
  /// a badge; this is a single indexed COUNT with no enrichment.
  Stream<({int pending, int failed})> watchInboxCounts() {
    final q = _db.customSelect(
      'SELECT '
      "SUM(CASE WHEN candidate_status IN ('parsed','inbox') THEN 1 ELSE 0 END) "
      'AS pending, '
      "SUM(CASE WHEN candidate_status IN ('parse_failed','error') THEN 1 ELSE 0 END) "
      'AS failed FROM sms_messages',
      readsFrom: {_db.smsMessages},
    );
    return q.watchSingle().map(
      (r) => (
        pending: r.read<int?>('pending') ?? 0,
        failed: r.read<int?>('failed') ?? 0,
      ),
    );
  }

  /// Re-queue a row for server parsing, e.g. when the user disagrees with the
  /// classifier's "non-transactional" call or wants a failed parse retried.
  /// Status flips to `pending_parse` with backoff cleared so the next drain
  /// sends it to the server.
  Future<void> reopen(int id) async {
    await (_db.update(_db.smsMessages)..where((t) => t.id.equals(id))).write(
      const SmsMessagesCompanion(
        candidateStatus: Value('pending_parse'),
        parseAttemptCount: Value(0),
        nextParseAfter: Value(null),
        lastParseError: Value(null),
      ),
    );
  }

  InboxItem _mapRow(
    SmsRow r,
    List<AccountRow> accounts,
    List<CategoryRow> categories,
    List<PayeeRow> payees,
    Map<String, dynamic> categoryHintsByPayeeId,
    Map<String, CategoryRow> categoriesById,
    Map<String, CategoryRow> categoriesByLowerName,
    Map<String, PayeeRow> payeesByLowerName,
  ) {
    String? payeeText;
    int? amount;
    var isIncome = false;
    String? accountHint;
    String? categoryId;
    String? categoryHint;
    // Prefer the enriched candidate (user-note-enhanced) over the raw
    // SMS parse. Falls back to the original when enrichment hasn't run.
    final source = (r.enrichedCandidateJson?.isNotEmpty ?? false)
        ? r.enrichedCandidateJson
        : r.candidateJson;
    if (source != null && source.isNotEmpty) {
      try {
        final j = jsonDecode(source) as Map<String, dynamic>;
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
      // Account names are unstructured ("HDFC Card xx1234"), so this stays a
      // substring match — but the list is tiny (a handful of accounts).
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
      categoryName = categoriesById[categoryId]?.name; // O(1)
    }
    if (categoryName == null &&
        categoryHint != null &&
        categoryHint.isNotEmpty) {
      // Try the exact name first (O(1)); fall back to substring only on miss.
      categoryName = categoriesByLowerName[categoryHint]?.name;
      if (categoryName == null) {
        for (final c in categories) {
          final n = c.name.toLowerCase();
          if (n.contains(categoryHint) || categoryHint.contains(n)) {
            categoryName = c.name;
            break;
          }
        }
      }
    }
    if (categoryName == null && payeeText != null && payeeText.isNotEmpty) {
      final pn = payeeText.toLowerCase();
      PayeeRow? matched = payeesByLowerName[pn]; // O(1) exact
      if (matched == null) {
        for (final p in payees) {
          final n = p.name.toLowerCase();
          if (n.contains(pn) || pn.contains(n)) {
            matched = p;
            break;
          }
        }
      }
      final cid = matched == null ? null : categoryHintsByPayeeId[matched.id];
      if (cid is String) categoryName = categoriesById[cid]?.name;
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

  /// Build a draft for the inbox row without writing anything. Used by
  /// the per-row Confirm flow which opens the Quick Entry sheet
  /// pre-filled and lets the user fill in missing metadata (often
  /// category) before saving.
  ///
  /// Returns null when the row is not parseable, has no candidate, or
  /// no account exists to charge against — those cases force the user
  /// onto the manual entry path. A duplicate match is *not* a null
  /// return; it surfaces via [SmsTransactionDraft.duplicateOf] so the
  /// modal can warn instead of silently no-opping.
  Future<SmsTransactionDraft?> buildDraft(int rowId) async {
    final resolved = await _resolveRow(rowId);
    if (resolved == null) return null;
    if (resolved.ignored) return null;
    return SmsTransactionDraft(
      smsRowId: rowId,
      smsAddress: resolved.row.address,
      smsBody: resolved.row.body,
      amountCentsSigned: resolved.signed,
      isIncome: resolved.isIncome,
      date: resolved.date,
      accountId: resolved.accountId,
      payeeName: resolved.payeeName,
      payeeId: resolved.payeeId,
      categoryId: resolved.categoryId,
      tagIds: resolved.tagIds,
      duplicateOf: resolved.duplicateOf,
    );
  }

  /// Marks the SMS row as accepted and links it to the transaction the
  /// user just saved from the Quick Entry sheet. Also persists payee
  /// memory so future runs map the same merchant the same way. The
  /// Quick Entry sheet itself handles tagging and base account memory.
  Future<void> confirmFromTransaction({
    required int smsRowId,
    required String transactionId,
    String? accountId,
    String? categoryId,
    String? payeeId,
  }) async {
    await (_db.update(
      _db.smsMessages,
    )..where((t) => t.id.equals(smsRowId))).write(
      SmsMessagesCompanion(
        candidateStatus: const Value('accepted'),
        linkedTransactionId: Value(transactionId),
      ),
    );
    if (payeeId != null && accountId != null) {
      await ref
          .read(entryMemoryProvider)
          .rememberPayeeMapping(
            payeeId: payeeId,
            accountId: accountId,
            categoryId: categoryId,
          );
    }
    ref.invalidate(inboxItemsProvider);
  }

  /// Auto-confirm path. Used by `confirmAll()` for rows where the parser
  /// already resolved everything. Differs from the modal flow in that
  /// it writes the transaction and bookkeeping in one go, with no user
  /// review.
  Future<bool> _confirmOne(int id) async {
    // Atomically claim the row before doing any work. Two concurrent
    // confirmAll passes (or a double-tap) would otherwise both clear
    // _resolveRow and each create a transaction for the same SMS. The
    // conditional update only succeeds for the first caller; the second
    // sees 0 rows changed and bails. A `finally` releases the claim if we
    // don't reach a terminal status, so a failed row stays actionable.
    final claimed =
        await (_db.update(_db.smsMessages)..where(
              (t) =>
                  t.id.equals(id) &
                  t.candidateStatus.isIn(const ['parsed', 'inbox']),
            ))
            .write(
              const SmsMessagesCompanion(candidateStatus: Value('processing')),
            );
    if (claimed == 0) return false;
    var settled = false;
    try {
      final resolved = await _resolveRow(id);
      if (resolved == null) return false;
      if (resolved.ignored) {
        settled = true; // _resolveRow already marked the row 'dismissed'
        return true;
      }

      if (resolved.duplicateOf != null) {
        await (_db.update(
          _db.smsMessages,
        )..where((t) => t.id.equals(id))).write(
          SmsMessagesCompanion(
            candidateStatus: const Value('duplicate'),
            linkedTransactionId: Value(resolved.duplicateOf),
          ),
        );
        settled = true;
        return true;
      }

      final txRepo = ref.read(transactionRepoProvider);
      final userNote = resolved.row.userNote?.trim();
      final transactionId = await txRepo.create(
        accountId: resolved.accountId,
        categoryId: resolved.categoryId,
        payeeId: resolved.payeeId,
        payeeName: resolved.payeeName,
        amountCents: resolved.signed,
        date: resolved.date,
        notes: (userNote != null && userNote.isNotEmpty)
            ? userNote
            : 'SMS · ${resolved.row.address}',
        origin: 'sms',
        originRef: resolved.row.id.toString(),
        originalAmountCents: resolved.originalAmountCents,
        originalCurrency: resolved.originalCurrency,
      );
      if (resolved.tagIds.isNotEmpty) {
        await ref
            .read(tagRepoProvider)
            .setTransactionTags(transactionId, resolved.tagIds);
      }
      await confirmFromTransaction(
        smsRowId: id,
        transactionId: transactionId,
        accountId: resolved.accountId,
        categoryId: resolved.categoryId,
        payeeId: resolved.payeeId,
      );
      settled = true; // confirmFromTransaction set the row 'accepted'
      // Push the raw SMS body to pi-server so the server-side LLM
      // re-enrichment pass can fix payee/category metadata after Confirm
      // All. Fire-and-forget — the server is allowed to be offline and a
      // later [enqueueHistoricalSmsBackfill] can always catch missed rows.
      // We pass the txn's updated_at as a fence; the reprocess endpoint
      // skips rows whose linked txn has moved past that snapshot.
      unawaited(
        _uploadSmsBody(
          smsRowId: id,
          transactionId: transactionId,
          address: resolved.row.address,
          body: resolved.row.body,
          receivedAt: resolved.row.receivedAt,
          candidateJsonStr:
              resolved.row.enrichedCandidateJson?.isNotEmpty == true
              ? resolved.row.enrichedCandidateJson
              : resolved.row.candidateJson,
        ),
      );
      return true;
    } finally {
      // Release the claim if we didn't reach a terminal status (exception
      // mid-confirm) so the row returns to the Inbox instead of being stranded
      // in 'processing'.
      if (!settled) {
        await (_db.update(_db.smsMessages)..where(
              (t) => t.id.equals(id) & t.candidateStatus.equals('processing'),
            ))
            .write(
              const SmsMessagesCompanion(candidateStatus: Value('parsed')),
            );
      }
    }
  }

  /// Shared parse + resolve pipeline used by [buildDraft] and the bulk
  /// [_confirmOne] path. Returns null on non-parseable rows. The
  /// `ignored` flag is set when a rule decides this SMS shouldn't
  /// produce a transaction at all — caller marks the row dismissed.
  Future<_ResolvedSms?> _resolveRow(int rowId) async {
    final row = await (_db.select(
      _db.smsMessages,
    )..where((t) => t.id.equals(rowId))).getSingleOrNull();
    if (row == null) return null;
    // Confirm flow uses the same enrichment-preferred fallback so the
    // user's note-derived merchant/category seeds the Quick Entry sheet.
    final source = (row.enrichedCandidateJson?.isNotEmpty ?? false)
        ? row.enrichedCandidateJson
        : row.candidateJson;
    if (source == null) return null;
    Map<String, dynamic> j;
    try {
      j = jsonDecode(source) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
    final amount = (j['amount_cents'] as num?)?.toInt() ?? 0;
    if (amount == 0) return null;
    // Foreign-currency: the parser returns an ISO code. Tag the transaction
    // when it's a currency other than the user's base so the amount isn't
    // silently mislabeled as base-currency units (the phantom-amount class).
    final currency = (j['currency'] as String?)?.trim().toUpperCase();
    final baseCode = Money.currencyCodeForSymbol(
      ref.read(prefsProvider).currencySymbol,
    );
    final isForeign =
        currency != null &&
        RegExp(r'^[A-Z]{3}$').hasMatch(currency) &&
        baseCode != null &&
        currency != baseCode;
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
      await (_db.update(
        _db.smsMessages,
      )..where((t) => t.id.equals(rowId))).write(
        const SmsMessagesCompanion(candidateStatus: Value('dismissed')),
      );
      return _ResolvedSms.ignored(row);
    }
    payee = ruleAction.payeeName ?? payee;
    categoryId = ruleAction.categoryId ?? categoryId;

    String? acctId;
    if (ruleAction.accountId != null &&
        accounts.any((a) => a.id == ruleAction.accountId)) {
      acctId = ruleAction.accountId;
    }
    acctId ??= matchAccountHint(
      accountHint,
      accounts.map((a) => (id: a.id, name: a.name, kind: a.kind)).toList(),
    );
    acctId ??= accounts.firstOrNull?.id;
    if (acctId == null) return null;

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

    return _ResolvedSms(
      row: row,
      isIncome: isIncome,
      signed: signed,
      date: date,
      accountId: acctId,
      payeeName: payee,
      payeeId: payeeId,
      categoryId: categoryId,
      tagIds: ruleAction.tagIds,
      duplicateOf: existing?.id,
      originalAmountCents: isForeign ? amount.abs() : null,
      originalCurrency: isForeign ? currency : null,
    );
  }

  /// Read-only forecast of what [confirmAll] would do, for the confirm dialog.
  /// Runs the SAME resolution as [_resolveRow] — rules (actionForSms), then
  /// matchAccountHint, then category-hint matching — so the preview counts
  /// match the commit. It must stay in sync with [_resolveRow]; the shared
  /// steps are annotated in both. No writes (no payee ensure, no dismiss).
  Future<({int total, int noAccount, int noCategory, int ignored})>
  previewConfirmAll(List<int> rowIds) async {
    final accounts = await ref
        .read(accountRepoProvider)
        .list(includeArchived: false);
    final categories = await ref.read(categoryRepoProvider).list();
    var total = 0;
    var noAccount = 0;
    var noCategory = 0;
    var ignored = 0;
    for (final id in rowIds) {
      final row = await (_db.select(
        _db.smsMessages,
      )..where((t) => t.id.equals(id))).getSingleOrNull();
      if (row == null) continue;
      final source = (row.enrichedCandidateJson?.isNotEmpty ?? false)
          ? row.enrichedCandidateJson
          : row.candidateJson;
      if (source == null) continue;
      Map<String, dynamic> j;
      try {
        j = jsonDecode(source) as Map<String, dynamic>;
      } catch (_) {
        continue;
      }
      final amount = (j['amount_cents'] as num?)?.toInt() ?? 0;
      if (amount == 0) continue;
      total += 1;
      final payee = j['payee'] as String?;
      final accountHint = (j['account_hint'] as String?)?.toLowerCase();
      var categoryId = j['category_id'] as String?;
      final categoryHint = (j['category_hint'] as String?)?.toLowerCase();
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
        ignored += 1;
        continue;
      }
      categoryId = ruleAction.categoryId ?? categoryId;
      // Account resolution BEFORE the first-account fallback — a fallback is
      // what the dialog warns about.
      String? acctId;
      if (ruleAction.accountId != null &&
          accounts.any((a) => a.id == ruleAction.accountId)) {
        acctId = ruleAction.accountId;
      }
      acctId ??= matchAccountHint(
        accountHint,
        accounts.map((a) => (id: a.id, name: a.name, kind: a.kind)).toList(),
      );
      if (acctId == null) noAccount += 1;
      if (categoryId == null && categoryHint != null) {
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
      if (categoryId == null) noCategory += 1;
    }
    return (
      total: total,
      noAccount: noAccount,
      noCategory: noCategory,
      ignored: ignored,
    );
  }

  /// Returns (ok, failed) counts. Invalidates the inbox once at the end so
  /// the list rebuilds a single time, not per-row.
  ///
  /// After the loop, fires a fire-and-forget [/v1/sms/reprocess] call so the
  /// pi-server can re-run its (LLM-only) parser over every body that was
  /// just uploaded by [_uploadSmsBody]. Any cleanups it produces flow back
  /// to the phone via the normal sync pull — no second user interaction.
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
    unawaited(_triggerServerReprocess());
    return (ok: ok, failed: failed);
  }

  /// Push the raw body of one confirmed SMS to the pi-server. Best-effort:
  /// silently swallows network failures since the server can always be
  /// caught up later via [backfillSmsBodies].
  Future<void> _uploadSmsBody({
    required int smsRowId,
    required String transactionId,
    required String address,
    required String body,
    required int receivedAt,
    String? candidateJsonStr,
  }) async {
    try {
      final client = await ref.read(piAiClientProvider.future);
      if (client == null) return; // no sync server configured
      // Capture the txn's actual updatedAt — the server fences the
      // reprocess pass against it so user edits made after confirm aren't
      // clobbered. Falls back to "right now" if the row vanished.
      final txRow = await ref
          .read(transactionRepoProvider)
          .byRow(transactionId);
      final baseUpdatedAt =
          txRow?.updatedAt ?? DateTime.now().millisecondsSinceEpoch;
      await client.bulkIngestSms(
        items: [
          SmsIngestItem(
            id: 'sms-$smsRowId',
            sender: address,
            body: body,
            receivedAt: receivedAt,
            linkedTransactionId: transactionId,
            baseTransactionUpdatedAt: baseUpdatedAt,
            candidateJson: candidateJsonStr,
          ),
        ],
      );
    } catch (e) {
      // Best-effort: the server may be offline. A later backfill re-uploads;
      // log so a persistent failure is diagnosable rather than invisible.
      log.w('sms body upload failed (will retry via backfill): $e');
    }
  }

  Future<void> _triggerServerReprocess() async {
    try {
      final client = await ref.read(piAiClientProvider.future);
      if (client == null) return;
      await client.reprocessSms(limit: 200);
    } catch (e) {
      log.w('server SMS reprocess trigger failed (best-effort): $e');
    }
  }

  /// One-shot backfill for historical confirmed SMS that predate the
  /// upload hook in [_confirmOne]. Walks every locally-stored SMS whose
  /// review status is `accepted` (i.e. the user has confirmed it into a
  /// transaction) and ships the body to the server in 50-row batches.
  /// Fires reprocess at the end. Returns the number of bodies uploaded.
  Future<int> backfillSmsBodies({int batchSize = 50}) async {
    final client = await ref.read(piAiClientProvider.future);
    if (client == null) return 0;
    final rows =
        await (_db.select(_db.smsMessages)
              ..where((t) => t.candidateStatus.equals('accepted'))
              ..where((t) => t.linkedTransactionId.isNotNull()))
            .get();
    if (rows.isEmpty) return 0;
    final txRepo = ref.read(transactionRepoProvider);
    var uploaded = 0;
    for (var i = 0; i < rows.length; i += batchSize) {
      final slice = rows.skip(i).take(batchSize);
      final items = <SmsIngestItem>[];
      for (final row in slice) {
        final txnId = row.linkedTransactionId;
        if (txnId == null) continue;
        final txn = await txRepo.byRow(txnId);
        items.add(
          SmsIngestItem(
            id: 'sms-${row.id}',
            sender: row.address,
            body: row.body,
            receivedAt: row.receivedAt,
            linkedTransactionId: txnId,
            baseTransactionUpdatedAt: txn?.updatedAt,
            candidateJson: row.enrichedCandidateJson?.isNotEmpty == true
                ? row.enrichedCandidateJson
                : row.candidateJson,
          ),
        );
      }
      if (items.isEmpty) continue;
      try {
        await client.bulkIngestSms(items: items);
        uploaded += items.length;
      } catch (e) {
        // Skip this batch; partial progress is fine and the next run retries.
        log.w('historical SMS backfill batch failed (best-effort): $e');
      }
    }
    if (uploaded > 0) await _triggerServerReprocess();
    return uploaded;
  }
}

final Provider<SmsRepository> smsRepositoryProvider = Provider<SmsRepository>(
  (ref) => SmsRepository(ref),
);

/// Lightweight pending/failed counts (no row enrichment) for the Home badge.
final inboxCountsProvider = StreamProvider<({int pending, int failed})>((ref) {
  return ref.watch(smsRepositoryProvider).watchInboxCounts();
});

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

/// Internal: shared output of `_resolveRow`. Holds enough to build a
/// draft for the modal flow OR to write a transaction in the bulk path.
class _ResolvedSms {
  const _ResolvedSms({
    required this.row,
    required this.isIncome,
    required this.signed,
    required this.date,
    required this.accountId,
    this.payeeName,
    this.payeeId,
    this.categoryId,
    this.tagIds = const [],
    this.duplicateOf,
    this.ignored = false,
    this.originalAmountCents,
    this.originalCurrency,
  });

  /// Constructor for rows that a rule said to ignore. The DB row is
  /// already marked `dismissed` by the caller. Other fields are
  /// irrelevant in this branch.
  _ResolvedSms.ignored(SmsRow row)
    : this(
        row: row,
        isIncome: false,
        signed: 0,
        date: DateTime.fromMillisecondsSinceEpoch(0),
        accountId: '',
        ignored: true,
      );

  final SmsRow row;
  final bool isIncome;
  final int signed;
  final DateTime date;
  final String accountId;
  final String? payeeName;
  final String? payeeId;
  final String? categoryId;
  final List<String> tagIds;
  final String? duplicateOf;
  final bool ignored;
  // Foreign-currency metadata carried from the SMS parse (display-only). Set
  // only when the SMS was in a currency other than the user's base.
  final int? originalAmountCents;
  final String? originalCurrency;
}
