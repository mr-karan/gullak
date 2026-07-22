/// Build identifiers injected at compile time via `--dart-define`.
/// Justfile's `apk` recipe wires git short-sha + a timestamp; running
/// from `flutter run` defaults to "dev" so you can tell at a glance.
const String buildSha = String.fromEnvironment(
  'GULLAK_BUILD_SHA',
  defaultValue: 'dev',
);

const String buildTimestamp = String.fromEnvironment(
  'GULLAK_BUILD_AT',
  defaultValue: 'dev',
);

/// Mirrors the pubspec.yaml `version:` line. Bump manually for
/// release notes; `buildSha` is what changes per commit.
const String buildVersion = '0.5.0+6';

String get buildLabel =>
    buildSha == 'dev' ? 'dev build' : '$buildVersion · $buildSha';
