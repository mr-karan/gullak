import 'package:flutter/material.dart';

import '../motion.dart';
import 'money_text.dart';

/// A hero money figure that counts up to its value on first build and animates
/// between values on change — the "where did this number land" cue for Home /
/// Insights headlines. Respects reduce-motion (jumps straight to the value).
///
/// Renders through [MoneyText] so it keeps the mono/tabular treatment, sign
/// discipline, and screen-reader label (the label always reflects the final
/// value, not the mid-tween frame).
class CountUpMoney extends StatelessWidget {
  const CountUpMoney({
    required this.amountCents,
    this.minorDigits = 2,
    this.symbol = '₹',
    this.size = MoneySize.hero,
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
    final duration = Motion.duration(context, Motion.slow);
    return TweenAnimationBuilder<int>(
      // Keying by the target value restarts the tween from the previous frame's
      // displayed value when the target changes.
      tween: IntTween(begin: 0, end: amountCents),
      duration: duration,
      curve: Motion.enter,
      builder: (context, value, _) => MoneyText(
        amountCents: value,
        minorDigits: minorDigits,
        symbol: symbol,
        size: size,
        color: color,
        showSign: showSign,
      ),
    );
  }
}
