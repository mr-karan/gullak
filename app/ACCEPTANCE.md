# Gullak Acceptance Checklist

Run before shipping a release APK. These gates exist because emulator-only or
analyze-only smoke missed real Android pitfalls in the past.

## Local Gates

```bash
cd app
scripts/pre-commit.sh
flutter build apk --release
```

Expected:

- `dart format --set-exit-if-changed lib test` reports no changes.
- `flutter analyze` has no issues.
- `flutter test` is green.
- `build/app/outputs/flutter-apk/app-release.apk` is produced.

## Android Emulator Smoke

```bash
just android-smoke
```

Expected:

- Release APK signature matches `CN=Gullak Dev, O=Gullak, C=IN`.
- Release APK manifest contains SMS, notification, and SMS receiver markers.
- Release APK installs twice on the same Android target.
- Integration test `integration_test/happy_path_test.dart` passes.
- `/tmp/gullak-run.log` has no `EXCEPTION`, `Another exception`, `RenderFlex`, or `assertion`.

## Live AI Acceptance

Defaults to OpenRouter + `google/gemini-3-flash-preview` (matches the homelab
pi-server config); only the API key needs to be supplied. Override
`AI_BASE_URL` / `AI_MODEL` to test a different provider.

```bash
AI_API_KEY=$OPENROUTER_API_KEY just ai-acceptance
```

Expected:

- `blinkit 450 hdfc` resolves amount, HDFC account, and Blinkit payee.
- `zomato 300 yesterday` resolves amount, Zomato payee, and yesterday's date.
- `salary 1.2L` resolves income amount and Salary category.
- `uber 250 split with karan` resolves amount, Uber payee, Transport category, and split note.

## Pixel Acceptance

Connect Karan's Pixel with USB debugging enabled, then run:

```bash
just pixel-acceptance
```

Expected:

- The script refuses emulators.
- Release APK installs twice and launches.
- Manual Quick Entry pass: 50 round-trips across FAB create, row tap edit, swipe edit, swipe delete + undo, AI Type, edit hydration, payee picker with keyboard, category picker, date picker, picker-back-save.
- Manual AI pass: the four live AI acceptance phrases above work inside the app without manual tweaking.
- Manual SMS pass: a real HDFC debit SMS lands in Inbox within 90 seconds; confirming it creates a transaction on the right account.
- `/tmp/gullak-pixel.log` has no `EXCEPTION`, `Another exception`, `RenderFlex`, or `assertion`.

Do not ship the release APK until all sections above pass on real evidence.
