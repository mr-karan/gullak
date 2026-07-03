import 'package:flutter/material.dart';

import '../motion.dart';
import 'chart_style.dart';

/// A compact trend line with a faint area fill and an optional dot on the last
/// point. No axes, no labels — it lives inline next to a hero number. Values
/// are plotted left→right; a flat/empty series renders a baseline.
class Sparkline extends StatelessWidget {
  const Sparkline({
    required this.values,
    this.height = 32,
    this.color,
    this.showLastDot = true,
    super.key,
  });

  final List<double> values;
  final double height;
  final Color? color;
  final bool showLastDot;

  @override
  Widget build(BuildContext context) {
    final style = ChartStyle(Theme.of(context).colorScheme);
    final line = color ?? style.spend;
    final duration = Motion.duration(context, Motion.slow);
    return Semantics(
      label: 'Trend, ${values.length} points',
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: duration,
        curve: Motion.enter,
        builder: (context, t, _) => CustomPaint(
          painter: _SparklinePainter(
            values: values,
            line: line,
            fill: style.areaFill(line),
            progress: t,
            showLastDot: showLastDot,
          ),
          size: Size.infinite,
        ),
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter({
    required this.values,
    required this.line,
    required this.fill,
    required this.progress,
    required this.showLastDot,
  });

  final List<double> values;
  final Color line;
  final Color fill;
  final double progress;
  final bool showLastDot;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) {
      final p = Paint()
        ..color = fill
        ..strokeWidth = 1;
      canvas.drawLine(
        Offset(0, size.height - 1),
        Offset(size.width, size.height - 1),
        p,
      );
      return;
    }
    final minV = values.reduce((a, b) => a < b ? a : b);
    final maxV = values.reduce((a, b) => a > b ? a : b);
    final range = (maxV - minV).abs() < 1e-9 ? 1.0 : (maxV - minV);
    final dx = values.length == 1 ? 0.0 : size.width / (values.length - 1);
    const pad = 2.0;

    Offset pointAt(int i) {
      final x = values.length == 1 ? size.width / 2 : dx * i;
      final norm = (values[i] - minV) / range;
      final y = pad + (1 - norm) * (size.height - 2 * pad);
      return Offset(x, y);
    }

    // Reveal the line left→right by [progress].
    final shown = (values.length * progress).ceil().clamp(1, values.length);
    final path = Path()..moveTo(pointAt(0).dx, pointAt(0).dy);
    for (var i = 1; i < shown; i++) {
      final o = pointAt(i);
      path.lineTo(o.dx, o.dy);
    }

    final area = Path.from(path)
      ..lineTo(pointAt(shown - 1).dx, size.height)
      ..lineTo(pointAt(0).dx, size.height)
      ..close();
    canvas.drawPath(area, Paint()..color = fill);

    canvas.drawPath(
      path,
      Paint()
        ..color = line
        ..style = PaintingStyle.stroke
        ..strokeWidth = ChartStyle.lineWidth
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    if (showLastDot && progress > 0.99) {
      canvas.drawCircle(pointAt(values.length - 1), 2.5, Paint()..color = line);
    }
  }

  @override
  bool shouldRepaint(_SparklinePainter old) =>
      old.progress != progress ||
      old.values != values ||
      old.line != line ||
      old.showLastDot != showLastDot;
}
