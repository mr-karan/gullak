import 'package:intl/intl.dart';

/// Minor units (cents/paise) helpers. Actual stores amounts as integer
/// minor units; we store the same and only format at the edges.
class Money {
  const Money._();

  static int parseToMinor(String input, {int minorDigits = 2}) {
    final normalized = input.replaceAll(',', '');
    final match = RegExp(r'\d+(?:\.\d+)?').firstMatch(normalized);
    if (match == null) return 0;
    final cleaned = match.group(0)!;
    final isNeg = normalized.substring(0, match.start).contains('-');
    final s = cleaned;
    final parts = s.split('.');
    final whole = int.tryParse(parts[0]) ?? 0;
    var minor = 0;
    if (parts.length > 1) {
      final frac = parts[1]
          .padRight(minorDigits, '0')
          .substring(0, minorDigits);
      minor = int.tryParse(frac) ?? 0;
    }
    final scale = _pow10(minorDigits);
    final total = whole * scale + minor;
    return isNeg ? -total : total;
  }

  static String format(
    int minor, {
    int minorDigits = 2,
    String symbol = '₹',
    bool showSign = false,
  }) {
    final scale = _pow10(minorDigits);
    final abs = minor.abs();
    final whole = abs ~/ scale;
    final frac = abs % scale;
    final formattedWhole = NumberFormat('#,##,###').format(whole);
    final fracStr = minorDigits == 0
        ? ''
        : '.${frac.toString().padLeft(minorDigits, '0')}';
    final sign = minor < 0 ? '-' : (showSign ? '+' : '');
    return '$sign$symbol$formattedWhole$fracStr';
  }

  /// Plain digits with no symbol, used in the keypad display.
  static String formatDigitsOnly(int minor, {int minorDigits = 2}) {
    final scale = _pow10(minorDigits);
    final whole = minor.abs() ~/ scale;
    final frac = minor.abs() % scale;
    final fracStr = minorDigits == 0
        ? ''
        : '.${frac.toString().padLeft(minorDigits, '0')}';
    return '$whole$fracStr';
  }

  static int _pow10(int n) {
    var r = 1;
    for (var i = 0; i < n; i++) {
      r *= 10;
    }
    return r;
  }

  /// Best-effort ISO code for a currency symbol, for deciding whether a parsed
  /// amount is in a foreign currency. Covers the symbols the onboarding picker
  /// offers; returns null for anything else (caller treats unknown as "can't
  /// tell", i.e. don't tag).
  static String? currencyCodeForSymbol(String symbol) {
    switch (symbol.trim()) {
      case '₹':
        return 'INR';
      case r'$':
        return 'USD';
      case '€':
        return 'EUR';
      case '£':
        return 'GBP';
      case '¥':
        return 'JPY';
      default:
        return null;
    }
  }

  /// Minor-unit count for an ISO 4217 currency code (USD→2, JPY→0), used when
  /// parsing/formatting a foreign amount whose scale differs from the base
  /// currency. Defaults to 2 when the code is unknown.
  static int minorDigitsForCurrency(String code) {
    try {
      return NumberFormat.simpleCurrency(
            name: code.toUpperCase(),
          ).decimalDigits ??
          2;
    } catch (_) {
      return 2;
    }
  }

  /// Format a foreign amount held in [minor] units of [code] (e.g. USD 2000 →
  /// "$20.00"). Display-only; no conversion to the base currency.
  static String formatForeign(int minor, String code) {
    final upper = code.toUpperCase();
    try {
      final fmt = NumberFormat.simpleCurrency(name: upper);
      final digits = fmt.decimalDigits ?? 2;
      return fmt.format(minor / _pow10(digits));
    } catch (_) {
      // Unknown code — show the raw amount with the code as a suffix.
      return '${format(minor, minorDigits: 2, symbol: '')} $upper';
    }
  }
}
