#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

dart format --set-exit-if-changed lib test
flutter analyze
flutter test
