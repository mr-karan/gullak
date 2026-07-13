import 'package:flutter_test/flutter_test.dart';
import 'package:chavanni/core/money.dart';

void main() {
  group('Money.parseToMinor', () {
    test('parses INR-style amounts with commas and symbols', () {
      expect(Money.parseToMinor('Rs. 1,234.50'), 123450);
      expect(Money.parseToMinor('₹4.5'), 450);
      expect(Money.parseToMinor('INR 0.99'), 99);
    });

    test('parses negative amounts', () {
      expect(Money.parseToMinor('-₹1,234.50'), -123450);
      expect(Money.parseToMinor('Rs -12'), -1200);
    });

    test('handles empty and symbol-only input as zero', () {
      expect(Money.parseToMinor(''), 0);
      expect(Money.parseToMinor('Rs.'), 0);
      expect(Money.parseToMinor('₹'), 0);
    });

    test('supports zero minor digit currencies', () {
      expect(Money.parseToMinor('¥123', minorDigits: 0), 123);
      expect(Money.parseToMinor('JPY 1,234', minorDigits: 0), 1234);
    });
  });

  group('Money.format', () {
    test('formats INR with Indian digit grouping', () {
      expect(Money.format(123450), '₹1,234.50');
      expect(Money.format(123456789), '₹12,34,567.89');
    });

    test('formats signs when requested', () {
      expect(Money.format(-123450), '-₹1,234.50');
      expect(Money.format(123450, showSign: true), '+₹1,234.50');
    });

    test('formats zero minor digit currencies', () {
      expect(Money.format(1234, minorDigits: 0, symbol: '¥'), '¥1,234');
    });

    test('round-trips parsed amounts through formatting', () {
      final inr = Money.parseToMinor('₹12,345.67');
      expect(Money.format(inr), '₹12,345.67');

      final jpy = Money.parseToMinor('¥12,345', minorDigits: 0);
      expect(Money.format(jpy, minorDigits: 0, symbol: '¥'), '¥12,345');
    });
  });

  group('Money.formatDigitsOnly', () {
    test('formats keypad values without symbols', () {
      expect(Money.formatDigitsOnly(123450), '1234.50');
      expect(Money.formatDigitsOnly(1234, minorDigits: 0), '1234');
    });
  });
}
