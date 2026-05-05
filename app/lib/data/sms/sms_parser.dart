import 'sms_models.dart';

/// Pluggable SMS parser interface. Today the only implementation is
/// [LlmSmsParser] (cloud). A future on-device variant (e.g. Gemma via
/// flutter_gemma) plugs in here without touching the pipeline or
/// cache layers.
abstract class SmsParser {
  Future<SmsCandidate?> parse(IncomingSms sms);
}
