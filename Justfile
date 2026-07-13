set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

app-dir := "app"
dist-dir := "app/dist"
package := "dev.mrkaran.chavanni"
apk-out := "app/build/app/outputs/flutter-apk/app-release.apk"
aab-out := "app/build/app/outputs/bundle/release/app-release.aab"
ipa-out := "app/build/ios/ipa"

# Default: list recipes.
default:
    @just --list

# Format Dart sources.
format:
    cd {{app-dir}} && dart format lib test

# Static analysis. Must be clean before commit.
analyze:
    cd {{app-dir}} && flutter analyze

# Unit + widget tests.
test:
    cd {{app-dir}} && flutter test

# Format-check + analyze + test. Mirrors scripts/pre-commit.sh.
gate:
    cd {{app-dir}} && scripts/pre-commit.sh

# Build a release APK and copy it to {{dist-dir}}/ with a sha+timestamp
# filename, plus a `chavanni-latest.apk` symlink. Prints the artifact path.
# Stamps the build with --dart-define so Settings → About can show
# exactly which commit you're running.
#
# Pass `debuggable=true` to build a release APK with android:debuggable
# flipped on, so `adb shell run-as dev.mrkaran.chavanni` works for ad-hoc
# database pulls without flutter run / a separate debug build.
apk debuggable="false":
    set -eu; \
      sha="$(git rev-parse --short HEAD)"; \
      ts="$(date +%Y%m%d-%H%M%S)"; \
      cd {{app-dir}} && CHAVANNI_DEBUGGABLE={{debuggable}} flutter build apk --release \
        --dart-define="CHAVANNI_BUILD_SHA=$sha" \
        --dart-define="CHAVANNI_BUILD_AT=$ts"
    mkdir -p {{dist-dir}}
    set -eu; \
      sha="$(git rev-parse --short HEAD)"; \
      ts="$(date +%Y%m%d-%H%M%S)"; \
      out="{{dist-dir}}/chavanni-${sha}-${ts}.apk"; \
      cp {{apk-out}} "$out"; \
      ln -sfn "$(basename "$out")" {{dist-dir}}/chavanni-latest.apk; \
      ls -lh "$out" {{dist-dir}}/chavanni-latest.apk

# Hot-reload dev loop on the connected Android device. Far faster
# than `just install` for iterating on UI / logic — saves 60s per
# round-trip and you get stack traces straight in the terminal.
run:
    cd {{app-dir}} && flutter run --device-id=$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')

# Build the APK and install on the first connected Android device.
# Pass `debuggable=true` to install a debuggable release build for
# `adb shell run-as` access (see `apk` recipe).
install debuggable="false": (apk debuggable)
    adb install -r {{dist-dir}}/chavanni-latest.apk

# Build a release AAB (Android App Bundle) for Play Console uploads —
# Internal App Sharing, Internal Testing, or eventual Production. Same
# signing key as `apk`; same dart-define stamps.
aab:
    set -eu; \
      sha="$(git rev-parse --short HEAD)"; \
      ts="$(date +%Y%m%d-%H%M%S)"; \
      cd {{app-dir}} && flutter build appbundle --release \
        --dart-define="CHAVANNI_BUILD_SHA=$sha" \
        --dart-define="CHAVANNI_BUILD_AT=$ts"
    mkdir -p {{dist-dir}}
    set -eu; \
      sha="$(git rev-parse --short HEAD)"; \
      ts="$(date +%Y%m%d-%H%M%S)"; \
      out="{{dist-dir}}/chavanni-${sha}-${ts}.aab"; \
      cp {{aab-out}} "$out"; \
      ln -sfn "$(basename "$out")" {{dist-dir}}/chavanni-latest.aab; \
      ls -lh "$out" {{dist-dir}}/chavanni-latest.aab

# Wipe app data on the connected device. Forces re-onboarding next launch.
clear-data:
    adb shell pm clear {{package}}

# Launch the installed app via monkey (no extras needed).
launch:
    adb shell monkey -p {{package}} -c android.intent.category.LAUNCHER 1

# Tail logcat filtered to the app's pid.
logcat:
    set -eu; \
      pid="$(adb shell pidof {{package}} | tr -d '\r')"; \
      if [ -z "$pid" ]; then echo "App not running. Run 'just launch' first." >&2; exit 1; fi; \
      adb logcat -v time --pid="$pid"

# List connected Android devices.
devices:
    adb devices -l

# Drop Flutter build artifacts (does not touch dist/).
clean:
    cd {{app-dir}} && flutter clean

# Bump the build number in pubspec.yaml (after the +). TestFlight
# rejects re-uploads of the same build number, so call this before
# every `just testflight`.
bump-build:
    set -eu; \
      cur="$(awk -F'+' '/^version:/{print $2}' {{app-dir}}/pubspec.yaml)"; \
      next=$((cur + 1)); \
      sed -i '' "s/^version: \\(.*\\)+${cur}\$/version: \\1+${next}/" {{app-dir}}/pubspec.yaml; \
      grep '^version:' {{app-dir}}/pubspec.yaml

# Wipe build artifacts AND dist/.
distclean: clean
    rm -rf {{dist-dir}}

android-smoke:
    cd {{app-dir}} && scripts/android-smoke.sh

pixel-acceptance:
    cd {{app-dir}} && scripts/pixel-acceptance.sh

# Live AI acceptance against the configured provider. Defaults to
# OpenRouter + google/gemini-3-flash-preview; only AI_API_KEY (or
# OPENROUTER_API_KEY) is required.
ai-acceptance:
    cd {{app-dir}} && scripts/ai-acceptance.sh

# Build a release IPA for App Store distribution and copy to dist/.
# Requires Xcode signing set up (open Runner.xcworkspace, pick your
# Apple Dev team under Signing & Capabilities once).
ipa:
    cd {{app-dir}} && flutter build ipa --release --export-method=app-store
    mkdir -p {{dist-dir}}
    set -eu; \
      sha="$(git rev-parse --short HEAD)"; \
      ts="$(date +%Y%m%d-%H%M%S)"; \
      src="$(ls -t {{ipa-out}}/*.ipa | head -1)"; \
      out="{{dist-dir}}/chavanni-${sha}-${ts}.ipa"; \
      cp "$src" "$out"; \
      ln -sfn "$(basename "$out")" {{dist-dir}}/chavanni-latest.ipa; \
      ls -lh "$out" {{dist-dir}}/chavanni-latest.ipa

# Upload the latest IPA to TestFlight via App Store Connect API.
# Needs APP_STORE_CONNECT_API_KEY_ID + APP_STORE_CONNECT_API_ISSUER_ID
# in env, and the corresponding .p8 file at
# ~/.appstoreconnect/private_keys/AuthKey_<id>.p8 (Apple's required path).
testflight: ipa
    set -eu; \
      : "${APP_STORE_CONNECT_API_KEY_ID:?set APP_STORE_CONNECT_API_KEY_ID in env}"; \
      : "${APP_STORE_CONNECT_API_ISSUER_ID:?set APP_STORE_CONNECT_API_ISSUER_ID in env}"; \
      xcrun altool --upload-app -f {{dist-dir}}/chavanni-latest.ipa --type ios \
        --apiKey "$APP_STORE_CONNECT_API_KEY_ID" \
        --apiIssuer "$APP_STORE_CONNECT_API_ISSUER_ID"
