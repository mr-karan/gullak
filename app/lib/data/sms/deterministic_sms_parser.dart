import 'sms_models.dart';
import 'sms_parser.dart';

/// Fast local parser for common Indian bank SMS formats.
///
/// This avoids routing obvious card/UPI debits and refunds through the
/// server-side LLM. The server still exists as a fallback for messy cases.
class DeterministicSmsParser implements SmsParser {
  const DeterministicSmsParser();

  @override
  Future<SmsCandidate?> parse(IncomingSms sms) async => parseSync(sms);

  SmsCandidate? parseSync(IncomingSms sms) {
    final body = sms.body.replaceAll(RegExp(r'\s+'), ' ').trim();
    final isIncome = _inferIncome(body);
    if (isIncome == null) return null;
    final amount = _extractAmountCents(body);
    if (amount == null || amount <= 0) return null;
    return SmsCandidate(
      amountCents: amount,
      isIncome: isIncome,
      date: _extractDate(body) ?? sms.receivedAt,
      confidence: 0.9,
      payee: _extractPayee(body),
      accountHint: _extractAccountHint(body, sms.address),
      bankRef: _extractBankRef(body),
      parserVersion: 3,
    );
  }

  bool? _inferIncome(String body) {
    final s = body.toLowerCase();
    if (RegExp(
      r'\b(credited|credit(?:ed)?\s+to|received|recvd|deposited|refund(?:ed)?|cashback|salary|interest\s+(?:paid|credited))\b',
    ).hasMatch(s)) {
      return true;
    }
    if (RegExp(
      r'\b(debited|debit|spent|paid|sent|withdrawn|charged|purchase(?:d)?|used\s+at)\b',
    ).hasMatch(s)) {
      return false;
    }
    return null;
  }

  int? _extractAmountCents(String body) {
    final patterns = [
      RegExp(
        r'\b(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)',
        caseSensitive: false,
      ),
      RegExp(
        r'\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr)\b',
        caseSensitive: false,
      ),
    ];
    for (final re in patterns) {
      final raw = re.firstMatch(body)?.group(1);
      if (raw == null) continue;
      final n = double.tryParse(raw.replaceAll(',', ''));
      if (n != null && n > 0) return (n * 100).round();
    }
    return null;
  }

  String? _extractPayee(String body) {
    final patterns = [
      RegExp(
        r'\bto\s+(.+?)\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b',
        caseSensitive: false,
      ),
      RegExp(
        r'\bto\s+(.+?)\s*(?:\.|,)?\s*(?:upi\s+ref|ref(?:erence)?\b)',
        caseSensitive: false,
      ),
      RegExp(
        r'\bat\s+(.+?)\s*(?:\.|,)?\s*(?:upi\s+ref|ref(?:erence)?\b|on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|$)',
        caseSensitive: false,
      ),
      RegExp(
        r'\bfrom\s+(.+?)\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b',
        caseSensitive: false,
      ),
      RegExp(r'\bfrom\s+(.+?)\s+is\s+processed\b', caseSensitive: false),
    ];
    for (final re in patterns) {
      final cleaned = _cleanPayee(re.firstMatch(body)?.group(1));
      if (cleaned != null) return cleaned;
    }
    return null;
  }

  String? _cleanPayee(String? raw) {
    if (raw == null) return null;
    final cleaned = raw
        .replaceAll(
          RegExp(r'\b(?:UPI|NEFT|IMPS|RTGS)\b\s*$', caseSensitive: false),
          '',
        )
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .replaceAll(RegExp(r'[.,;:-]+$'), '')
        .trim();
    if (cleaned.isEmpty) return null;
    if (RegExp(
      r'^(?:kotak|hdfc|axis|icici|sbi|yes|idfc|bank|a/?c|ac)\b',
      caseSensitive: false,
    ).hasMatch(cleaned)) {
      return null;
    }
    return cleaned.length > 120 ? cleaned.substring(0, 120) : cleaned;
  }

  String? _extractAccountHint(String body, String sender) {
    final account = RegExp(
      r'\b(?:a/c|ac|account|card(?:\s+no\.?)?)\s*(?:x+|xx|ending\s*)?([0-9]{3,6})\b',
      caseSensitive: false,
    ).firstMatch(body)?.group(1);
    final bank =
        RegExp(
          r'\b(Kotak|HDFC|Axis|ICICI|SBI|Yes|IDFC|Federal|IndusInd|Canara|PNB)\b',
          caseSensitive: false,
        ).firstMatch(body)?.group(1) ??
        RegExp(
          r'-?([A-Z]{3,8})',
          caseSensitive: false,
        ).firstMatch(sender)?.group(1);
    if (account == null && bank == null) return null;
    return [
      if (bank != null) _titleCase(bank),
      if (account != null) 'AC X$account',
    ].join(' ');
  }

  DateTime? _extractDate(String body) {
    final match = RegExp(
      r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b',
    ).firstMatch(body);
    if (match == null) return null;
    final day = int.parse(match.group(1)!);
    final month = int.parse(match.group(2)!);
    var year = int.parse(match.group(3)!);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return DateTime(year, month, day);
  }

  String? _extractBankRef(String body) {
    return RegExp(
      r'\b(?:UPI\s+Ref|UPI\s+Reference|RRN|Ref(?:erence)?(?:\s+No\.?)?)\s*[:#-]?\s*([A-Z0-9]{6,})\b',
      caseSensitive: false,
    ).firstMatch(body)?.group(1);
  }

  String _titleCase(String s) {
    final lower = s.toLowerCase();
    return lower[0].toUpperCase() + lower.substring(1);
  }
}
