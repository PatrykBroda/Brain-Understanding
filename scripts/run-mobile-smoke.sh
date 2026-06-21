#!/usr/bin/env bash
# Run the mobile Playwright smoke suite.
#
# Browser resolution order (most to least preferred):
#  1. Playwright's own bundled Chromium (installed via `pnpm exec playwright install chromium`)
#  2. System Chromium located dynamically so the path does not depend on a
#     specific Nix store hash (which changes across Nix channel updates).
#
# The PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var can override the resolution
# entirely when set externally.
#
# Usage:
#   bash scripts/run-mobile-smoke.sh          # run all smoke tests
#   bash scripts/run-mobile-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  # Prefer Playwright's own bundled Chromium if it has been installed.
  BUNDLED=$(
    ls "${HOME}/.cache/ms-playwright/chromium-"*/chrome-linux/chrome 2>/dev/null | sort | tail -1 || true
  )
  if [ -n "${BUNDLED:-}" ] && [ -x "${BUNDLED}" ]; then
    export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${BUNDLED}"
  else
    # Fall back to system Chromium (dynamic so Nix hash changes don't break it).
    SYSTEM_CHROMIUM=$(
      which chromium 2>/dev/null ||
      which chromium-browser 2>/dev/null ||
      ls /nix/store/*/bin/chromium 2>/dev/null | sort | tail -1 ||
      true
    )
    if [ -n "${SYSTEM_CHROMIUM:-}" ]; then
      export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${SYSTEM_CHROMIUM}"
    fi
    # If neither is found, leave executablePath unset so Playwright errors
    # clearly rather than silently failing.
  fi
fi

exec pnpm playwright test e2e/mobile-smoke.spec.ts "$@"
