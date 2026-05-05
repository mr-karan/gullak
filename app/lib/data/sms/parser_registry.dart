import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../db/database.dart';
import 'llm_sms_parser.dart';
import 'sms_models.dart';
import 'sms_parser.dart';

/// Top-level SMS parser entry point.
///
/// Thin proxy over [SmsParser]. Earlier revisions cached parses by
/// `(sender + masked-body-template)`; that cache caused two distinct
/// silent-data bugs (positives replayed wrong amounts; stale rows from
/// the old code path suppressed today's SMS as "non-transactional").
/// The cost of asking the LLM about every SMS is acceptable for this
/// app's volume, so the cache is gone — this class only awaits the
/// parser future and forwards the message.
class ParserRegistry {
  ParserRegistry({required this.db, Future<SmsParser?>? parserFuture})
    : _parserFuture = parserFuture ?? Future.value(null);

  final AppDatabase db;
  final Future<SmsParser?> _parserFuture;

  Future<SmsCandidate?> tryParse(IncomingSms sms) async {
    final p = await _parserFuture;
    if (p == null) return null;
    return p.parse(sms);
  }
}

final Provider<ParserRegistry> parserRegistryProvider =
    Provider<ParserRegistry>(
      (ref) => ParserRegistry(
        db: ref.watch(dbProvider),
        parserFuture: ref.watch(llmSmsParserProvider.future),
      ),
    );
