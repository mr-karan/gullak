import 'package:flutter/material.dart';

/// Month heatmap: a week-grid of day cells whose fill opacity ramps with that
/// day's spend (5 steps of `primary`). Answers "which days bleed money" at a
/// glance. Tap a day → [onTapDay]. Weeks start Monday.
class HeatmapCalendar extends StatelessWidget {
  const HeatmapCalendar({
    required this.year,
    required this.month,
    required this.valueByDay,
    this.onTapDay,
    super.key,
  });

  final int year;
  final int month; // 1..12

  /// day-of-month (1..31) → spend magnitude (>= 0). Missing days = 0.
  final Map<int, double> valueByDay;
  final void Function(int day)? onTapDay;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final daysInMonth = DateTime(year, month + 1, 0).day;
    // Monday=1..Sunday=7 → column 0..6.
    final firstWeekday = DateTime(year, month, 1).weekday;
    final maxV = valueByDay.values.fold<double>(0, (m, v) => v > m ? v : m);

    // 5-step opacity ramp of primary.
    Color cellColor(double v) {
      if (v <= 0 || maxV <= 0) return cs.surfaceContainerHighest;
      final step = (v / maxV * 4).ceil().clamp(1, 4); // 1..4
      return cs.primary.withValues(alpha: 0.15 + step * 0.2);
    }

    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    return Semantics(
      label: 'Spending heatmap for $year-${month.toString().padLeft(2, '0')}',
      child: LayoutBuilder(
        builder: (context, c) {
          const gap = 4.0;
          final cell = (c.maxWidth - gap * 6) / 7;
          final cells = <Widget>[];
          // Leading blanks.
          for (var i = 1; i < firstWeekday; i++) {
            cells.add(SizedBox(width: cell, height: cell));
          }
          for (var day = 1; day <= daysInMonth; day++) {
            final v = valueByDay[day] ?? 0;
            cells.add(
              GestureDetector(
                onTap: onTapDay == null ? null : () => onTapDay!(day),
                child: Container(
                  width: cell,
                  height: cell,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: cellColor(v),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '$day',
                    style: text.labelSmall?.copyWith(
                      color: v > (maxV * 0.5)
                          ? cs.onPrimary
                          : cs.onSurfaceVariant,
                      fontSize: 9,
                    ),
                  ),
                ),
              ),
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  for (final l in labels)
                    Expanded(
                      child: Center(
                        child: Text(
                          l,
                          style: text.labelSmall?.copyWith(
                            color: cs.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Wrap(spacing: gap, runSpacing: gap, children: cells),
            ],
          );
        },
      ),
    );
  }
}
