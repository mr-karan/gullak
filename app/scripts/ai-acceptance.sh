#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Defaults match the homelab pi-server config (OpenRouter + Gemini 3 Flash).
# Override AI_BASE_URL or AI_MODEL only when testing a different provider.
api_key="${AI_API_KEY:-${OPENROUTER_API_KEY:-}}"
if [[ -z "$api_key" ]]; then
  echo "Set AI_API_KEY (or OPENROUTER_API_KEY) before running ai-acceptance." >&2
  echo "Optional overrides: AI_BASE_URL, AI_MODEL." >&2
  exit 64
fi

export AI_API_KEY="$api_key"
dart run tool/ai_acceptance.dart
