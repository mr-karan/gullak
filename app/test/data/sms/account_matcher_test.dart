import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/sms/account_matcher.dart';

void main() {
  // Mirrors the user's real 8 accounts.
  const accounts = <AccountLite>[
    (id: 'kotak', name: 'Kotak UPI', kind: 'savings'),
    (id: 'axis_cc', name: 'Axis Credit Card', kind: 'credit_card'),
    (id: 'amex', name: 'Amex Credit Card', kind: 'credit_card'),
    (id: 'hdfc_regalia', name: 'HDFC Regalia Credit Card', kind: 'credit_card'),
    (id: 'hdfc', name: 'HDFC Bank', kind: 'savings'),
    (id: 'icici', name: 'ICICI Bank', kind: 'savings'),
    (id: 'idfc', name: 'IDFC FIRST Bank', kind: 'savings'),
    (id: 'sbi', name: 'SBI Bank', kind: 'savings'),
  ];

  test('null / empty hint → no match (caller falls back)', () {
    expect(matchAccountHint(null, accounts), isNull);
    expect(matchAccountHint('', accounts), isNull);
    expect(matchAccountHint('   ', accounts), isNull);
  });

  test('disambiguates the two HDFC accounts by card-vs-bank wording', () {
    // Credit card spend → HDFC Regalia, not HDFC Bank.
    expect(matchAccountHint('HDFC Card x4904', accounts), 'hdfc_regalia');
    // Bank account debit → HDFC Bank, not the card.
    expect(matchAccountHint('HDFC Bank A/C *9639', accounts), 'hdfc');
  });

  test('routes each bank to its own account', () {
    expect(matchAccountHint('Axis Bank Card no. XX2556', accounts), 'axis_cc');
    expect(matchAccountHint('Kotak Bank AC X2746', accounts), 'kotak');
    expect(matchAccountHint('IDFC FIRST Bank Tag 3XXX1400', accounts), 'idfc');
    expect(matchAccountHint('ICICI Bank', accounts), 'icici');
    expect(matchAccountHint('Amex card', accounts), 'amex');
  });

  test('last-4 digits in the account name win over a same-bank sibling', () {
    const withDigits = <AccountLite>[
      (id: 'hdfc_a', name: 'HDFC Bank 9639', kind: 'savings'),
      (id: 'hdfc_b', name: 'HDFC Bank 1234', kind: 'savings'),
    ];
    expect(matchAccountHint('HDFC Bank A/C *9639', withDigits), 'hdfc_a');
  });

  test('unknown bank → no confident match', () {
    expect(matchAccountHint('Yes Bank A/C x1111', accounts), isNull);
  });

  test('3-digit masked suffix still scores (parser emits 3-6 digit masks)', () {
    const withMask = <AccountLite>[
      (id: 'hdfc_a', name: 'HDFC Bank 639', kind: 'savings'),
      (id: 'hdfc_b', name: 'HDFC Bank 234', kind: 'savings'),
    ];
    expect(matchAccountHint('HDFC Bank AC X639', withMask), 'hdfc_a');
  });

  test('"credited" does not falsely read as a credit card', () {
    // Account-credit alert on a bank account must not get pulled to a CC.
    expect(matchAccountHint('Rs 5000 credited to HDFC Bank A/C', accounts),
        'hdfc');
  });
}
