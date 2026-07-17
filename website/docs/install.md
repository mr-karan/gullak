# Installing Gullak

Gullak is an Android app today (iOS is planned). It works fully offline out of
the box — no account, no server required.

---

## F-Droid

**Coming soon.** Gullak is being prepared for the F-Droid catalog. When it
lands, you'll be able to install and auto-update it from the F-Droid client
with a fully reproducible build. Until then, use the GitHub Releases APK below.

---

## GitHub Releases (APK sideload)

The full-featured build — including SMS capture — is published on GitHub
Releases:

1. Open **[github.com/mr-karan/gullak/releases](https://github.com/mr-karan/gullak/releases)**
   on your phone and download the latest `gullak-*.apk`.
2. Tap the downloaded file. Android will ask you to allow installs from your
   browser or file manager the first time — grant it (Settings → Apps → Special
   access → Install unknown apps).
3. Install, then open Gullak.

To verify the download, compare its SHA-256 against the checksum published on
the release page.

Updates: download and install a newer APK over the top — your data is
preserved. (F-Droid will automate this once listed.)

---

## Build from source

You need the Flutter SDK (stable channel). From the repo:

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # generated code
flutter build apk --release
# → build/app/outputs/flutter-apk/app-release.apk
```

Install it on a connected device:

```bash
flutter install
```

The repo's `Justfile` wraps these: `just apk` builds, `just install` builds and
installs over ADB.

---

## About the SMS permission (Android)

Gullak can turn bank SMS into draft transactions you review. This needs the
`READ_SMS` permission, and we want to be completely honest about it:

- **It is opt-in.** The app works fully without it. If you never grant SMS
  access, Gullak is a manual + receipt-scan + sync tracker and nothing about
  SMS runs.
- **Parsing happens on *your* server, not ours.** When SMS capture is on, bank
  messages are sent to the sync server *you* configure (your self-hosted
  `pi-server`, or none) to be parsed by the AI model *you* configured. There is
  no Gullak-operated cloud in this path. If you run no server, there is no SMS
  parsing.
- **No message leaves your control silently.** Nothing is uploaded to any
  third party. There are no analytics or trackers in the app.
- **You can turn it off any time.** Disable SMS capture in the app's settings,
  or revoke the permission in Android Settings → Apps → Gullak → Permissions.
  The SMS inbox surface then hides entirely.

Because Google Play restricts `READ_SMS` to default-SMS-handler apps, the build
that includes SMS capture is distributed via GitHub Releases / F-Droid
(sideload), not the Play Store. A Play build without SMS surfaces may follow.

---

See also: **[self-hosting.md](self-hosting.md)** to run the optional sync/AI
server and connect the app to it.
