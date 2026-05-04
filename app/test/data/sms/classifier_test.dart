import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/sms/classifier.dart';
import 'package:gullak/data/sms/sms_models.dart';

void main() {
  IncomingSms sms(String address, String body) => IncomingSms(
    id: 'sms-1',
    address: address,
    body: body,
    receivedAt: DateTime(2026, 1, 2, 10),
  );

  group('SmsClassifier.classify', () {
    final cases = <({String name, IncomingSms sms, SmsClassification expected})>[
      (
        name: 'high confidence debit from known bank sender',
        sms: sms(
          'VK-HDFCBK',
          'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT on 02-01-2026.',
        ),
        expected: SmsClassification.transactionalHigh,
      ),
      (
        name: 'high confidence credit from known bank sender',
        sms: sms(
          'JD-ICICIB',
          'INR 5000.00 credited to your ICICI Bank account xx9876 on 02-Jan-2026.',
        ),
        expected: SmsClassification.transactionalHigh,
      ),
      (
        name: 'low confidence transaction from unknown sender',
        sms: sms(
          'NOTICE',
          'Your wallet was charged Rs 299.00 for purchase at STORE.',
        ),
        expected: SmsClassification.transactionalLow,
      ),
      (
        name: 'OTP from bank sender is non transactional',
        sms: sms(
          'VK-HDFCBK',
          '123456 is your OTP for HDFC Bank login. Do not share it.',
        ),
        expected: SmsClassification.nonTransactional,
      ),
      (
        name: 'marketing EMI offer with amount is non transactional',
        sms: sms(
          'VK-AXISBK',
          'Exciting EMI offer: get a loan offer up to Rs.500000 today.',
        ),
        expected: SmsClassification.nonTransactional,
      ),
      (
        name: 'cashback offer is non transactional',
        sms: sms(
          'VK-PAYTM',
          'Cashback offer unlocked. Spend Rs.100 and win rewards.',
        ),
        expected: SmsClassification.nonTransactional,
      ),
      (
        name: 'refund from known sender is high confidence',
        sms: sms(
          'VK-AMAZON',
          'Refund of Rs.249.00 credited to your original payment method.',
        ),
        expected: SmsClassification.transactionalHigh,
      ),
      (
        name: 'body without amount is non transactional',
        sms: sms('VK-SBIBANK', 'Your statement is ready for download.'),
        expected: SmsClassification.nonTransactional,
      ),
    ];

    for (final c in cases) {
      test(c.name, () {
        expect(SmsClassifier.classify(c.sms), c.expected);
      });
    }
  });
}
