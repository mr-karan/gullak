import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Editorial palette — warm off-white surface, charcoal text, kept teal
/// primary, burnt amber for income/positive moments, rose-clay for danger.
/// Tuned to read calm and expensive, not loud.
const Color _kSeedColor = Color(0xFF0A6E58);

class _Palette {
  // Light
  static const lightSurface = Color(0xFFFAF9F6);
  static const lightSurfaceDim = Color(0xFFEFEDE8);
  static const lightSurfaceContainer = Color(0xFFF2F0EB);
  static const lightSurfaceContainerHigh = Color(0xFFEAE7E0);
  static const lightSurfaceContainerHighest = Color(0xFFE2DED6);
  static const lightOnSurface = Color(0xFF1A1F1C);
  static const lightOnSurfaceVariant = Color(0xFF5A615C);
  static const lightOutline = Color(0xFFB7B5AE);
  static const lightOutlineVariant = Color(0xFFD4D2CB);

  static const lightPrimary = Color(0xFF0A6E58);
  static const lightOnPrimary = Color(0xFFFAF9F6);
  static const lightPrimaryContainer = Color(0xFFD7EFE6);
  static const lightOnPrimaryContainer = Color(0xFF033E30);

  static const lightAccent = Color(0xFFC77F3A); // burnt amber, income/+
  static const lightOnAccent = Color(0xFFFAF9F6);
  static const lightAccentContainer = Color(0xFFFAE7CE);
  static const lightOnAccentContainer = Color(0xFF6B3D14);

  static const lightDanger = Color(0xFFB23A48);
  static const lightOnDanger = Color(0xFFFAF9F6);
  static const lightDangerContainer = Color(0xFFF8DBDF);
  static const lightOnDangerContainer = Color(0xFF601420);

  // Dark — warmer than pure black, retains the editorial feel.
  static const darkSurface = Color(0xFF131614);
  static const darkSurfaceDim = Color(0xFF0E1110);
  static const darkSurfaceContainer = Color(0xFF1B1F1D);
  static const darkSurfaceContainerHigh = Color(0xFF222624);
  static const darkSurfaceContainerHighest = Color(0xFF2A2F2C);
  static const darkOnSurface = Color(0xFFE8E4DD);
  static const darkOnSurfaceVariant = Color(0xFFA9ADA6);
  static const darkOutline = Color(0xFF4C504C);
  static const darkOutlineVariant = Color(0xFF31352F);

  static const darkPrimary = Color(0xFF46C2A2);
  static const darkOnPrimary = Color(0xFF003225);
  static const darkPrimaryContainer = Color(0xFF0E5544);
  static const darkOnPrimaryContainer = Color(0xFFB6E8D6);

  static const darkAccent = Color(0xFFE89F5C);
  static const darkOnAccent = Color(0xFF3A1E03);
  static const darkAccentContainer = Color(0xFF6B3D14);
  static const darkOnAccentContainer = Color(0xFFFAE7CE);

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
      titleTextStyle: GoogleFonts.fraunces(
        fontSize: 22,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
        height: 1.2,
      ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surfaceContainer,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        // Hairline border replaces the missing shadow — gives surfaces
        // a defined edge in the bright warm-cream theme without making
        // them feel heavy.
        side: BorderSide(
          color: scheme.outlineVariant.withValues(alpha: 0.6),
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
        textStyle: GoogleFonts.inter(
          fontSize: 15,
          fontWeight: FontWeight.w600,
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
        textStyle: GoogleFonts.inter(
          fontSize: 14,
          fontWeight: FontWeight.w600,
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
      contentTextStyle: GoogleFonts.inter(
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
      labelStyle: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w500,
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
        return GoogleFonts.inter(
          fontSize: 11.5,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w600
              : FontWeight.w500,
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
  final display = GoogleFonts.frauncesTextTheme(base);
  final ui = GoogleFonts.interTextTheme(base);
  return base.copyWith(
    // Editorial display: serif, big, deliberate.
    displayLarge: display.displayLarge?.copyWith(
      fontSize: 40,
      height: 1.1,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      color: scheme.onSurface,
    ),
    displayMedium: display.displayMedium?.copyWith(
      fontSize: 32,
      height: 1.15,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.3,
      color: scheme.onSurface,
    ),
    headlineLarge: display.headlineLarge?.copyWith(
      fontSize: 26,
      height: 1.2,
      fontWeight: FontWeight.w600,
      color: scheme.onSurface,
    ),
    headlineMedium: display.headlineMedium?.copyWith(
      fontSize: 22,
      height: 1.25,
      fontWeight: FontWeight.w600,
      color: scheme.onSurface,
    ),
    headlineSmall: display.headlineSmall?.copyWith(
      fontSize: 18,
      height: 1.3,
      fontWeight: FontWeight.w600,
      color: scheme.onSurface,
    ),
    // Sans for everything interactive — closer to system defaults so
    // form fields read as familiar rather than precious.
    titleLarge: ui.titleLarge?.copyWith(
      fontSize: 17,
      height: 1.3,
      fontWeight: FontWeight.w600,
      color: scheme.onSurface,
    ),
    titleMedium: ui.titleMedium?.copyWith(
      fontSize: 15,
      height: 1.4,
      fontWeight: FontWeight.w500,
      color: scheme.onSurface,
    ),
    titleSmall: ui.titleSmall?.copyWith(
      fontSize: 13,
      fontWeight: FontWeight.w500,
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
      letterSpacing: 0.1,
      color: scheme.onSurface,
    ),
    labelMedium: ui.labelMedium?.copyWith(
      fontSize: 12,
      height: 1.4,
      fontWeight: FontWeight.w500,
      color: scheme.onSurfaceVariant,
    ),
    labelSmall: ui.labelSmall?.copyWith(
      fontSize: 11,
      height: 1.45,
      fontWeight: FontWeight.w500,
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
  return GoogleFonts.jetBrainsMono(
    fontSize: size,
    height: 1.1,
    fontWeight: weight,
    fontFeatures: const [FontFeature.tabularFigures()],
    color: theme.colorScheme.onSurface,
  );
}

/// Used for editorial-feel section headers like "RECENT" and "BY CATEGORY".
TextStyle eyebrowStyle(BuildContext context, {double size = 11}) {
  final theme = Theme.of(context);
  return GoogleFonts.inter(
    fontSize: size,
    height: 1.4,
    fontWeight: FontWeight.w600,
    letterSpacing: 1.6,
    color: theme.colorScheme.onSurfaceVariant,
  );
}
