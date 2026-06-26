import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../db/database.dart';
import 'llm_sms_parser.dart';
import 'sms_models.dart';
import 'sms_parser.dart';

/// Top-level SMS parser entry point. There is NO on-device parsing — every SMS
/// is parsed by the pi-server. This thin proxy resolves the server-backed
/// parser and forwards the message.
///
/// Failure semantics are load-bearing for the parse queue:
///   - transport failure (server unreachable, or not configured yet) THROWS,
///     so the drainer keeps the SMS in `pending_parse` and retries later;
///   - a server answer returns an [SmsParseOutcome] (transaction / notATxn /
///     parseFailed);
///   - an unexpected (non-transport) error is reported as parseFailed.
class ParserRegistry {
  ParserRegistry({
    required this.db,
    Future<SmsParser?>? parserFuture,
    Future<SmsParser?> Function()? parserLoader,
  }) : _parserLoader =
           parserLoader ?? (() => parserFuture ?? Future.value(null));

  final AppDatabase db;
  final Future<SmsParser?> Function() _parserLoader;

  Future<SmsParseOutcome> parse(IncomingSms sms) async {
    final p = await _parserLoader();
    if (p == null) {
      // Server not configured yet — treat as transport-unavailable so the SMS
      // stays queued and parses once a sync server is set up.
      throw const SmsServerUnavailable('sms parser not configured');
    }
    return p.parse(sms);
  }
}

/// Thrown when the server can't be reached or isn't configured. Signals the
/// drainer to keep the SMS queued and retry with backoff (not a terminal fail).
class SmsServerUnavailable implements Exception {
  const SmsServerUnavailable(this.message);
  final String message;
  @override
  String toString() => 'SmsServerUnavailable: $message';
}

final Provider<ParserRegistry> parserRegistryProvider =
    Provider<ParserRegistry>(
      (ref) => ParserRegistry(
        db: ref.watch(dbProvider),
        parserLoader: () => ref.read(llmSmsParserProvider.future),
      ),
    );
