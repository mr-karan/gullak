import 'package:flutter/material.dart';

import '../motion.dart';

/// A looping shimmer for loading placeholders. Wrap a subtree of [Skeleton]
/// shapes in [SkeletonShimmer] to animate them together. Pure Flutter — no
/// package. Skeletons should mirror the real layout's paddings so content
/// doesn't jump when it arrives.
///
/// Usage:
/// ```dart
/// const SkeletonShimmer(
///   child: Column(children: [Skeleton.line(width: 120), Skeleton.box(height: 48)]),
/// )
/// ```
class SkeletonShimmer extends StatefulWidget {
  const SkeletonShimmer({required this.child, super.key});

  final Widget child;

  @override
  State<SkeletonShimmer> createState() => _SkeletonShimmerState();

  /// Animation phase [0,1] for descendant [Skeleton]s, or null when there is no
  /// shimmer ancestor (skeletons then render as a flat block).
  static double? phaseOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_ShimmerScope>()?.phase;
}

class _SkeletonShimmerState extends State<SkeletonShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    if (!Motion.reduceMotion(context)) _ctrl.repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, child) =>
          _ShimmerScope(phase: _ctrl.value, child: child!),
      child: widget.child,
    );
  }
}

class _ShimmerScope extends InheritedWidget {
  const _ShimmerScope({required this.phase, required super.child});

  final double phase;

  @override
  bool updateShouldNotify(_ShimmerScope oldWidget) => oldWidget.phase != phase;
}

/// A single placeholder shape. Renders a subtle horizontal sheen driven by the
/// nearest [SkeletonShimmer]; falls back to a flat fill when there's none.
class Skeleton extends StatelessWidget {
  const Skeleton({
    this.width,
    this.height = 14,
    this.radius = 8,
    this.shape = BoxShape.rectangle,
    super.key,
  });

  const Skeleton.line({double? width, double height = 12, Key? key})
    : this(width: width, height: height, radius: 6, key: key);

  const Skeleton.box({
    double? width,
    double height = 48,
    double radius = 12,
    Key? key,
  }) : this(width: width, height: height, radius: radius, key: key);

  const Skeleton.circle({double size = 36, Key? key})
    : this(
        width: size,
        height: size,
        radius: size,
        shape: BoxShape.circle,
        key: key,
      );

  final double? width;
  final double height;
  final double radius;
  final BoxShape shape;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final base = cs.surfaceContainerHighest;
    final highlight = Color.alphaBlend(
      cs.onSurface.withValues(alpha: 0.06),
      base,
    );
    final phase = SkeletonShimmer.phaseOf(context);

    final decoration = BoxDecoration(
      color: phase == null ? base : null,
      shape: shape,
      borderRadius: shape == BoxShape.circle
          ? null
          : BorderRadius.circular(radius),
      gradient: phase == null
          ? null
          : LinearGradient(
              // Sweep the highlight left→right across the shape.
              begin: Alignment(-1 - 2 * (1 - phase), 0),
              end: Alignment(1 - 2 * (1 - phase) + 2, 0),
              colors: [base, highlight, base],
              stops: const [0.35, 0.5, 0.65],
            ),
    );

    return SizedBox(
      width: width,
      height: height,
      child: DecoratedBox(decoration: decoration),
    );
  }
}
