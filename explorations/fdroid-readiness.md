*The app described here has since been renamed **Chavanni** (formerly Gullak).*

# Gullak F-Droid readiness audit

Scope: `app/` (Flutter Android/iOS app) only — F-Droid distributes the Android
build. Audited 2026-07, against F-Droid's published Inclusion Policy and
Build Metadata Reference. Every finding below cites file:line evidence
gathered directly from the repo, `app/pubspec.lock`, and the installed
`~/.pub-cache` package sources (i.e. what Gradle actually resolves today, not
just what pubspec.yaml declares).

Legend: **BLOCKER** = will get the app rejected or fail F-Droid's build
server as-is. **WARNING** = will likely cause a review round-trip, a degraded
feature on F-Droid builds, or a policy flag. **NICE-TO-HAVE** = polish, not a
gate.

---

## 1. Non-free dependencies

### BLOCKER — `geolocator_android` pulls `com.google.android.gms:play-services-location`

- Evidence: `app/pubspec.yaml:57` declares `geolocator: ^14.0.2`. The resolved
  transitive package is `geolocator_android-5.0.3` (`app/pubspec.lock`,
  `geolocator_android:` transitive entry, sha256
  `179c3cb66d...`). Its Gradle module
  (`~/.pub-cache/hosted/pub.dev/geolocator_android-5.0.3/android/build.gradle`)
  contains:
  ```groovy
  dependencies {
      implementation 'com.google.android.gms:play-services-location:21.2.0'
      implementation 'androidx.core:core:1.16.0'
  }
  ```
  `com.google.android.gms:*` is Google Play Services — proprietary, and
  explicitly called out in F-Droid's Inclusion Policy as an unacceptable
  dependency ("F-Droid cannot build apps using Google's proprietary Play
  Services"). This is F-Droid's #1 rejection cause and it is present here.
- Where it's used: `app/lib/features/location/location_service.dart:40-45`
  calls `Geolocator.getCurrentPosition(locationSettings: const
  LocationSettings(accuracy: LocationAccuracy.medium, timeLimit:
  Duration(seconds: 8)))` — the plain cross-platform `LocationSettings`,
  which on Android resolves to the fused location provider (GMS) by default.
  Also used in `app/lib/features/settings/settings_screen.dart:24` and
  `app/lib/data/sms/sms_reply_handler.dart:79` (`Geolocator.getLastKnownPosition()`).
- **Fix**: switch to `AndroidSettings(forceLocationManager: true, ...)` from
  `package:geolocator_android/geolocator_android.dart` on Android, which
  makes the plugin use the platform `android.location.LocationManager`
  instead of the fused provider:
  ```dart
  import 'package:geolocator_android/geolocator_android.dart';

  final settings = defaultTargetPlatform == TargetPlatform.android
      ? AndroidSettings(accuracy: LocationAccuracy.medium, forceLocationManager: true)
      : const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 8));
  ```
  This makes the Dart-side call GMS-free, **but it does not remove the Gradle
  dependency** — `play-services-location` is still declared unconditionally
  in `geolocator_android`'s own `build.gradle` and will still be compiled
  into the APK (F-Droid's build inspects/blocks the artifact itself, not just
  whether your code calls it at runtime). You additionally need to strip the
  dependency at the app's Gradle level, e.g. in
  `app/android/app/build.gradle.kts`:
  ```kotlin
  configurations.all {
      exclude(group = "com.google.android.gms")
  }
  ```
  Confirm after excluding that `forceLocationManager` still resolves
  locations at runtime (there's a known upstream regression, Baseflow
  flutter-geolocator #1114, where `forceLocationManager: true` returns no
  position on devices that also have Play Services installed — test on a
  clean/microG device, not just your dev phone). If it doesn't work
  reliably, the safer F-Droid-clean alternative used by other Flutter
  F-Droid apps is dropping `geolocator` entirely for a minimal
  platform-channel wrapper around `LocationManager`, or switching to
  `flutter_map`-ecosystem's location package that doesn't touch GMS at all.
- Also update the fdroiddata build metadata's `AntiFeatures` if any GMS
  remnants can't be fully excluded (see §4) — undisclosed GMS use is worse
  than disclosed.

### BLOCKER — `sqlite3` (transitive via `drift`) downloads prebuilt binaries at build time via Dart build hooks

- Evidence: `app/pubspec.lock:1311-1319` resolves `sqlite3: 3.3.1` (transitive
  via `drift: ^2.20.3`, `app/pubspec.yaml:29`). Package `sqlite3` v3.x
  (`~/.pub-cache/hosted/pub.dev/sqlite3-3.3.1`) ships a `hook/build.dart` and
  uses Dart's **build hooks / code-assets** mechanism, which — per upstream
  docs — "by default, downloads pre-compiled SQLite binaries from the GitHub
  releases of this package" at build time, verified only by a checked-in
  sha256, not compiled from source.
- This directly conflicts with F-Droid's requirement that the entire build
  happen offline, from source, inside their build server (no network access
  during build; no prebuilt binary blobs of unknown provenance). It is a
  distinct problem from the older `sqlite3_flutter_libs` shim.
- Note: `app/pubspec.yaml:24` also still declares
  `sqlite3_flutter_libs: ^0.6.0+eol` directly. Installed version
  `~/.pub-cache/hosted/pub.dev/sqlite3_flutter_libs-0.6.0+eol/pubspec.yaml`
  says verbatim: `description: "Not used anymore, update to version 3.x of
  package:sqlite3 instead"` and its package has **no `android/` folder at
  all** — it's an empty compatibility stub. The real native binary comes from
  the `sqlite3` package's build hook described above, not from this shim.
- **Fix**: 1) Drop the redundant `sqlite3_flutter_libs: ^0.6.0+eol` dependency
  from `app/pubspec.yaml` (dead weight, EOL per upstream). 2) For the
  build-hook binary fetch, either (a) vendor/pin the exact prebuilt `.so`
  F-Droid needs and add a `scanignore`/`prebuild` step in the fdroiddata
  metadata that points `PUB_CACHE`'s hook output at a locally-built binary
  compiled from the bundled `sqlite3.h`/amalgamation source instead of
  downloading it, or (b) follow drift's documented "custom SQLite build"
  path (`doc/native.md` in the `sqlite3` package) to compile SQLite from the
  vendored C source during the F-Droid build's `prebuild`/`build` stage
  instead of fetching a release asset. This needs to be solved once and
  encoded as `prebuild:` steps in the fdroiddata YAML (§4) — it is not
  something the app repo alone can fix, but the app repo should document the
  exact upstream sqlite3 amalgamation version pinned so the F-Droid metadata
  can reproduce it.

