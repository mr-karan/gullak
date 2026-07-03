import 'package:flutter/material.dart';

/// Deterministic per-category colour so a category reads as the *same* colour
/// everywhere — chart segments, list swatches, budget bars. A fixed 12-hue
/// ramp of muted, roughly equal-luminance tones (tuned per brightness so text
/// on a 12%-alpha tint stays legible in both modes). The user's explicit
/// `categories.color` wins when set; otherwise the id hash picks a stable hue.
///
/// Keep the ramp length and order stable: changing it re-colours existing
/// categories. Add new hues only at the end.
const List<Color> _lightRamp = [
  Color(0xFF2F7E6E), // teal
  Color(0xFF3B6FB0), // blue
  Color(0xFF7A5AA6), // violet
  Color(0xFFB05089), // magenta
  Color(0xFFC0603F), // clay
  Color(0xFFB8863A), // ochre
  Color(0xFF5E8C3A), // olive
  Color(0xFF3E8E7E), // green-teal
  Color(0xFF6A6F8C), // slate
  Color(0xFFA65A5A), // rose
  Color(0xFF4C7BA6), // steel
  Color(0xFF8A6D3B), // bronze
];

const List<Color> _darkRamp = [
  Color(0xFF5AC2AC),
  Color(0xFF6FA0DE),
  Color(0xFFAE8AD8),
  Color(0xFFD98ABE),
  Color(0xFFE0906E),
  Color(0xFFDCB56A),
  Color(0xFF97C46A),
  Color(0xFF6FC2AE),
  Color(0xFF9AA0C0),
  Color(0xFFD68A8A),
  Color(0xFF7FAAD6),
  Color(0xFFC2A06A),
];

/// Stable colour for a category. [explicit] is `categories.color` (an ARGB int)
/// when the user chose one; otherwise a hue is derived from [id].
Color categoryColor(ColorScheme scheme, String id, {int? explicit}) {
  if (explicit != null) return Color(explicit);
  final ramp = scheme.brightness == Brightness.dark ? _darkRamp : _lightRamp;
  return ramp[_stableHash(id) % ramp.length];
}

/// Tinted background for a category swatch/glyph circle — the category colour
/// at a low alpha over the surface.
Color categoryTint(ColorScheme scheme, String id, {int? explicit}) =>
    categoryColor(scheme, id, explicit: explicit).withValues(alpha: 0.14);

// FNV-1a over the id — deterministic across runs (unlike String.hashCode,
// which is randomised per isolate) so a category keeps its colour.
int _stableHash(String s) {
  var h = 0x811c9dc5;
  for (final c in s.codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xFFFFFFFF;
  }
  return h;
}
