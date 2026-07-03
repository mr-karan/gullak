import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../motion.dart';
import 'chart_style.dart';

/// A 270° budget ring. Track is a faint gridline; fill is [color] up to 100%.
/// Past 100% the overflow is drawn as an `error`-coloured overshoot segment on
/// top so overspend reads at a glance. [child] (e.g. a percent label) sits in
/// the middle. Sweeps in on first build.
class ProgressArc extends StatelessWidget {
  const ProgressArc({
    required this.progress,
    this.size = 56,
    this.stroke = 6,
    this.color,
    this.child,
    this.semanticsLabel,
    super.key,
  });

  /// 0..N. Values > 1 render an overshoot segment.
  final double progress;
  final double size;
  final double stroke;
  final Color? color;
  final Widget? child;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final style = ChartStyle(Theme.of(context).colorScheme);
    final fill = color ?? style.spend;
    final duration = Motion.duration(context, Motion.slow);
    return Semantics(
      label: semanticsLabel ?? '${(progress * 100).round()} percent',
      child: SizedBox(
        width: size,
        height: size,
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: progress),
          duration: duration,
          curve: Motion.enter,
          builder: (context, p, child) => CustomPaint(
            painter: _ArcPainter(
              progress: p,
              stroke: stroke,
              track: style.grid,
              fill: fill,
              over: style.scheme.error,
            ),
            child: Center(child: child),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _ArcPainter extends CustomPainter {
  _ArcPainter({
    required this.progress,
    required this.stroke,
    required this.track,
    required this.fill,
    required this.over,
  });

  final double progress;
  final double stroke;
  final Color track;
  final Color fill;
  final Color over;

  // 270° arc starting bottom-left, sweeping clockwise (gap at the bottom).
  static const double _start = math.pi * 0.75;
  static const double _sweep = math.pi * 1.5;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final inset = rect.deflate(stroke / 2);
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(inset, _start, _sweep, false, base..color = track);

    final capped = progress.clamp(0.0, 1.0);
    if (capped > 0) {
      canvas.drawArc(inset, _start, _sweep * capped, false, base..color = fill);
    }
    // Overshoot: draw the fraction beyond 100% (up to one more full ring) on
    // top in the error colour.
    if (progress > 1) {
      final overFrac = (progress - 1).clamp(0.0, 1.0);
      canvas.drawArc(
        inset,
        _start,
        _sweep * overFrac,
        false,
        base..color = over,
      );
    }
  }

  @override
  bool shouldRepaint(_ArcPainter old) =>
      old.progress != progress || old.fill != fill || old.stroke != stroke;
}
