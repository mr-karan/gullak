import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/ui/category_palette.dart';
import 'package:gullak/ui/widgets/money_text.dart';

void main() {
  const light = ColorScheme.light();
  const dark = ColorScheme.dark();

  test('categoryColor is deterministic and stable per id', () {
    final a1 = categoryColor(light, 'groceries-id');
    final a2 = categoryColor(light, 'groceries-id');
    expect(a1, a2); // same id → same colour across calls
    // Different ids generally map to different hues (not guaranteed, but these
    // two do with the current ramp) — guards against a constant/broken hash.
    expect(categoryColor(light, 'a') == categoryColor(light, 'b'), isFalse);
  });

  test('explicit colour overrides the ramp', () {
    const argb = 0xFF123456;
    expect(categoryColor(light, 'anything', explicit: argb), const Color(argb));
  });

  test('categoryColor differs by brightness for the same id', () {
    // The dark ramp is lighter — a category is a different literal colour in
    // dark mode (both derived from the same hue slot).
    expect(categoryColor(light, 'x') == categoryColor(dark, 'x'), isFalse);
  });

  test('moneySemanticsLabel spells the sign', () {
    expect(moneySemanticsLabel(-45000), 'minus ₹450.00');
    expect(moneySemanticsLabel(45000), '₹450.00');
    expect(moneySemanticsLabel(45000, showSign: true), 'plus ₹450.00');
    expect(moneySemanticsLabel(0), '₹0.00');
    expect(
      moneySemanticsLabel(200000, minorDigits: 0, symbol: r'$'),
      r'$2,00,000',
    );
  });
}
