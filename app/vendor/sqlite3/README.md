# Vendored SQLite amalgamation

- **Version:** 3.53.3 (`SQLITE_VERSION` in sqlite3.h)
- **Source:** https://sqlite.org/2026/sqlite-amalgamation-3530300.zip
  (retrieved 2026-07-13)
- **License:** SQLite is public domain — https://sqlite.org/copyright.html

## Why this exists

By default the `sqlite3` Dart package's build hook **downloads prebuilt
`libsqlite3.so` binaries from GitHub releases at build time**. F-Droid
requires building from source with no arbitrary network fetches, so the app's
`pubspec.yaml` sets the hook user-define

```yaml
hooks:
  user_defines:
    sqlite3:
      source: source
      path: vendor/sqlite3/sqlite3.c
```

which makes the hook compile this amalgamation with the platform toolchain
(NDK on Android) instead. The hook applies the same compile defines the
prebuilt binaries use (FTS5, RTREE, math functions, session, …), so features
are identical.

## Upgrading

Grab the current amalgamation zip from https://sqlite.org/download.html,
replace `sqlite3.c` + `sqlite3.h`, and update this README's version/URL.
