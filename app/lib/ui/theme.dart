import 'package:flutter/material.dart';

// Editorial type families, bundled as assets (see pubspec `fonts:`). These are
// the family names declared there — used directly instead of google_fonts so
// nothing is fetched over the network at runtime.
//
// These are VARIABLE fonts (one file per family, a `wght` axis). Flutter's
// `fontWeight` alone does NOT pick a weight from a single variable asset — the
// axis must be driven via `fontVariations`. So every weighted style pairs
// `fontWeight` (kept for widget semantics / non-variable fallback) with a
// matching `FontVariation('wght', …)`. Fraunces also has an optical-size axis
// (default 9, and a default weight of 900) — pin `opsz` near the point size so
// display text uses the display cut instead of rendering ultra-heavy.
const String _serif = 'Fraunces'; // display + headline
const String _sans = 'Inter'; // UI surfaces
const String _mono = 'JetBrainsMono'; // money

List<FontVariation> _wght(int w) => [FontVariation('wght', w.toDouble())];
List<FontVariation> _serifAxes(int w, double opsz) => [
  FontVariation('wght', w.toDouble()),
  FontVariation('opsz', opsz),
];

/// Editorial palette — warm off-white surface, charcoal text, kept teal
/// primary, burnt amber for income/positive moments, rose-clay for danger.
/// Tuned to read calm and expensive, not loud.
const Color _kSeedColor = Color(0xFF0A6E58);

class _Palette {
  // Light
  // Light — cool, crisp neutrals (Kite-like) rather than warm cream.
  static const lightSurface = Color(0xFFFCFCFD);
  static const lightSurfaceDim = Color(0xFFEFF1F4);
  static const lightSurfaceContainer = Color(0xFFF4F5F7);
  static const lightSurfaceContainerHigh = Color(0xFFEDEEF1);
  static const lightSurfaceContainerHighest = Color(0xFFE5E7EB);
  static const lightOnSurface = Color(0xFF1A1D22);
  // Darkened from #6B7280 (~4.6:1) to clear WCAG AA comfortably (~5.5:1) on the
  // near-white surface, so muted text survives cheap panels.
  static const lightOnSurfaceVariant = Color(0xFF5B6472);
  static const lightOutline = Color(0xFFC7CBD1);
  static const lightOutlineVariant = Color(0xFFE5E7EB);

  static const lightPrimary = Color(0xFF0A6E58);
  static const lightOnPrimary = Color(0xFFFFFFFF);
  static const lightPrimaryContainer = Color(0xFFD7EFE6);
  static const lightOnPrimaryContainer = Color(0xFF033E30);

  // Income / positive: green (Kite sign discipline), not warm amber.
  static const lightAccent = Color(0xFF1B8A5A);
  static const lightOnAccent = Color(0xFFFFFFFF);
  static const lightAccentContainer = Color(0xFFD6F0E2);
  static const lightOnAccentContainer = Color(0xFF06402B);

  static const lightDanger = Color(0xFFB23A48);
  static const lightOnDanger = Color(0xFFFAF9F6);
  static const lightDangerContainer = Color(0xFFF8DBDF);
  static const lightOnDangerContainer = Color(0xFF601420);

  // Dark — cool slate (Kite-like), not warm.
  static const darkSurface = Color(0xFF121417);
  static const darkSurfaceDim = Color(0xFF0D0F11);
  static const darkSurfaceContainer = Color(0xFF1A1D21);
  static const darkSurfaceContainerHigh = Color(0xFF22262B);
  static const darkSurfaceContainerHighest = Color(0xFF2A2F35);
  static const darkOnSurface = Color(0xFFE6E8EC);
  static const darkOnSurfaceVariant = Color(0xFF9AA0AA);
  static const darkOutline = Color(0xFF4A4F57);
  static const darkOutlineVariant = Color(0xFF2E333A);

  static const darkPrimary = Color(0xFF46C2A2);
  static const darkOnPrimary = Color(0xFF003225);
  static const darkPrimaryContainer = Color(0xFF0E5544);
  static const darkOnPrimaryContainer = Color(0xFFB6E8D6);

