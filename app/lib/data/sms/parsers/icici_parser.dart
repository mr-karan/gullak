import '../sms_models.dart';
import 'parser.dart';

class IciciParser implements SmsParser {
  @override
  String get id => 'icici';

  @override
  bool matches(IncomingSms sms) {
    final s = sms.address.toUpperCase();
    return s.contains('ICICI');
  }

  @override
  SmsCandidate? parse(IncomingSms sms) {
    final amount = ParserUtil.extractRupees(sms.body);
    if (amount == null) return null;
    final last4 = ParserUtil.extractCardLast4(sms.body);
    final merchant = ParserUtil.extractMerchant(sms.body);
    final isCredit =
        sms.body.toLowerCase().contains('credited') ||
        sms.body.toLowerCase().contains('received');
    final date =
        ParserUtil.extractDate(sms.body, sms.receivedAt) ?? sms.receivedAt;
    return SmsCandidate(
      amountCents: amount,
      isIncome: isCredit,
      date: date,
      confidence: merchant == null ? 0.7 : 0.9,
      payee: merchant,
      accountHint: last4 != null ? 'ICICI ****$last4' : 'ICICI',
    );
  }
}
