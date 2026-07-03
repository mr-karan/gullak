import 'package:flutter/widgets.dart';

/// Motion tokens. Motion here explains ("where did this number go / come
/// from"), it doesn't decorate. Three speeds only; standard easing.
///
/// Always gate real animation on [reduceMotion] so the OS "reduce animations"
/// setting collapses durations to zero.
abstract final class Motion {
  /// State changes (selection, small toggles).
  static const Duration fast = Duration(milliseconds: 150);

  /// Navigation, sheets, container transforms.
  static const Duration base = Duration(milliseconds: 220);

  /// Count-ups and charts entering.
  static const Duration slow = Duration(milliseconds: 400);

  /// Decelerate for things arriving (bars growing, numbers counting up).
  static const Curve enter = Curves.easeOutCubic;

  /// Standard for state changes.
  static const Curve standard = Curves.easeInOut;

  /// True when the platform asks for reduced motion — callers should use
  /// [Duration.zero] instead of the tokens above.
  static bool reduceMotion(BuildContext context) =>
      MediaQuery.maybeOf(context)?.disableAnimations ?? false;

  /// Convenience: a duration that respects the reduce-motion setting.
  static Duration duration(BuildContext context, Duration d) =>
      reduceMotion(context) ? Duration.zero : d;
}
