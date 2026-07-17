#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

device="${1:-}"
if [[ -z "$device" ]]; then
  device="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
fi

if [[ -z "$device" ]]; then
  echo "No Android device found. Connect Karan's Pixel with USB debugging enabled." >&2
  exit 1
fi

if [[ "$(adb -s "$device" shell getprop ro.kernel.qemu | tr -d '\r')" == "1" ]]; then
  echo "Refusing to run Pixel acceptance on an emulator: $device" >&2
  echo "Use scripts/android-smoke.sh for emulator validation." >&2
  exit 1
fi

package="dev.mrkaran.gullak"
log_file="${GULLAK_RUN_LOG:-/tmp/gullak-pixel.log}"
apk="build/app/outputs/flutter-apk/app-release.apk"
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}}"
aapt="$sdk_root/build-tools/35.0.0/aapt"
apksigner="$sdk_root/build-tools/35.0.0/apksigner"

model="$(adb -s "$device" shell getprop ro.product.model | tr -d '\r')"
android="$(adb -s "$device" shell getprop ro.build.version.release | tr -d '\r')"
echo "Target device: $device ($model, Android $android)"

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

for permission in \
  android.permission.READ_SMS \
  android.permission.RECEIVE_SMS \
  android.permission.POST_NOTIFICATIONS; do
  adb -s "$device" shell pm grant "$package" "$permission" >/dev/null 2>&1 || true
done

adb -s "$device" logcat -c
adb -s "$device" shell monkey -p "$package" 1 >/dev/null

echo "Release APK installed twice and launched. Complete these manual checks now:"
echo "  1. Quick Entry: run 50 round-trips across FAB, row edit, swipe edit/delete+undo, AI Type, payee/category/date pickers."
echo "  2. AI: configure endpoint/key and parse blinkit 450 hdfc, zomato 300 yesterday, salary 1.2L, uber 250 split with karan."
echo "  3. SMS: receive a real HDFC debit SMS and confirm it lands in Inbox within 90s; confirm creates the right transaction."
read -r -p "Press Enter after the manual Pixel checks are done; logs will be captured to $log_file..."

adb -s "$device" logcat -d > "$log_file"
if grep -E "EXCEPTION|Another exception|RenderFlex|assertion" "$log_file"; then
  echo "Found Flutter error markers in $log_file" >&2
  exit 1
fi

echo "Pixel acceptance log captured without Flutter error markers: $log_file"
