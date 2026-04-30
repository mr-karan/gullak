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
      style: moneyStyle(context, size: dp, weight: weight).copyWith(color: color),
    );
  }
}
