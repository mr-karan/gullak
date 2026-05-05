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

/// Top-level SMS parser entry point. Cache-first, LLM-second.
///
/// Cache key is `hash(sender + body_template)` where the template
/// masks digit runs and dates so two messages from the same sender
/// in the same shape collapse to one cache row. First SMS of a
/// format pays the LLM cost; every subsequent same-shape SMS is free.
class ParserRegistry {
  ParserRegistry({required this.db, this.parser});

  final AppDatabase db;
  final SmsParser? parser;

  Future<SmsCandidate?> tryParse(IncomingSms sms) async {
    final template = _bodyTemplate(sms.body);
    final key = _cacheKey(sms.address, template);

    // 1. Cache lookup.
    final cached = await (db.select(
      db.smsParseCache,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    if (cached != null) {
      try {
        final candidate = decodeCandidate(cached.payloadJson);
        // Use the actual SMS date — cached candidates' "date" is
        // when the original cached message arrived, not this one.
        final patched = SmsCandidate(
          amountCents: candidate.amountCents,
          isIncome: candidate.isIncome,
          date: sms.receivedAt,
          confidence: candidate.confidence,
          payee: candidate.payee,
          accountHint: candidate.accountHint,
          bankRef: candidate.bankRef,
          parserVersion: candidate.parserVersion,
        );
        await (db.update(
          db.smsParseCache,
        )..where((t) => t.key.equals(key))).write(
          SmsParseCacheCompanion(
            hits: Value(cached.hits + 1),
            lastSeenAt: Value(DateTime.now().millisecondsSinceEpoch),
          ),
        );
        return patched;
      } catch (e) {
        log.w('cached sms candidate decode failed, re-parsing: $e');
      }
    }

    // 2. LLM parse.
    final p = parser;
    if (p == null) return null;
    final candidate = await p.parse(sms);
    if (candidate == null) return null;

    // 3. Cache the result.
    final now = DateTime.now().millisecondsSinceEpoch;
    await db
        .into(db.smsParseCache)
        .insertOnConflictUpdate(
          SmsParseCacheCompanion(
            key: Value(key),
            senderSample: Value(sms.address),
            bodyTemplate: Value(template),
            payloadJson: Value(encodeCandidate(candidate)),
            hits: const Value(1),
            createdAt: Value(now),
            lastSeenAt: Value(now),
          ),
        );

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
    Provider<ParserRegistry>((ref) {
      final llmParserAsync = ref.watch(llmSmsParserProvider);
      return ParserRegistry(
        db: ref.watch(dbProvider),
        parser: llmParserAsync.maybeWhen(data: (p) => p, orElse: () => null),
      );
    });