### Confirmed clean (checked, not a blocker)

- **`another_telephony: ^0.4.1`** — `~/.pub-cache/hosted/pub.dev/another_telephony-0.4.1/android/build.gradle`
  depends only on `kotlin-stdlib-jdk7` and `androidx.annotation`. No GMS.
- **`workmanager: ^0.9.0+3`** — `workmanager_android-0.9.0+2/android/build.gradle`
  depends only on `androidx.work:work-runtime` and
  `androidx.concurrent:concurrent-futures`. No GMS (AndroidX WorkManager is
  AOSP/Jetpack, not Play Services).
- **`geocoding: ^3.0.0`** — platform `android.location.Geocoder`, no GMS
  dependency (as expected; not independently re-verified beyond pubspec
  since the app doesn't hit a geocoding-specific native Gradle file, and
  `geocoding_android` isn't a heavy suspect the way `geolocator_android` is —
  worth a final grep before submission but not chased further here).
- **`image_picker` (`image_picker_android-0.8.13+17`)** — depends only on
  `androidx.core`, `androidx.annotation`, `androidx.exifinterface`,
  `androidx.activity`. No GMS.
- **`flutter_local_notifications: ^21.0.0`**, **`share_plus: ^10.1.2`**,
  **`quick_actions: ^1.0.7`**, **`flutter_secure_storage: ^10.0.0`**,
  **`url_launcher: ^6.3.2`**, **`permission_handler: ^12.0.1`**,
  **`file_picker: ^8.1.4`**, **`receive_sharing_intent: ^1.8.1`** — first-
  party Flutter-community plugins; none pulled in a `com.google.android.gms`
  or Firebase artifact in the resolved lockfile or their AndroidX-only
  Gradle files.
