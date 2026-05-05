import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../state/providers.dart';
import '../db/database.dart';
import 'llm_sms_parser.dart';
import 'sms_models.dart';
import 'sms_parser.dart';

/// Top-level SMS parser entry point.
///
/// The cache stores **only negative classifications** — i.e. "this
/// `sender + body-template` is not a transaction" (OTPs, marketing,
/// balance reminders). On a cache hit we skip the LLM entirely and
/// return null, which is the same thing the parser would have said.
///
/// We deliberately do NOT cache parsed candidates: amount, payee,
/// date and bank-ref vary message-by-message even when the printed
/// format is identical, so reusing a previous candidate would silently
/// corrupt financial data. Only the boolean "is this template
/// transactional?" decision is reusable across messages.
class ParserRegistry {
  ParserRegistry({required this.db, Future<SmsParser?>? parserFuture})
    : _parserFuture = parserFuture ?? Future.value(null);

  final AppDatabase db;
  final Future<SmsParser?> _parserFuture;

  Future<SmsCandidate?> tryParse(IncomingSms sms) async {
    final template = _bodyTemplate(sms.body);
    final key = _cacheKey(sms.address, template);

    // 1. Negative-cache lookup. If we've previously parsed this
    // template and the LLM said "not a transaction", skip it again.
    final cached = await (db.select(
      db.smsParseCache,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    if (cached != null) {
      await (db.update(
        db.smsParseCache,
      )..where((t) => t.key.equals(key))).write(
        SmsParseCacheCompanion(
          hits: Value(cached.hits + 1),
          lastSeenAt: Value(DateTime.now().millisecondsSinceEpoch),
        ),
      );
      return null;
    }

    // 2. Wait for the LLM parser provider — during cold start the
    // ref.watch(llmSmsParserProvider.future) may still be loading,
    // and snapshotting it would mark the SMS as 'error' permanently.
    final p = await _parserFuture;
    if (p == null) return null;

    final candidate = await p.parse(sms);

    // 3. Cache the negative classification. Positive candidates are
    // never cached — every transactional SMS gets a fresh parse so
    // amount/date/payee come from THIS body, not a prior one.
    if (candidate == null) {
      final now = DateTime.now().millisecondsSinceEpoch;
      try {
        await db
            .into(db.smsParseCache)
            .insertOnConflictUpdate(
              SmsParseCacheCompanion(
                key: Value(key),
                senderSample: Value(sms.address),
                bodyTemplate: Value(template),
                payloadJson: const Value('{"is_transaction":false}'),
                hits: const Value(1),
                createdAt: Value(now),
                lastSeenAt: Value(now),
              ),
            );
      } catch (e) {
        log.w('sms negative-cache insert failed: $e');
      }
    }

    return candidate;
  }

  static String _bodyTemplate(String body) {
    // Mask everything that varies between messages of the same
    // shape: digit runs (amounts, dates, refs, last-4), inline
    // whitespace, leading/trailing space.
    final masked = body
        .replaceAll(RegExp(r'\d+(\.\d+)?'), '<n>')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .toLowerCase();
    return masked;
  }

  static String _cacheKey(String sender, String template) {
    final raw = '$sender|$template';
    final digest = sha256.convert(utf8.encode(raw));
    return digest.toString().substring(0, 32);
  }
}

final Provider<ParserRegistry> parserRegistryProvider =
    Provider<ParserRegistry>(
      (ref) => ParserRegistry(
        db: ref.watch(dbProvider),
        parserFuture: ref.watch(llmSmsParserProvider.future),
      ),
    );
