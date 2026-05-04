import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/sms/parser_registry.dart';
import 'package:gullak/data/sms/sms_models.dart';

void main() {
  IncomingSms sms(String address, String body) => IncomingSms(
    id: 'sms-1',
    address: address,
    body: body,
    receivedAt: DateTime(2026, 1, 2, 10),
  );

  group('ParserRegistry.tryParse', () {
    test('parses HDFC card debit', () {
      final candidate = ParserRegistry.tryParse(
        sms(
          'VK-HDFCBK',
          'Alert: Rs.450.00 spent on HDFC Bank Credit Card xx1234 at BLINKIT on 02-01-2026.',
        ),
      );

      expect(candidate, isNotNull);
      expect(candidate!.amountCents, 45000);
      expect(candidate.isIncome, isFalse);
      expect(candidate.date, DateTime(2026, 1, 2));
      expect(candidate.payee, 'BLINKIT');
      expect(candidate.accountHint, 'HDFC ****1234');
    });

    test('parses HDFC UPI credit', () {
      final candidate = ParserRegistry.tryParse(
        sms(
          'VK-HDFCBK',
          'Rs.300.00 credited to HDFC Bank a/c xx4321 from mom@upi on 02-Jan-2026.',
        ),
      );

      expect(candidate, isNotNull);
      expect(candidate!.amountCents, 30000);
      expect(candidate.isIncome, isTrue);
      expect(candidate.date, DateTime(2026, 1, 2));
      expect(candidate.payee, 'mom');
      expect(candidate.accountHint, 'HDFC ****4321');
    });

    test('parses ICICI debit', () {
      final candidate = ParserRegistry.tryParse(
        sms(
          'JD-ICICI',
          'ICICI Bank Account xx9876 debited with INR 1250.75 at ZOMATO on 02/01/2026.',
        ),
      );

      expect(candidate, isNotNull);
      expect(candidate!.amountCents, 125075);
      expect(candidate.isIncome, isFalse);
      expect(candidate.date, DateTime(2026, 1, 2));
      expect(candidate.payee, 'ZOMATO');
      expect(candidate.accountHint, 'ICICI ****9876');
    });

    test('parses Axis debit', () {
      final candidate = ParserRegistry.tryParse(
        sms(
          'VK-AXISBK',
          'Axis Bank card ending 1111 debited by Rs 89.50 at METRO on 02-Jan-2026.',
        ),
      );

      expect(candidate, isNotNull);
      expect(candidate!.amountCents, 8950);
      expect(candidate.isIncome, isFalse);
      expect(candidate.date, DateTime(2026, 1, 2));
      expect(candidate.payee, 'METRO');
      expect(candidate.accountHint, 'Axis ****1111');
    });

    test('parses SBI credit', () {
      final candidate = ParserRegistry.tryParse(
        sms(
          'VK-SBIBANK',
          'Your SBI a/c xx2222 credited by Rs.5000.00 from EMPLOYER on 02-01-2026.',
        ),
      );

      expect(candidate, isNotNull);
      expect(candidate!.amountCents, 500000);
      expect(candidate.isIncome, isTrue);
      expect(candidate.date, DateTime(2026, 1, 2));
      expect(candidate.payee, 'EMPLOYER');
      expect(candidate.accountHint, 'SBI ****2222');
    });

    test('returns null for unsupported sender', () {
      final candidate = ParserRegistry.tryParse(
        sms('NOTICE', 'Rs.450.00 debited at SHOP on 02-01-2026.'),
      );

      expect(candidate, isNull);
    });
  });
}
