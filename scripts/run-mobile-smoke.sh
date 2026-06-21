#!/usr/bin/env bash
# Run the mobile Playwright smoke suite.
#
# Dynamically locates the system Chromium so the path does not depend on a
# specific Nix store hash (which changes across Nix channel updates).
#
# Usage:
#   bash scripts/run-mobile-smoke.sh          # run all smoke tests
#   bash scripts/run-mobile-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  CHROMIUM=$(
    which chromium 2>/dev/null ||
    which chromium-browser 2>/dev/null ||
    ls /nix/store/*/bin/chromium 2>/dev/null | sort | tail -1 ||
    true
  )
  if [ -n "${CHROMIUM:-}" ]; then
    export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROMIUM"
  fi
fi

exec pnpm playwright test e2e/mobile-smoke.spec.ts "$@"
