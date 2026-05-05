import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../ai/pi_ai_client.dart';
import 'sms_models.dart';
import 'sms_parser.dart';

/// SMS parser that delegates the actual LLM work to the homelab
/// pi-server. The phone never sees an OpenRouter / OpenAI key — it
/// just hands the SMS to `/v1/ai/sms/parse` and reads back the typed
/// candidate.
class LlmSmsParser implements SmsParser {
  LlmSmsParser(this._client);
  final PiAiClient _client;

  @override
  Future<SmsCandidate?> parse(IncomingSms sms) async {
    final SmsParseResponse response;
    try {
      response = await _client.parseSms(
        sender: sms.address,
        body: sms.body,
        receivedAt: sms.receivedAt,
      );
    } on PiAiException catch (e) {
      log.w('pi-server sms parse failed: ${e.message}');
      return null;
    }
    if (!response.isTransaction || response.candidate == null) return null;
    final c = response.candidate!;
    return SmsCandidate(
      amountCents: c.amountCents,
      isIncome: c.isIncome,
      date: DateTime.tryParse(c.date) ?? sms.receivedAt,
      confidence: c.confidence,
      payee: c.payee,
      accountHint: c.accountHint,
      bankRef: c.bankRef,
      parserVersion: c.parserVersion,
    );
  }
}

final FutureProvider<LlmSmsParser?> llmSmsParserProvider =
    FutureProvider<LlmSmsParser?>((ref) async {
      final client = await ref.watch(piAiClientProvider.future);
      if (client == null) return null;
      return LlmSmsParser(client);
    });
