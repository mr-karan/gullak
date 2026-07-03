import 'package:flutter/material.dart';

/// Theme-derived colours + metrics shared by the chart kit so no painter
/// hardcodes a colour. Build one per `build()` from the ColorScheme.
class ChartStyle {
  ChartStyle(this.scheme);

  final ColorScheme scheme;

  /// Primary series (spend) and the accent series (income).
  Color get spend => scheme.primary;
  Color get income => scheme.tertiary;

  /// Hairline baselines / gridlines.
  Color get grid => scheme.outlineVariant.withValues(alpha: 0.5);

  /// Muted labels/ticks.
  Color get muted => scheme.onSurfaceVariant;

  /// Fill under a line/area, kept faint.
  Color areaFill(Color line) => line.withValues(alpha: 0.10);

  /// De-emphasised bar/segment (non-selected).
  Color dim(Color c) => c.withValues(alpha: 0.40);

  static const double barRadius = 6;
  static const double lineWidth = 1.5;
  static const double baseline = 1;
}
