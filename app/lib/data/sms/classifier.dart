import 'sms_models.dart';

/// Coarse "is this an SMS we care about?" filter.
///
/// Tier 1: known sender allowlist (Indian bank short-codes).
/// Tier 2: keyword + currency + numeric pattern.
class SmsClassifier {
  static const _knownSenderSubstrings = <String>[
    'HDFC',
    'HDFCBK',
    'ICICI',
    'ICICIB',
    'AXIS',
    'AXISBK',
    'SBI',
    'SBIINB',
    'SBIBANK',
    'KOTAK',
    'YES',
    'YESBNK',
    'INDUS',
    'IIB',
    'INDUSB',
    'RBL',
    'RBLBNK',
    'CITI',
    'AMEX',
    'BAJAJ',
    'BOB',
    'PNB',
    'CANARA',
    'CANBK',
    'IDFC',
    'IDFCFB',
    'IDBI',
    'PAYTM',
    'AMAZON',
    'HSBC',
  ];

  static final _otpPattern = RegExp(
    r'\b(otp|one[\s-]time|verification\s*code|validate.*code)\b',
    caseSensitive: false,
  );

  static final _marketingPattern = RegExp(
    r'\b(loan offer|emi offer|win|congratulations|claim|prize|exciting offer|cashback offer)\b',
    caseSensitive: false,
  );

  static final _txKeyword = RegExp(
    r'\b(debited|credited|spent|paid|withdrawn|received|transferred|purchase|charged|refund|debit|credit|swiped|sent)\b',
    caseSensitive: false,
  );

  static final _currencyAmount = RegExp(
    r'(?:Rs\.?|INR|₹|USD|\$)\s?[0-9]+(?:[.,][0-9]+)?',
    caseSensitive: false,
  );

  static SmsClassification classify(IncomingSms sms) {
    if (_otpPattern.hasMatch(sms.body)) {
      return SmsClassification.nonTransactional;
    }
    if (_marketingPattern.hasMatch(sms.body)) {
      return SmsClassification.nonTransactional;
    }
    final senderUpper = sms.address.toUpperCase();
    final senderMatches = _knownSenderSubstrings.any(senderUpper.contains);
    final keywordHit = _txKeyword.hasMatch(sms.body);
    final amountHit = _currencyAmount.hasMatch(sms.body);
    if (senderMatches && keywordHit && amountHit) {
      return SmsClassification.transactionalHigh;
    }
    if (keywordHit && amountHit) {
      return SmsClassification.transactionalLow;
    }
    return SmsClassification.nonTransactional;
  }
}

enum SmsClassification { transactionalHigh, transactionalLow, nonTransactional }
