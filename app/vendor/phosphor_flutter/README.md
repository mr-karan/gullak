# Vendored phosphor_flutter (patched, trimmed)

- **Upstream:** phosphor_flutter 2.1.0 from pub.dev
  (https://pub.dev/packages/phosphor_flutter), itself packaging
  https://github.com/phosphor-icons — MIT (see LICENSE).
- **Why vendored:** upstream subclasses `IconData`, which became a
  `final class` in Flutter 3.44; the pub release no longer compiles and no
  fixed release exists.
- **Modifications from upstream:**
  1. `lib/src/phosphor_icon_data.dart` deleted; the generated constants in
     `lib/src/phosphor_icons_regular.dart` were mechanically rewritten from
     `PhosphorFlatIconData(0x…, 'Regular')` to plain
     `IconData(0x…, fontFamily: 'PhosphorRegular', fontPackage:
     'phosphor_flutter', matchTextDirection: true)` — same codepoints, same
     font, no subclassing.
  2. Trimmed to the **Regular** style only (the app's single style — see
     `features/categories/category_visuals.dart`): one font file
     (`lib/fonts/Phosphor.ttf`, unmodified from upstream) instead of six, and
     the duotone/widget machinery dropped.
- **Updating:** if upstream ships a Flutter-3.44-compatible release, delete
  this directory and restore the pub dependency; otherwise re-apply the
  constant rewrite (a one-line perl over the regenerated file — see git
  history of this directory).
