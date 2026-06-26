/// Lightweight SMS record we hand to the classifier and parsers.
class IncomingSms {
  const IncomingSms({
    required this.id,
    required this.address,
    required this.body,
    required this.receivedAt,
  });

  final String? id;
  final String address;
  final String body;
  final DateTime receivedAt;
}

/// Terminal outcome of a server parse. A transport/network failure is NOT one
/// of these — it throws so the caller keeps the SMS queued for retry. These
/// three are the cases where the server actually answered:
///   transaction  → a candidate to create/queue
///   notATxn      → confidently not a spend (OTP/marketing/…); never retried
///   parseFailed  → the model/validation failed; surfaced for review, not looped
enum SmsParseStatus { transaction, notATxn, parseFailed }

class SmsParseOutcome {
  const SmsParseOutcome(this.status, [this.candidate]);
  final SmsParseStatus status;
  final SmsCandidate? candidate;
}

/// The structured candidate a parser produces from a transactional SMS.
class SmsCandidate {
  const SmsCandidate({
    required this.amountCents,
    required this.isIncome,
    required this.date,
    required this.confidence,
    this.payee,
    this.accountHint,
    this.categoryHint,
    this.categoryId,
    this.bankRef,
    this.parserVersion = 1,
  });

  final int amountCents;
  final bool isIncome;
  final DateTime date;
  final double confidence;
  final String? payee;
  final String? accountHint;
  final String? categoryHint;
  final String? categoryId;
  final String? bankRef;
  final int parserVersion;
}