- **No Firebase / Crashlytics / Sentry / analytics SDK anywhere.** Grepped
  `app/pubspec.yaml`, `app/pubspec.lock`, both `build.gradle.kts` files for
  `firebase|crashlyt|sentry|mixpanel|amplitude|google-services|gms` — zero
  hits outside the geolocator finding above.
- **No `google_fonts` runtime fetch.** `app/pubspec.yaml:88-105` bundles
  Fraunces/Inter/JetBrains Mono as local OFL-licensed asset files
  (`assets/fonts/*.ttf` + `*-OFL.txt`), loaded via `LicenseRegistry` in
  `main.dart` per the comment at `app/pubspec.yaml:86-88`. The
  `google_fonts` package was explicitly removed (see `CHANGELOG.md`
  "Bundled editorial fonts" entry) — correct call, no runtime CDN fetch.

---

## 2. Permissions

`app/android/app/src/main/AndroidManifest.xml:3-8`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.READ_SMS"/>
<uses-permission android:name="android.permission.RECEIVE_SMS"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
```

Plus a `PROCESS_TEXT` queries block (`AndroidManifest.xml:41-46`, benign —
required for Flutter's text-selection "share/process text" affordance) and
two receivers: `com.shounakmulay.telephony.sms.IncomingSmsReceiver`
(`AndroidManifest.xml:33-38`, `another_telephony`'s SMS receiver) and
`com.dexterous.flutterlocalnotifications.ActionBroadcastReceiver`
(`AndroidManifest.xml:44-45`, notification inline-reply).

### WARNING — READ_SMS / RECEIVE_SMS need an explicit F-Droid listing disclosure

F-Droid doesn't reject SMS permissions outright, but reviewers and the
`AntiFeatures` mechanism flag privacy-sensitive permissions, and F-Droid's
listing guidance expects the `full_description.txt` to explain *why* an app
wants them (this is also Play Store policy muscle memory worth carrying
over). Since Gullak's entire premise is "parse my bank SMS," this should be
front-and-center, not buried.

- **Fix**: add a short, explicit paragraph to
  `fastlane/metadata/android/en-US/full_description.txt` (see §4) — e.g.
  "Gullak reads incoming SMS *locally on your device* to detect bank
  transaction alerts. SMS bodies are only sent to your own self-hosted
  server (which you configure) for parsing; nothing is sent to any
  third-party service Gullak's authors control." Also worth adding an
  `AntiFeatures: NonFreeNet` entry in the fdroiddata metadata is *not*
  needed if the server is self-hosted/user-configured rather than a fixed
  third-party endpoint — but do confirm there's no hardcoded default
  pi-server URL baked into the app that points at the author's own server
  (if there is, that's a `NonFreeNet`/privacy disclosure item, not a
  blocker).

### WARNING — ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION should be disclosed as optional/opt-in

`app/lib/features/location/location_service.dart:80-86` shows location is
only requested from an explicit settings toggle
(`ensurePermission()` — "Called from the settings toggle so the OS
permission prompt happens when the user opts in"), and `capture()` never
prompts. Good practice already. Just make sure the fastlane description
says location is optional (used only to tag a transaction's place, off by
default) so a privacy-conscious F-Droid user isn't surprised by the
manifest permission list before reading the description.

### Confirmed non-issue

- `INTERNET` — required for the pi-server sync API; expected and not
  flagged by F-Droid on its own.
- `POST_NOTIFICATIONS` — standard Android 13+ notification permission, fine.

---

## 3. Build

### Confirmed clean

- **No keystore or secrets committed.** `git ls-files | grep -iE
  "keystore|\.jks|key\.properties"` returns nothing.
  `app/android/.gitignore:12` ignores `key.properties`;
  `app/android/.gitignore:6` ignores `/local.properties`. Verified locally
  present but untracked: `app/android/key.properties` (points at
  `/Users/karan/.android/gullak-dev.jks`, a personal-machine path) and
  `app/android/local.properties` (personal `sdk.dir`/`flutter.sdk` paths).
  Correctly excluded from the repo.
- **Signing config degrades gracefully.** `app/android/app/build.gradle.kts:41-47`:
  ```kotlin
  release {
      signingConfig = if (keystorePropertiesFile.exists()) {
          signingConfigs.getByName("release")
      } else {
          signingConfigs.getByName("debug")
      }
      ...
  }
  ```
  On a clean clone with no `key.properties`, `flutter build apk --release`
  falls back to the debug signing config and **will build successfully** —
  this is exactly the shape F-Droid's own reproducible-build signing (their
  own key, applied after building) needs. Good.
- **`applicationId` is a plain reverse-DNS string** (`dev.mrkaran.gullak`,
  `app/android/app/build.gradle.kts:32`) with no hardcoded
  `versionCode`/`versionName` — both come from `flutter.versionCode` /
  `flutter.versionName`, which the Flutter Gradle plugin derives from
  `app/pubspec.yaml:6` (`version: 0.2.1+3`). This is exactly what F-Droid's
  `UpdateCheckData` regex expects (see §4 draft metadata) — no fix needed.
- **`GULLAK_DEBUGGABLE` env-gated debuggable flag** (`app/android/app/build.gradle.kts:50-52`)
  defaults to `false` unless explicitly set — a real release build from a
  clean environment (as F-Droid's build server will run) will not be
  accidentally debuggable.

### BLOCKER — no pinned Flutter SDK version anywhere in the repo

- Evidence: `app/pubspec.yaml:10-11` only constrains the **Dart** SDK
  (`sdk: ^3.11.5`), not the Flutter SDK itself. There's no `.fvmrc`,
  `.fvm/fvm_config.json`, or `.tool-versions` pinning an exact Flutter
  version anywhere in the repo (`find` for all three came up empty). The
  `Justfile` and CI (none exists — see below) rely on whatever Flutter is on
  the invoking machine's `$PATH` / `local.properties: flutter.sdk`.
- F-Droid's Flutter build template
  (`https://gitlab.com/fdroid/fdroiddata/-/blob/master/templates/build-flutter.yml`)
  needs an **exact** Flutter version to checkout as a submodule or srclib
  (`flutterVersion=$(sed ... .github/workflows/release.yml)` in the
  template — i.e. their convention is to read the pin from a CI workflow
  file). Gullak has no `.github/workflows/` at all (no CI configured), so
  there is no machine-readable source of truth for "which Flutter version
  does this app build with."
