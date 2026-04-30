import '../sms_models.dart';
import 'parser.dart';

class HdfcCardParser implements SmsParser {
  @override
  String get id => 'hdfc_card';

  @override
  bool matches(IncomingSms sms) {
    final s = sms.address.toUpperCase();
    if (!s.contains('HDFC')) return false;
    final b = sms.body.toLowerCase();
    return b.contains('hdfc bank') &&
        (b.contains('credit card') || b.contains('debit card') || b.contains('card'));
  }

  @override
  SmsCandidate? parse(IncomingSms sms) {
    final amount = ParserUtil.extractRupees(sms.body);
    if (amount == null) return null;
    final merchant = ParserUtil.extractMerchant(sms.body);
    final last4 = ParserUtil.extractCardLast4(sms.body);
    final date = ParserUtil.extractDate(sms.body, sms.receivedAt) ?? sms.receivedAt;
    final isIncome = sms.body.toLowerCase().contains('refund') ||
        sms.body.toLowerCase().contains('credited') ||
        sms.body.toLowerCase().contains('received');
    return SmsCandidate(
      amountCents: amount,
      isIncome: isIncome,
      date: date,
      confidence: merchant == null ? 0.7 : 0.92,
      payee: merchant,
      accountHint: last4 != null ? 'HDFC ****$last4' : 'HDFC',
    );
  }
}

class HdfcUpiParser implements SmsParser {
  @override
  String get id => 'hdfc_upi';

  @override
  bool matches(IncomingSms sms) {
    final s = sms.address.toUpperCase();
    if (!s.contains('HDFC')) return false;
    final b = sms.body.toLowerCase();
    return b.contains('upi') ||
        b.contains('vpa') ||
        b.contains('a/c') ||
        b.contains('account');
  }

  @override
  SmsCandidate? parse(IncomingSms sms) {
    final amount = ParserUtil.extractRupees(sms.body);
    if (amount == null) return null;
    final last4 = ParserUtil.extractCardLast4(sms.body);
    final isCredit = sms.body.toLowerCase().contains('credited') ||
        sms.body.toLowerCase().contains('received');
    String? merchant;
    final upi = RegExp(r'(?:to|from)\s+([A-Z0-9.\-_@]+@[a-z]+)',
            caseSensitive: false)
        .firstMatch(sms.body);
    if (upi != null) {
      final vpa = upi.group(1)!;
      merchant = vpa.split('@').first.replaceAll('.', ' ').trim();
    } else {
      merchant = ParserUtil.extractMerchant(sms.body);
    }
    final date = ParserUtil.extractDate(sms.body, sms.receivedAt) ?? sms.receivedAt;
    return SmsCandidate(
      amountCents: amount,
      isIncome: isCredit,
      date: date,
      confidence: 0.88,
      payee: merchant,
      accountHint: last4 != null ? 'HDFC ****$last4' : 'HDFC',
    );
  }
}