  // Income / positive: green (Kite sign discipline).
  static const darkAccent = Color(0xFF46C28A);
  static const darkOnAccent = Color(0xFF00351F);
  static const darkAccentContainer = Color(0xFF0E5540);
  static const darkOnAccentContainer = Color(0xFFCDEFDE);

  static const darkDanger = Color(0xFFF2837F);
  static const darkOnDanger = Color(0xFF44131A);
  static const darkDangerContainer = Color(0xFF7C2231);
  static const darkOnDangerContainer = Color(0xFFFADBDF);
}

/// The single colour anchor exported for adaptive_icon_background and
/// other places that need a hex of "the brand colour".
const Color kSeedColor = _kSeedColor;

ThemeData buildLightTheme() => _build(Brightness.light);
ThemeData buildDarkTheme() => _build(Brightness.dark);

ColorScheme _scheme(Brightness brightness) {
  if (brightness == Brightness.light) {
    return const ColorScheme(
      brightness: Brightness.light,
      primary: _Palette.lightPrimary,
      onPrimary: _Palette.lightOnPrimary,
      primaryContainer: _Palette.lightPrimaryContainer,
      onPrimaryContainer: _Palette.lightOnPrimaryContainer,
      secondary: _Palette.lightPrimary,
      onSecondary: _Palette.lightOnPrimary,
      secondaryContainer: _Palette.lightPrimaryContainer,
      onSecondaryContainer: _Palette.lightOnPrimaryContainer,
      // Tertiary carries the editorial accent — burnt amber. Used for
      // income, refunds, salary, and any "positive credit" moment.
      tertiary: _Palette.lightAccent,
      onTertiary: _Palette.lightOnAccent,
      tertiaryContainer: _Palette.lightAccentContainer,
      onTertiaryContainer: _Palette.lightOnAccentContainer,
      error: _Palette.lightDanger,
      onError: _Palette.lightOnDanger,
      errorContainer: _Palette.lightDangerContainer,
      onErrorContainer: _Palette.lightOnDangerContainer,
      surface: _Palette.lightSurface,
      onSurface: _Palette.lightOnSurface,
      onSurfaceVariant: _Palette.lightOnSurfaceVariant,
      outline: _Palette.lightOutline,
      outlineVariant: _Palette.lightOutlineVariant,
      surfaceContainerLowest: _Palette.lightSurface,
      surfaceContainerLow: _Palette.lightSurface,
      surfaceContainer: _Palette.lightSurfaceContainer,
      surfaceContainerHigh: _Palette.lightSurfaceContainerHigh,
      surfaceContainerHighest: _Palette.lightSurfaceContainerHighest,
      surfaceDim: _Palette.lightSurfaceDim,
      surfaceBright: _Palette.lightSurface,
      surfaceTint: _Palette.lightPrimary,
      inverseSurface: Color(0xFF272A26),
      onInverseSurface: Color(0xFFEFECE3),
      inversePrimary: _Palette.darkPrimary,
      shadow: Color(0xFF000000),
      scrim: Color(0xFF000000),
    );
  }
  return const ColorScheme(
    brightness: Brightness.dark,
    primary: _Palette.darkPrimary,
    onPrimary: _Palette.darkOnPrimary,
    primaryContainer: _Palette.darkPrimaryContainer,
    onPrimaryContainer: _Palette.darkOnPrimaryContainer,
    secondary: _Palette.darkPrimary,
    onSecondary: _Palette.darkOnPrimary,
    secondaryContainer: _Palette.darkPrimaryContainer,
    onSecondaryContainer: _Palette.darkOnPrimaryContainer,
    tertiary: _Palette.darkAccent,
    onTertiary: _Palette.darkOnAccent,
    tertiaryContainer: _Palette.darkAccentContainer,
    onTertiaryContainer: _Palette.darkOnAccentContainer,
    error: _Palette.darkDanger,
    onError: _Palette.darkOnDanger,
    errorContainer: _Palette.darkDangerContainer,
    onErrorContainer: _Palette.darkOnDangerContainer,
    surface: _Palette.darkSurface,
    onSurface: _Palette.darkOnSurface,
    onSurfaceVariant: _Palette.darkOnSurfaceVariant,
    outline: _Palette.darkOutline,
    outlineVariant: _Palette.darkOutlineVariant,
    surfaceContainerLowest: _Palette.darkSurfaceDim,
    surfaceContainerLow: _Palette.darkSurface,
    surfaceContainer: _Palette.darkSurfaceContainer,
    surfaceContainerHigh: _Palette.darkSurfaceContainerHigh,
    surfaceContainerHighest: _Palette.darkSurfaceContainerHighest,
    surfaceDim: _Palette.darkSurfaceDim,
    surfaceBright: _Palette.darkSurfaceContainerHighest,
    surfaceTint: _Palette.darkPrimary,
    inverseSurface: _Palette.lightSurface,
    onInverseSurface: _Palette.lightOnSurface,
    inversePrimary: _Palette.lightPrimary,
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
  );
}

