import 'package:flutter/material.dart';

/// Tiny coloured circle with the first letter of the category name.
/// Used in transaction lists to give each row a glanceable visual anchor.
class CategorySwatch extends StatelessWidget {
  const CategorySwatch({
    required this.label,
    this.size = 36,
    this.colorOverride,
    this.icon,
    this.symbol,
    super.key,
  });

  final String label;
  final double size;
  final Color? colorOverride;
  final IconData? icon;
  final String? symbol;

  @override
  Widget build(BuildContext context) {
    final c = colorOverride ?? colorFor(label);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(size / 2),
      ),
      child: icon != null
          ? Icon(icon, size: size * 0.5, color: c)
          : Text(
              symbol?.trim().isNotEmpty == true
                  ? symbol!.trim()
                  : _initial(label),
              style: TextStyle(
                fontSize: symbol == null ? size * 0.42 : size * 0.5,
                fontWeight: FontWeight.w700,
                color: c,
              ),
            ),
    );
  }

  static String _initial(String s) {
    final t = s.trim();
    if (t.isEmpty) return '·';
    return t.characters.first.toUpperCase();
  }
}

/// Deterministic colour for a label string. Stable across runs.
Color colorFor(String label) {
  if (label.isEmpty) return _palette[0];
  // FNV-1a hash; quick, decent distribution.
  var hash = 0x811c9dc5;
  for (final unit in label.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return _palette[hash % _palette.length];
}

const List<Color> _palette = [
  Color(0xFF0A6E58), // calm green (matches seed)
  Color(0xFFB45309), // amber
  Color(0xFF1D4ED8), // blue
  Color(0xFFB91C1C), // red
  Color(0xFF7C3AED), // violet
  Color(0xFFC2410C), // orange
  Color(0xFF065F46), // emerald
  Color(0xFF0E7490), // cyan
  Color(0xFFA21CAF), // fuchsia
  Color(0xFF4D7C0F), // lime
  Color(0xFF92400E), // brown
  Color(0xFF6D28D9), // indigo
];
