import 'package:flutter/material.dart';

import '../motion.dart';
import 'chart_style.dart';

/// One column: a spend bar and an optional paired income bar, plus a short
/// axis label (day number, month abbrev).
class BarDatum {
  const BarDatum({required this.label, required this.spend, this.income = 0});
  final String label;
  final double spend;
  final double income;
}

/// Rounded-top paired bars (spend = primary, income = accent). Tap a column to
/// select it: the selected column goes full-opacity (others dim) and a tooltip
/// bubble shows [tooltipFor] above it. Bars grow from the baseline on first
/// build. `highlightIndex` optionally pre-emphasises one column (e.g. today).
class BarChart extends StatefulWidget {
  const BarChart({
    required this.data,
    this.height = 160,
    this.tooltipFor,
    this.onSelect,
    this.highlightIndex,
    this.semanticsLabel,
    super.key,
  });

  final List<BarDatum> data;
  final double height;

  /// Text shown in the tooltip bubble for the selected column.
  final String Function(int index)? tooltipFor;
  final ValueChanged<int?>? onSelect;
  final int? highlightIndex;
  final String? semanticsLabel;

  @override
  State<BarChart> createState() => _BarChartState();
}

class _BarChartState extends State<BarChart> {
  int? _selected;

  @override
  Widget build(BuildContext context) {
    final style = ChartStyle(Theme.of(context).colorScheme);
    final textTheme = Theme.of(context).textTheme;
    final duration = Motion.duration(context, Motion.slow);

    return Semantics(
      label:
          widget.semanticsLabel ?? 'Bar chart, ${widget.data.length} columns',
      child: SizedBox(
        height: widget.height,
        child: LayoutBuilder(
          builder: (context, constraints) {
            return GestureDetector(
              onTapDown: (d) =>
                  _handleTap(d.localPosition, constraints.maxWidth),
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: duration,
                curve: Motion.enter,
                builder: (context, t, _) => CustomPaint(
                  painter: _BarChartPainter(
                    data: widget.data,
                    style: style,
                    progress: t,
                    selected: _selected,
                    highlight: widget.highlightIndex,
                    tooltip: _selected != null && widget.tooltipFor != null
                        ? widget.tooltipFor!(_selected!)
                        : null,
                    labelStyle: textTheme.labelSmall!.copyWith(
                      color: style.muted,
                    ),
                    tooltipStyle: textTheme.labelMedium!.copyWith(
                      color: style.scheme.onInverseSurface,
                    ),
                    tooltipBg: style.scheme.inverseSurface,
                  ),
                  size: Size.infinite,
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  void _handleTap(Offset pos, double width) {
    if (widget.data.isEmpty) return;
    final slot = width / widget.data.length;
    final i = (pos.dx / slot).floor().clamp(0, widget.data.length - 1);
    setState(() => _selected = _selected == i ? null : i);
    widget.onSelect?.call(_selected);
  }
}

class _BarChartPainter extends CustomPainter {
  _BarChartPainter({
    required this.data,
    required this.style,
    required this.progress,
    required this.selected,
    required this.highlight,
    required this.tooltip,
    required this.labelStyle,
    required this.tooltipStyle,
    required this.tooltipBg,
  });

  final List<BarDatum> data;
  final ChartStyle style;
  final double progress;
  final int? selected;
  final int? highlight;
  final String? tooltip;
  final TextStyle labelStyle;
  final TextStyle tooltipStyle;
  final Color tooltipBg;

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;
    const labelH = 16.0;
    const topPad = 8.0;
    final chartH = size.height - labelH - topPad;
    final slot = size.width / data.length;

    var maxV = 0.0;
    for (final d in data) {
      if (d.spend > maxV) maxV = d.spend;
      if (d.income > maxV) maxV = d.income;
    }
    if (maxV <= 0) maxV = 1;

    // Baseline.
    final baseY = topPad + chartH;
    canvas.drawLine(
      Offset(0, baseY),
      Offset(size.width, baseY),
      Paint()
        ..color = style.grid
        ..strokeWidth = ChartStyle.baseline,
    );

    final paired = data.any((d) => d.income > 0);
    for (var i = 0; i < data.length; i++) {
      final d = data[i];
      final isSel = selected == i;
      final isHi = highlight == i;
      final emphasised =
          isSel || isHi || (selected == null && highlight == null);
      final cx = slot * i + slot / 2;
      final barW = (slot * (paired ? 0.28 : 0.5)).clamp(3.0, 22.0);

      void bar(double value, Color color, double offset) {
        final h = (value / maxV) * chartH * progress;
        if (h <= 0) return;
        final left = cx + offset - barW / 2;
        final rect = RRect.fromRectAndCorners(
          Rect.fromLTWH(left, baseY - h, barW, h),
          topLeft: const Radius.circular(ChartStyle.barRadius),
          topRight: const Radius.circular(ChartStyle.barRadius),
        );
        canvas.drawRRect(
          rect,
          Paint()..color = emphasised ? color : style.dim(color),
        );
      }

      if (paired) {
        bar(d.spend, style.spend, -barW * 0.6);
        bar(d.income, style.income.withValues(alpha: 0.7), barW * 0.6);
      } else {
        bar(d.spend, style.spend, 0);
      }

      // Axis label (skip crowded ones: show ~every ceil(n/8)th).
      final step = (data.length / 8).ceil();
      if (i % step == 0 || isSel) {
        final tp = TextPainter(
          text: TextSpan(text: d.label, style: labelStyle),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, Offset(cx - tp.width / 2, baseY + 3));
      }
    }

    if (tooltip != null && selected != null) {
      _paintTooltip(canvas, size, slot, selected!);
    }
  }

  void _paintTooltip(Canvas canvas, Size size, double slot, int i) {
    final tp = TextPainter(
      text: TextSpan(text: tooltip, style: tooltipStyle),
      textDirection: TextDirection.ltr,
    )..layout();
    const padH = 8.0;
    const padV = 5.0;
    final w = tp.width + padH * 2;
    final h = tp.height + padV * 2;
    var left = slot * i + slot / 2 - w / 2;
    left = left.clamp(0, size.width - w);
    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(left, 0, w, h),
      const Radius.circular(8),
    );
    canvas.drawRRect(rect, Paint()..color = tooltipBg);
    tp.paint(canvas, Offset(left + padH, padV));
  }

  @override
  bool shouldRepaint(_BarChartPainter old) =>
      old.progress != progress ||
      old.selected != selected ||
      old.highlight != highlight ||
      old.tooltip != tooltip ||
      old.data != data;
}
