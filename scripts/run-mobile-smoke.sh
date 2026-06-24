#!/usr/bin/env bash
# Run the mobile Playwright smoke suite.
#
# Chromium is managed by Playwright (installed via `pnpm exec playwright install
# chromium` in post-merge.sh), so no Nix store path discovery is needed.
#
# Usage:
#   bash scripts/run-mobile-smoke.sh          # run all smoke tests
#   bash scripts/run-mobile-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

exec pnpm playwright test e2e/mobile-smoke.spec.ts "$@"
