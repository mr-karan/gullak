import 'package:intl/intl.dart';

/// Minor units (cents/paise) helpers. Actual stores amounts as integer
/// minor units; we store the same and only format at the edges.
class Money {
  const Money._();

  static int parseToMinor(String input, {int minorDigits = 2}) {
    final cleaned = input.replaceAll(RegExp(r'[^0-9.\-]'), '');
    if (cleaned.isEmpty) return 0;
    final isNeg = cleaned.startsWith('-');
    final s = isNeg ? cleaned.substring(1) : cleaned;
    final parts = s.split('.');
    final whole = int.tryParse(parts[0]) ?? 0;
    var minor = 0;
    if (parts.length > 1) {
      final frac = parts[1].padRight(minorDigits, '0').substring(0, minorDigits);
      minor = int.tryParse(frac) ?? 0;
    }
    final scale = _pow10(minorDigits);
    final total = whole * scale + minor;
    return isNeg ? -total : total;
  }

  static String format(int minor, {int minorDigits = 2, String symbol = '₹', bool showSign = false}) {
    final scale = _pow10(minorDigits);
    final abs = minor.abs();
    final whole = abs ~/ scale;
    final frac = abs % scale;
    final formattedWhole = NumberFormat('#,##,###').format(whole);
    final fracStr = minorDigits == 0 ? '' : '.${frac.toString().padLeft(minorDigits, '0')}';
    final sign = minor < 0 ? '-' : (showSign ? '+' : '');
    return '$sign$symbol$formattedWhole$fracStr';
  }

  /// Plain digits with no symbol, used in the keypad display.
  static String formatDigitsOnly(int minor, {int minorDigits = 2}) {
    final scale = _pow10(minorDigits);
    final whole = minor.abs() ~/ scale;
    final frac = minor.abs() % scale;
    final fracStr = minorDigits == 0 ? '' : '.${frac.toString().padLeft(minorDigits, '0')}';
    return '$whole$fracStr';
  }

  static int _pow10(int n) {
    var r = 1;
    for (var i = 0; i < n; i++) {
      r *= 10;
    }
    return r;
  }
}