ThemeData _build(Brightness brightness) {
  final scheme = _scheme(brightness);
  final base = ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    brightness: brightness,
    scaffoldBackgroundColor: scheme.surface,
    splashFactory: InkSparkle.splashFactory,
  );
  return base.copyWith(
    textTheme: _textTheme(base.textTheme, scheme),
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: _serif,
        fontSize: 22,
        fontWeight: FontWeight.w600,
        fontVariations: _serifAxes(600, 22),
        height: 1.2,
        color: scheme.onSurface,
      ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surfaceContainer,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        // Crisper, Kite-ish radius; a hairline edge instead of shadow keeps
        // surfaces defined on the cool near-white background without weight.
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: scheme.outlineVariant.withValues(alpha: 0.8),
          width: 0.5,
        ),
      ),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: scheme.onSurfaceVariant,
      titleTextStyle: base.textTheme.titleMedium,
      subtitleTextStyle: base.textTheme.bodyMedium?.copyWith(
        color: scheme.onSurfaceVariant,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainerHigh,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: scheme.outlineVariant.withValues(alpha: 0.4),
          width: 0.5,
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.primary, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: TextStyle(
          fontFamily: _sans,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          fontVariations: _wght(600),
          letterSpacing: 0.1,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 52),
        side: BorderSide(color: scheme.outline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        textStyle: TextStyle(
          fontFamily: _sans,
          fontSize: 14,
          fontWeight: FontWeight.w600,
          fontVariations: _wght(600),
          letterSpacing: 0.1,
        ),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: scheme.primary,
      foregroundColor: scheme.onPrimary,
      elevation: 0,
      highlightElevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: scheme.inverseSurface,
      contentTextStyle: TextStyle(
        fontFamily: _sans,
        fontSize: 14,
        color: scheme.onInverseSurface,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surfaceContainerHigh,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      showDragHandle: true,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainerHigh,
      side: BorderSide.none,
      labelStyle: TextStyle(
        fontFamily: _sans,
        fontSize: 13,
        fontWeight: FontWeight.w500,
        fontVariations: _wght(500),
        color: scheme.onSurface,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      indicatorColor: scheme.primaryContainer,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontFamily: _sans,
          fontSize: 11.5,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          fontVariations: _wght(selected ? 600 : 500),
          color: scheme.onSurface,
        );
      }),
    ),
    dividerTheme: DividerThemeData(
      color: scheme.outlineVariant.withValues(alpha: 0.5),
      thickness: 0.5,
      space: 1,
    ),
  );
}

