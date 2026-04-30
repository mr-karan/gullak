import '../sms_models.dart';

abstract class SmsParser {
  String get id;
  bool matches(IncomingSms sms);
  SmsCandidate? parse(IncomingSms sms);
}

/// Helpers shared across parsers.
class ParserUtil {
  const ParserUtil._();

  static int? extractRupees(String body) {
    final m = RegExp(
      r'(?:Rs\.?|INR|₹)\s?([0-9,]+(?:\.[0-9]+)?)',
      caseSensitive: false,
    ).firstMatch(body);
    if (m == null) return null;
    final raw = m.group(1)!.replaceAll(',', '');
    final parts = raw.split('.');
    final whole = int.tryParse(parts[0]) ?? 0;
    var frac = 0;
    if (parts.length > 1) {
      final fracStr = parts[1].padRight(2, '0').substring(0, 2);
      frac = int.tryParse(fracStr) ?? 0;
    }
    return whole * 100 + frac;
  }

  static String? extractMerchant(String body, {int maxWords = 6}) {
    final patterns = <RegExp>[
      RegExp(r'(?:at|@)\s+([A-Z][A-Z0-9 \-&._]+?)(?:\s+on\s|\s+ON\s|\s+\.|,|\.$|$)'),
      RegExp(r'to\s+([A-Z0-9 @.\-_]+?)(?:\s+on\s|\s+ON\s|\.|,|$)'),
      RegExp(r'merchant\s+([A-Za-z0-9 \-&._]+)', caseSensitive: false),
    ];
    for (final p in patterns) {
      final m = p.firstMatch(body);
      if (m != null) {
        final raw = m.group(1)!.trim();
        final clean = raw.split(RegExp(r'\s+')).take(maxWords).join(' ');
        if (clean.length > 1) return clean;
      }
    }
    return null;
  }

  static String? extractCardLast4(String body) {
    final m = RegExp(r'(?:xx|XX|x|\*+|ending|ending\s+with)\s*(\d{4})')
        .firstMatch(body);
    return m?.group(1);
  }

  static DateTime? extractDate(String body, DateTime fallback) {
    final p1 = RegExp(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})').firstMatch(body);
    if (p1 != null) {
      final d = int.tryParse(p1.group(1)!);
      final m = int.tryParse(p1.group(2)!);
      var y = int.tryParse(p1.group(3)!) ?? fallback.year;
      if (y < 100) y += 2000;
      if (d != null && m != null) {
        try {
          return DateTime(y, m, d);
        } catch (_) {}
      }
    }
    final p2 = RegExp(
      r'\b(\d{1,2})[-\s]?([A-Za-z]{3,9})[-\s]?(\d{2,4})',
    ).firstMatch(body);
    if (p2 != null) {
      final d = int.tryParse(p2.group(1)!);
      final mon = _monthIndex(p2.group(2)!);
      var y = int.tryParse(p2.group(3)!) ?? fallback.year;
      if (y < 100) y += 2000;
      if (d != null && mon != null) {
        try {
          return DateTime(y, mon, d);
        } catch (_) {}
      }
    }
    return null;
  }

  static int? _monthIndex(String s) {
    const months = {
      'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
      'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    };
    return months[s.toLowerCase().substring(0, 3)];
  }
}
