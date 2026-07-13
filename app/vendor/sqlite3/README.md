# Vendored SQLite amalgamation

- **Version:** 3.53.3 (`SQLITE_VERSION` in sqlite3.h)
- **Source:** https://sqlite.org/2026/sqlite-amalgamation-3530300.zip
  (retrieved 2026-07-13)
- **Archive SHA3-256** (as published on https://sqlite.org/download.html and
  verified against the retrieved zip):
  `d45c688a8cb23f68611a894a756a12d7eb6ab6e9e2468ca70adbeab3808b5ab9`
- **License:** SQLite is public domain — https://sqlite.org/copyright.html.
  The dedication, from the source header itself:

  > The author disclaims copyright to this source code. In place of a legal
  > notice, here is a blessing:
  > May you do good and not evil.
  > May you find forgiveness for yourself and forgive others.
  > May you share freely, never taking more than you give.

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

**Note:** because the source override is ours, upgrading the Dart `sqlite3`
package no longer upgrades SQLite itself — this directory is the single
source of truth for the SQLite version the app ships.

Cadence: upgrade on SQLite security releases, plus a quarterly check of
https://sqlite.org/download.html. To upgrade: grab the current amalgamation
zip, verify its SHA3-256 against the download page, replace `sqlite3.c` +
`sqlite3.h`, and update this README's version/URL/hash.
