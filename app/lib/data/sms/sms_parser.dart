import 'sms_models.dart';

/// Pluggable SMS parser interface. The only implementation is [LlmSmsParser]
/// (the pi-server). Contract: return an [SmsParseOutcome] when the server
/// answered (transaction / notATxn / parseFailed), and THROW on a transport
/// failure (server unreachable) so the caller keeps the SMS queued for retry.
/// Never swallow a network error into a non-transaction result — that silent
/// fallback is exactly what produced amount-only uncategorised transactions.
abstract class SmsParser {
  Future<SmsParseOutcome> parse(IncomingSms sms);
}
