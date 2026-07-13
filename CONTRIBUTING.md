# Contributing to Gullak

Thanks for your interest. Issues and pull requests are welcome.

## Dev setup

### App (`app/`)

Requires the Flutter SDK (stable channel).

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # generated code
```

Run the full quality gate before opening a PR:

```bash
just gate        # dart format --check + flutter analyze + flutter test
```

(`just apk` / `just install` build and install to a device.)

### Server (`pi-server/`)

Requires Node 20+.

```bash
cd pi-server
cp .env.example .env
npm install
npm run dev                      # http://127.0.0.1:8787
npm run typecheck && npm test    # before opening a PR
```

### WhatsApp bridge (`whatsapp-bridge/`)

Optional. Bun-based; see `whatsapp-bridge/AGENTS.md`.

## Conventions

Project conventions — money as integer minor units, UUID text IDs,
`YYYY-MM-DD` dates, the sync changelog contract, and the snackbar/AI-route
rules — are documented in **[CLAUDE.md](CLAUDE.md)** (the codebase knowledge
base). Read it before making structural changes. Match the surrounding style;
keep changes focused (YAGNI — don't gold-plate).

## Pull requests

- Keep PRs small and scoped to one change.
- Include tests for behavioral changes; keep `just gate` and the server
  `typecheck`/`test` green.
- Update `CHANGELOG.md` for user-visible changes.

## Developer Certificate of Origin (DCO)

Contributions must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/). By
signing off, you certify that you wrote the patch or otherwise have the right to
submit it under the project's license.

Add a `Signed-off-by` line to every commit — `git commit -s` does this for you:

```
Signed-off-by: Your Name <you@example.com>
```

## Licensing


By contributing you agree your contributions are licensed under the license of
the component you're changing: **MIT** for `app/`, **AGPL-3.0** for `pi-server/`
and `whatsapp-bridge/`.
