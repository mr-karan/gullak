#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

device="${1:-}"
if [[ -z "$device" ]]; then
  device="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
fi

if [[ -z "$device" ]]; then
  echo "No Android device found. Connect a Pixel or start an emulator." >&2
  exit 1
fi

log_file="${GULLAK_RUN_LOG:-/tmp/gullak-run.log}"
apk="build/app/outputs/flutter-apk/app-release.apk"
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}}"
aapt="$sdk_root/build-tools/35.0.0/aapt"
apksigner="$sdk_root/build-tools/35.0.0/apksigner"

flutter build apk --release
if [[ -x "$apksigner" ]]; then
  signer="$("$apksigner" verify --verbose --print-certs "$apk")"
  for marker in \
    "Verifies" \
    "Verified using v2 scheme (APK Signature Scheme v2): true" \
    "Signer #1 certificate DN: CN=Gullak Dev, O=Gullak, C=IN"; do
    if [[ "$signer" != *"$marker"* ]]; then
      echo "Release APK signature check failed; missing marker: $marker" >&2
      exit 1
    fi
  done
else
  echo "Skipping APK signature assertions; apksigner not found at $apksigner" >&2
fi
if [[ -x "$aapt" ]]; then
  manifest="$("$aapt" dump xmltree "$apk" AndroidManifest.xml)"
  for marker in \
    "android.permission.READ_SMS" \
    "android.permission.RECEIVE_SMS" \
    "android.permission.POST_NOTIFICATIONS" \
    "com.shounakmulay.telephony.sms.IncomingSmsReceiver" \
    "android.provider.Telephony.SMS_RECEIVED"; do
    if [[ "$manifest" != *"$marker"* ]]; then
      echo "Release APK is missing Android manifest marker: $marker" >&2
      exit 1
    fi
  done
else
  echo "Skipping APK manifest assertions; aapt not found at $aapt" >&2
fi
adb -s "$device" install -r "$apk"
adb -s "$device" install -r "$apk"
adb -s "$device" uninstall dev.mrkaran.gullak >/dev/null || true

adb -s "$device" logcat -c
flutter test integration_test/ -d "$device"
adb -s "$device" logcat -d > "$log_file"

if grep -E "EXCEPTION|Another exception|RenderFlex|assertion" "$log_file"; then
  echo "Found Flutter error markers in $log_file" >&2
  exit 1
fi

echo "Android smoke passed for $device; log: $log_file"