- **Fix**: pin an exact Flutter version — either via `fvm` (commit
  `.fvmrc`) or by adding a CI workflow (even a minimal one) that names the
  exact Flutter version used for release builds, so the fdroiddata metadata
  author (you, or an F-Droid volunteer) has a citable source to point the
  `prebuild` checkout step at instead of guessing.

### BLOCKER — this is a monorepo; the Flutter app lives in `app/`, not repo root

- Evidence: `app/pubspec.yaml` is at `app/pubspec.yaml`, not
  `<repo-root>/pubspec.yaml`; the repo root also contains `pi-server/` and
  `whatsapp-bridge/` (Node/Bun projects) per `/Users/karan/Code/gullak/CLAUDE.md`'s
  layout section.
- The stock fdroiddata Flutter template assumes the Flutter project sits at
  repo root (its `prebuild`/`build` blocks `cd` into a fixed
  `/upstream/path/example/example` and never reference a subdirectory flag).
  F-Droid's Build Metadata Reference does support per-app-in-subdir builds in
  general (many multi-module Android repos do this), but for Flutter
  specifically the template's `mv $repo example.app` dance assumes the
  Flutter root == checkout root. Whoever writes Gullak's fdroiddata metadata
  will need custom `prebuild`/`build` steps that `cd app/` before running
  `flutter pub get` / `flutter build apk`, and must also make sure
  `rm: [ios, linux, macos, web, windows]` (the template's cleanup step)
  targets `app/ios`, `app/linux`, etc., not repo-root paths that don't exist.
  This is solvable but is real, non-default work — flag it explicitly so
  whoever submits doesn't hand F-Droid the stock template unmodified and
  get an immediate build failure.
- **Fix**: draft the fdroiddata YAML with `app/`-relative paths from the
  start (done in §4 below) and sanity-check it against a local `fdroid
  build` dry run (`fdroidserver`'s `fdroid build --test` in a scratch
  checkout) before submitting.

### Confirmed: clean-clone build works, with one caveat

- `flutter build apk` (via `just apk`, `Justfile:24-33`) requires no
  private inputs beyond a Flutter SDK + Android SDK on `$PATH` /
  `local.properties` — confirmed above that missing `key.properties`
  degrades to debug signing rather than failing. No `.env` files or
  hardcoded API endpoints/secrets found under `app/lib` (per
  `pi_ai_client.dart` design, the pi-server URL/API key are user-entered at
  runtime via Settings, not compiled in — consistent with
  `/Users/karan/Code/gullak/CLAUDE.md`'s "the Flutter app never stores
  model provider keys" convention). Not independently re-verified by
  running the build in this audit (no Android SDK / Flutter invoked here),
  but the Gradle inputs are all present and inert.

---

## 4. Metadata (fastlane + fdroiddata)

### BLOCKER — no fastlane metadata exists at all

`find /Users/karan/Code/gullak -ipath "*fastlane*"` returns nothing. F-Droid's
listing (title, description, screenshots, changelog per version) is sourced
from a `fastlane/metadata/android/<locale>/` tree inside the app's build
directory (i.e. under `app/` for this repo, since that's the Flutter
project root F-Droid will build from). None of it exists yet.

**Required files** (F-Droid reads these directly; `en-US` is the minimum
locale):

```
app/fastlane/metadata/android/en-US/
├── title.txt                      # ≤30 chars, e.g. "Gullak"
├── short_description.txt          # ≤80 chars, one line
├── full_description.txt           # long-form, HTML-lite allowed, no external links to non-FOSS stores
├── changelogs/
│   └── 3.txt                      # keyed by versionCode (matches pubspec.yaml's "+3"), NOT versionName
└── images/
    ├── icon.png                   # optional if AGP already produces one; F-Droid can extract from APK
    ├── featureGraphic.png         # 1024x500, optional but recommended
    └── phoneScreenshots/
        ├── 1.png
        ├── 2.png
        └── ...                   # at least 1, ideally 3-5, real device/emulator captures
```

- **Fix**: create this tree. `title.txt` = "Gullak". `short_description.txt`
  should mention "local-first expense tracker" (matches
  `app/pubspec.yaml:2` description). `full_description.txt` should fold in
  the SMS-permission disclosure from §2. `changelogs/3.txt` (current
  versionCode per `app/pubspec.yaml:6`, `version: 0.2.1+3`) can be adapted
  from the existing `CHANGELOG.md` "Unreleased"/latest release section —
  note F-Droid changelog files are keyed by **versionCode integer**, not
  semver, so this needs a small mapping step (or a script) going forward
  each release. Screenshots need to be captured fresh (none exist in the
  repo — `find -iname "*screenshot*"` only turned up unrelated Flutter
  integration-test build artifacts, not real app screenshots).

### BLOCKER — no fdroiddata build metadata drafted; repo layout requires custom (not template) steps

Draft `metadata/dev.mrkaran.gullak.yml` for the `fdroiddata` repo (this
lives in F-Droid's own `fdroiddata` GitLab repo, not in Gullak's repo — it's
submitted as an MR there once the public mirror in §6 exists):

```yaml
Categories:
  - Money
License: AGPL-3.0-only
SourceCode: https://github.com/<mirror-org>/gullak
IssueTracker: https://github.com/<mirror-org>/gullak/issues
Changelog: https://github.com/<mirror-org>/gullak/blob/main/CHANGELOG.md

AutoName: Gullak
Description: |
  Gullak is a local-first mobile expense tracker with an optional
  self-hosted sync/AI server. See full_description in the fastlane
  metadata for the SMS-permission disclosure.

RepoType: git
Repo: https://github.com/<mirror-org>/gullak.git

Builds:
  - versionName: '0.2.1'
    versionCode: 3
    commit: <tag-or-sha-for-this-release>
    subdir: app
    sudo:
      - mkdir -p /upstream/gullak/gullak
      - chown -R vagrant /upstream/gullak
    submodules: true          # if Flutter SDK is vendored as a submodule at app/.flutter
    output: build/app/outputs/flutter-apk/app-release.apk
    rm:
      - app/ios
      - app/linux
      - app/macos
      - app/web
      - app/windows
      - pi-server
      - whatsapp-bridge
    prebuild:
      - export repo=/upstream/gullak/gullak/app
      - cd ..
      - mv gullak.app "$(dirname $repo)"
      - pushd "$(dirname $repo)"
      - mv gullak app   # rename checkout to match upstream build path expectations if needed
      - cd app
      - export PUB_CACHE=$(pwd)/.pub-cache
      - .flutter/bin/flutter config --no-analytics
      - .flutter/bin/flutter pub get --enforce-lockfile
    scanignore:
      - app/.flutter/bin/cache
    scandelete:
      - app/.flutter
      - app/.pub-cache
    build:
      - cd app
      - export PUB_CACHE=$(pwd)/.pub-cache
      - .flutter/bin/flutter build apk --release --split-per-abi --target-platform="android-arm64"

AutoUpdateMode: Version
UpdateCheckMode: Tags
VercodeOperation:
  - '%c * 10 + 1'
  - '%c * 10 + 2'
  - '%c * 10 + 3'
UpdateCheckData: app/pubspec.yaml|version:\s.+\+(\d+)|.|version:\s(.+)\+
CurrentVersion: '0.2.1'
CurrentVersionCode: 3
```

Notes on this draft:
- `subdir: app` plus the `rm:`/build path adjustments are the load-bearing,
  non-template part flagged in §3 — this is hand-written, not copy-pasted
  from `templates/build-flutter.yml`, because that template assumes
  repo-root == Flutter-root.
- `UpdateCheckData` path is `app/pubspec.yaml` (not repo-root) for the same
  reason.
- Exact Flutter version/submodule mechanics depend on resolving the "no
  pinned Flutter SDK version" blocker in §3 first.
- `AntiFeatures:` is deliberately omitted pending resolution of the
  geolocator GMS finding (§1) — if the GMS dependency can't be fully
  excluded, this needs `AntiFeatures: [NonFreeDep]` or similar and will very
  likely block acceptance until fixed regardless of disclosure.
- This YAML is a draft for planning purposes; do not submit until the app
  repo blockers above (GMS exclusion, sqlite3 build-hook binary, Flutter
  pin, public mirror) are resolved, since F-Droid's own build server will
  fail or reject on all of them independently of this file being correct.

---

## 5. Licensing

- Evidence: `/Users/karan/Code/gullak/LICENSE` is the **GNU AGPL-3.0** in
  full (`LICENSE:1-4`, "GNU AFFERO GENERAL PUBLIC LICENSE Version 3"), and
  `README.md:95-97` states `## License` / `[AGPL v3](./LICENSE)` — a single
  root license file covering the whole monorepo.
- **This contradicts the task's working assumption** of "MIT (app) /
  AGPL-3.0 (pi-server, whatsapp-bridge)." As checked out today, there is
  **no MIT license anywhere in the repo** — the app, pi-server, and
  whatsapp-bridge all fall under the one root AGPL-3.0 `LICENSE` file with
  no per-component override. **Flag this as an open question for the owner
  to confirm/resolve before submission**, not something this audit can
  silently correct: F-Droid requires an unambiguous, correct `License:`
  field in the fdroiddata metadata (see the draft in §4, currently written
  as `AGPL-3.0-only` to match what's actually in the repo). If the intent is
  genuinely MIT for the app, a separate `app/LICENSE` needs to be added and
  the root LICENSE scoped or clarified (e.g. a top-of-repo note stating
  which subtree uses which license) — AGPL-3.0 is F-Droid-acceptable either
  way (it's a recognized free license), so this is not itself a blocker,
  just a correctness issue worth resolving before publishing metadata that
  could be wrong.
- **Dependency license check**: no license conflicts found. Everything
  audited in §1 is BSD/MIT/Apache-2.0-style (standard Flutter-plugin
  licensing) — none of Gullak's dependencies carry a copyleft license that
  would conflict with AGPL-3.0 app code (AGPL is copyleft but its
  restrictions run the other way: AGPL code can depend on permissively
  licensed libraries without issue). Bundled fonts
  (`app/assets/fonts/*-OFL.txt`) are SIL OFL-1.1 — compatible, and already
  correctly surfaced via `LicenseRegistry` per `app/pubspec.yaml:86-88`'s
  comment.

---

## 6. Repo access

### BLOCKER — origin is a Tailscale-only private git host

- Evidence: `git remote -v` → `origin  ssh://git@git.mrkaran.dev:222/mr-karan/gullak.git`.
  Per this user's own memory notes (`reference_gullak_homelab_stack.md`),
  `git.mrkaran.dev` is reachable only over Tailscale — not publicly
  cloneable. F-Droid's build server needs an anonymously-cloneable public
  git URL (`Repo:`/`SourceCode:` in the fdroiddata YAML, §4) that it can
  reach from its own infrastructure with no VPN, no auth.
- **Fix — options, in order of least friction**:
  1. **Public mirror on GitHub or Codeberg**, pushed on a schedule or via a
     post-receive hook from the private origin (`git push --mirror
     git@github.com:<user>/gullak.git`). This is the standard pattern for
     self-hosted-origin projects that also want F-Droid distribution —
     origin stays private/Tailscale-only for day-to-day dev, the mirror is
     the public read-only face F-Droid (and `fdroiddata`'s `Repo:` field)
     points at.
  2. Make `git.mrkaran.dev` itself publicly reachable (drop Tailscale-only
     restriction) — likely undesirable given the deliberate homelab
     posture described elsewhere in this repo's docs; not recommended.
  3. Host the mirror as a `SourceCode`-only pointer while keeping
     `IssueTracker`/day-to-day dev on the private origin — acceptable to
     F-Droid as long as the `Repo:`/clone URL itself is public and
     buildable.
- This also determines the real values to fill into the `SourceCode`/`Repo`
  fields in the §4 draft YAML, currently left as placeholders
  (`<mirror-org>`).

---

## Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | BLOCKER | `geolocator_android` pulls `com.google.android.gms:play-services-location:21.2.0` |
| 2 | BLOCKER | `sqlite3` (transitive via `drift`) downloads prebuilt binaries via Dart build hooks at build time |
| 3 | BLOCKER | No pinned exact Flutter SDK version anywhere (no `.fvmrc`, no CI) |
| 4 | BLOCKER | Flutter app lives in `app/` subdir of a monorepo — stock fdroiddata Flutter template doesn't fit as-is |
| 5 | BLOCKER | No `fastlane/metadata/android/en-US/` tree exists at all |
| 6 | BLOCKER | No fdroiddata build metadata drafted (now drafted in §4, pending the above) |
| 7 | BLOCKER | Git origin (`git.mrkaran.dev`) is Tailscale-only, not publicly cloneable |
| 8 | WARNING | READ_SMS/RECEIVE_SMS need explicit disclosure text in the F-Droid listing |
| 9 | WARNING | ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION should be documented as optional/opt-in in the listing |
| 10 | WARNING | Licensing is actually AGPL-3.0 repo-wide, not MIT(app)/AGPL(server) as assumed — needs owner confirmation |
| 11 | NICE-TO-HAVE | `sqlite3_flutter_libs: ^0.6.0+eol` is a dead upstream-deprecated stub dependency — drop it |
| 12 | NICE-TO-HAVE | No screenshots exist yet for the F-Droid listing — need fresh captures |
| 13 | NICE-TO-HAVE | No CI workflow exists — would also serve as the canonical Flutter-version source F-Droid metadata authors read |

**Count: 7 blockers, 3 warnings, 3 nice-to-haves.**

Top 3 blockers:
1. `geolocator_android` compiles in `com.google.android.gms:play-services-location` — needs `AndroidSettings(forceLocationManager: true)` plus a Gradle-level GMS exclude, verified to still resolve locations.
2. The private Tailscale-only `git.mrkaran.dev` origin has no public clone URL — F-Droid's build server cannot reach it; needs a public GitHub/Codeberg mirror.
3. No `fastlane/metadata/` or `fdroiddata` build YAML exists yet, and the app's `app/`-subdir monorepo layout means the stock Flutter build template needs hand-written `subdir`/path adjustments, not a copy-paste.