TextTheme _textTheme(TextTheme base, ColorScheme scheme) {
  // Fraunces (variable serif) carries display + headline. Inter handles
  // every UI surface — bodies, titles, labels. Money typography lives
  // in [moneyStyle].
  final display = base.apply(fontFamily: _serif);
  final ui = base.apply(fontFamily: _sans);
  return base.copyWith(
    // Editorial display: serif, big, deliberate. Fraunces gets wght + opsz.
    displayLarge: display.displayLarge?.copyWith(
      fontSize: 40,
      height: 1.1,
      fontWeight: FontWeight.w700,
      fontVariations: _serifAxes(700, 40),
      letterSpacing: -0.5,
      color: scheme.onSurface,
    ),
    displayMedium: display.displayMedium?.copyWith(
      fontSize: 32,
      height: 1.15,
      fontWeight: FontWeight.w700,
      fontVariations: _serifAxes(700, 32),
      letterSpacing: -0.3,
      color: scheme.onSurface,
    ),
    headlineLarge: display.headlineLarge?.copyWith(
      fontSize: 26,
      height: 1.2,
      fontWeight: FontWeight.w600,
      fontVariations: _serifAxes(600, 26),
      color: scheme.onSurface,
    ),
    headlineMedium: display.headlineMedium?.copyWith(
      fontSize: 22,
      height: 1.25,
      fontWeight: FontWeight.w600,
      fontVariations: _serifAxes(600, 22),
      color: scheme.onSurface,
    ),
    headlineSmall: display.headlineSmall?.copyWith(
      fontSize: 18,
      height: 1.3,
      fontWeight: FontWeight.w600,
      fontVariations: _serifAxes(600, 18),
      color: scheme.onSurface,
    ),
    // Sans for everything interactive — closer to system defaults so
    // form fields read as familiar rather than precious.
    titleLarge: ui.titleLarge?.copyWith(
      fontSize: 17,
      height: 1.3,
      fontWeight: FontWeight.w600,
      fontVariations: _wght(600),
      color: scheme.onSurface,
    ),
    titleMedium: ui.titleMedium?.copyWith(
      fontSize: 15,
      height: 1.4,
      fontWeight: FontWeight.w500,
      fontVariations: _wght(500),
      color: scheme.onSurface,
    ),
    titleSmall: ui.titleSmall?.copyWith(
      fontSize: 13,
      fontWeight: FontWeight.w500,
      fontVariations: _wght(500),
      color: scheme.onSurface,
    ),
    bodyLarge: ui.bodyLarge?.copyWith(
      fontSize: 15,
      height: 1.5,
      color: scheme.onSurface,
    ),
    bodyMedium: ui.bodyMedium?.copyWith(
      fontSize: 14,
      height: 1.45,
      color: scheme.onSurface,
    ),
    bodySmall: ui.bodySmall?.copyWith(
      fontSize: 12.5,
      height: 1.4,
      color: scheme.onSurfaceVariant,
    ),
    labelLarge: ui.labelLarge?.copyWith(
      fontSize: 13,
      height: 1.45,
      fontWeight: FontWeight.w600,
      fontVariations: _wght(600),
      letterSpacing: 0.1,
      color: scheme.onSurface,
    ),
    labelMedium: ui.labelMedium?.copyWith(
      fontSize: 12,
      height: 1.4,
      fontWeight: FontWeight.w500,
      fontVariations: _wght(500),
      color: scheme.onSurfaceVariant,
    ),
    labelSmall: ui.labelSmall?.copyWith(
      fontSize: 11,
      height: 1.45,
      fontWeight: FontWeight.w500,
      fontVariations: _wght(500),
      letterSpacing: 0.6,
      color: scheme.onSurfaceVariant,
    ),
  );
}

/// Mono money style — JetBrains Mono variable, tabular figures, color
/// inherits from the parent style or scheme.onSurface.
TextStyle moneyStyle(
  BuildContext context, {
  double size = 16,
  FontWeight weight = FontWeight.w600,
}) {
  final theme = Theme.of(context);
  return TextStyle(
    fontFamily: _mono,
    fontSize: size,
    height: 1.1,
    fontWeight: weight,
    fontVariations: _wght(weight.value),
    fontFeatures: const [FontFeature.tabularFigures()],
    color: theme.colorScheme.onSurface,
  );
}

/// Amber reserved for warnings / low-confidence states, kept distinct from the
/// income green so a "needs review" cue never reads as a positive/success one.
Color warningColor(ColorScheme cs) => cs.brightness == Brightness.light
    ? const Color(0xFFC77F3A)
    : const Color(0xFFE89F5C);

/// Used for editorial-feel section headers like "RECENT" and "BY CATEGORY".
TextStyle eyebrowStyle(BuildContext context, {double size = 11}) {
  final theme = Theme.of(context);
  return TextStyle(
    fontFamily: _sans,
    fontSize: size,
    height: 1.4,
    fontWeight: FontWeight.w600,
    fontVariations: _wght(600),
    letterSpacing: 1.6,
    color: theme.colorScheme.onSurfaceVariant,
  );
}
