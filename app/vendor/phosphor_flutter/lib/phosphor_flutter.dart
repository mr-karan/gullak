/// Vendored, trimmed copy of phosphor_flutter 2.1.0 (MIT — see LICENSE).
///
/// Why vendored: upstream 2.1.0 subclasses [IconData], which became a
/// `final class` in Flutter 3.44, so the pub package no longer compiles and
/// no fixed release exists. The generated constants here are rewritten to
/// plain `IconData(...)` (same codepoints, font family, and package), which
/// removes the subclass entirely. Why trimmed: Gullak only uses the Regular
/// style (see features/categories/category_visuals.dart), so this copy ships
/// one icon font instead of six and drops the duotone/widget machinery.
library phosphor_flutter;

export 'src/phosphor_icons_regular.dart';
