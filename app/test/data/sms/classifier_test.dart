import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/sms/classifier.dart';
import 'package:gullak/data/sms/sms_models.dart';

void main() {
  test('ignores credit card statements', () {
    expect(
      SmsClassifier.classify(
        IncomingSms(
          id: '1',
          address: 'AD-ICICIT-S',
          body:
              'ICICI Bank Credit Card XX9999 Statement is sent to ex********pl@example.com. Total of Rs 1,000.00 or minimum due.',
          receivedAt: DateTime(2026, 5, 6),
        ),
      ),
      SmsClassification.nonTransactional,
    );
  });

  test('ignores postpaid marketing plan messages', () {
    expect(
      SmsClassifier.classify(
        IncomingSms(
          id: '2',
          address: 'AX-AIRTEL-S',
          body:
              'Welcome to Airtel Postpaid. Now go Limitless with Unlimited Data on the all-new 449 Plan.',
          receivedAt: DateTime(2026, 5, 6),
        ),
      ),
      SmsClassification.nonTransactional,
    );
  });
}
