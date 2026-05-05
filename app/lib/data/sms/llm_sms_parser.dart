import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../data/ai/llm_client.dart';
import '../../state/providers.dart';
import 'sms_models.dart';
import 'sms_parser.dart';

/// LLM-driven, sender-agnostic SMS parser. One prompt handles every
/// bank, card issuer, payment processor, or merchant SMS gateway —
/// no per-bank regex code to maintain.
///
/// Returns a [SmsCandidate] in the same shape the deleted regex
/// parsers used to emit, so the rest of the pipeline (cache lookup,
/// dedupe, auto-confirm gate) doesn't change.
const _systemPrompt = '''
You parse a single SMS into structured expense data. Output ONLY a
single JSON object. The SMS may come from a bank, card issuer,
payment processor (Stripe/Razorpay), or a merchant SMS gateway.

Schema:
{
  "is_transaction": boolean,
  "amount_cents": integer,           // major × 100 for ₹/\$/€/£; major × 1 for ¥
  "is_income": boolean,
  "currency": "INR" | "USD" | "EUR" | "GBP" | "JPY" | other ISO code,
  "payee": string|null,              // merchant / counterparty name only
  "account_hint": string|null,       // e.g. "HDFC Card xx1234", "Axis UPI"
  "date": string|null,               // YYYY-MM-DD; null if unclear
  "bank_ref": string|null,           // tx id / reference if present
  "confidence": number               // 0.0 to 1.0, calibrated honestly
}

Rules:
- is_transaction=false for OTPs, marketing, balance/limit alerts,
  declined-transaction notifications, statement reminders, etc.
  All other fields can be null/0 in that case.
- amount_cents is integer minor units. Reject negative amounts —
  use is_income=true for credits, false for debits.
- payee: extract the merchant name only, not the bank. "BLINKIT" not
  "HDFC Bank". Strip transaction-id-looking suffixes.
- account_hint: include the bank name AND the last-4 of the card if
  present, e.g. "HDFC Card xx1234". Skip if only the bank is known.
- confidence: 0.9+ when the message is clearly transactional and
  every field was unambiguous. 0.7 when the parser had to guess one
  field. ≤0.5 when the message is plausibly a transaction but
  fields are unclear or partially missing — these will go to a
  human-review Inbox.
- Output ONLY the JSON object. No prose.
''';

class LlmSmsParser implements SmsParser {
  LlmSmsParser(this._llm);
  final LlmClient _llm;

  @override
  Future<SmsCandidate?> parse(IncomingSms sms) async {
    final user =
        '''
<sender>: ${sms.address}
<received_at>: ${sms.receivedAt.toIso8601String()}
<body>: ${sms.body}
''';
    Map<String, dynamic> response;
    try {
      response = await _llm.chatJson(system: _systemPrompt, user: user);
    } on LlmException catch (e) {
      log.w('llm sms parse failed: ${e.message}');
      return null;
    }

    if (response['is_transaction'] != true) return null;
    final amount = (response['amount_cents'] as num?)?.toInt() ?? 0;
    if (amount <= 0) return null;

    final dateStr = response['date'] as String?;
    DateTime date;
    if (dateStr != null && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(dateStr)) {
      date = DateTime.parse(dateStr);
    } else {
      date = sms.receivedAt;
    }

    return SmsCandidate(
      amountCents: amount,
      isIncome: response['is_income'] == true,
      date: date,
      confidence: _clampConfidence(response['confidence']),
      payee: _trimOrNull(response['payee']),
      accountHint: _trimOrNull(response['account_hint']),
      bankRef: _trimOrNull(response['bank_ref']),
      parserVersion: 1,
    );
  }
}

double _clampConfidence(Object? raw) {
  final v = (raw as num?)?.toDouble() ?? 0.5;
  if (v.isNaN) return 0.5;
  return v.clamp(0.0, 1.0);
}

String? _trimOrNull(Object? raw) {
  if (raw is! String) return null;
  final trimmed = raw.trim();
  return trimmed.isEmpty ? null : trimmed;
}

/// JSON serialisation of a candidate for cache storage. Mirrors the
/// pipeline's existing candidateJson shape so cached and live parses
/// are interchangeable.
String encodeCandidate(SmsCandidate c) => jsonEncode({
  'amount_cents': c.amountCents,
  'is_income': c.isIncome,
  'date': c.date.toIso8601String(),
  'payee': c.payee,
  'account_hint': c.accountHint,
  'bank_ref': c.bankRef,
  'confidence': c.confidence,
  'parser_version': c.parserVersion,
});

SmsCandidate decodeCandidate(String json) {
  final m = jsonDecode(json) as Map<String, dynamic>;
  return SmsCandidate(
    amountCents: (m['amount_cents'] as num).toInt(),
    isIncome: m['is_income'] == true,
    date: DateTime.parse(m['date'] as String),
    confidence: (m['confidence'] as num?)?.toDouble() ?? 0.5,
    payee: m['payee'] as String?,
    accountHint: m['account_hint'] as String?,
    bankRef: m['bank_ref'] as String?,
    parserVersion: (m['parser_version'] as num?)?.toInt() ?? 1,
  );
}

final FutureProvider<LlmSmsParser?> llmSmsParserProvider =
    FutureProvider<LlmSmsParser?>((ref) async {
      final llm = await ref.watch(llmClientProvider.future);
      if (llm == null) return null;
      return LlmSmsParser(llm);
    });
