import 'package:flutter/material.dart';

import '../../core/money.dart';
import '../theme.dart';

enum MoneySize { small, medium, large, hero }

class MoneyText extends StatelessWidget {
  const MoneyText({
    required this.amountCents,
    this.minorDigits = 2,
    this.symbol = '₹',
    this.size = MoneySize.medium,
    this.color,
    this.showSign = false,
    super.key,
  });

  final int amountCents;
  final int minorDigits;
  final String symbol;
  final MoneySize size;
  final Color? color;
  final bool showSign;

  @override
  Widget build(BuildContext context) {
    final dp = switch (size) {
      MoneySize.small => 14.0,
      MoneySize.medium => 16.0,
      MoneySize.large => 24.0,
      MoneySize.hero => 36.0,
    };
    final weight = size == MoneySize.hero ? FontWeight.w700 : FontWeight.w600;
    return Text(
      Money.format(
        amountCents,
        minorDigits: minorDigits,
        symbol: symbol,
        showSign: showSign,
      ),
      // Mono tabular glyphs can read oddly to a screen reader; give it a clean
      // spoken form with the sign spelled out.
      semanticsLabel: moneySemanticsLabel(
        amountCents,
        minorDigits: minorDigits,
        symbol: symbol,
        showSign: showSign,
      ),
      style: moneyStyle(
        context,
        size: dp,
        weight: weight,
      ).copyWith(color: color),
    );
  }
}

/// Screen-reader label for a money amount: the sign spelled out, then the
/// symbol and magnitude (e.g. -45000 → "minus ₹450.00").
String moneySemanticsLabel(
  int amountCents, {
  int minorDigits = 2,
  String symbol = '₹',
  bool showSign = false,
}) {
  final magnitude = Money.format(
    amountCents.abs(),
    minorDigits: minorDigits,
    symbol: symbol,
  );
  if (amountCents < 0) return 'minus $magnitude';
  if (showSign && amountCents > 0) return 'plus $magnitude';
  return magnitude;
}
