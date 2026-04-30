import '../sms_models.dart';
import 'parser.dart';

class AxisParser implements SmsParser {
  @override
  String get id => 'axis';

  @override
  bool matches(IncomingSms sms) {
    return sms.address.toUpperCase().contains('AXIS');
  }

  @override
  SmsCandidate? parse(IncomingSms sms) {
    final amount = ParserUtil.extractRupees(sms.body);
    if (amount == null) return null;
    final last4 = ParserUtil.extractCardLast4(sms.body);
    final merchant = ParserUtil.extractMerchant(sms.body);
    final isCredit = sms.body.toLowerCase().contains('credited') ||
        sms.body.toLowerCase().contains('received');
    final date = ParserUtil.extractDate(sms.body, sms.receivedAt) ?? sms.receivedAt;
    return SmsCandidate(
      amountCents: amount,
      isIncome: isCredit,
      date: date,
      confidence: merchant == null ? 0.7 : 0.9,
      payee: merchant,
      accountHint: last4 != null ? 'Axis ****$last4' : 'Axis',
    );
  }
}
