#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# NOTE: Do NOT run `playwright install chromium` here. The bundled
# chrome-headless-shell crashes on launch in this container (missing system
# libs; `--with-deps` needs root and is forbidden). playwright.config.ts
# auto-discovers the Nix-provided system Chromium instead.

echo ""
echo "──────────────────────────────────────────────"
echo " Running coach smoke tests…"
echo "──────────────────────────────────────────────"

set +e
bash scripts/run-coach-smoke.sh
COACH_EXIT=$?
set -e

if [ $COACH_EXIT -ne 0 ]; then
  echo ""
  echo "✗ Coach smoke tests FAILED (exit $COACH_EXIT) — see output above for details."
  exit $COACH_EXIT
fi

echo ""
echo "──────────────────────────────────────────────"
echo " Running mobile smoke tests…"
echo "──────────────────────────────────────────────"

set +e
bash scripts/run-mobile-smoke.sh
SMOKE_EXIT=$?
set -e

if [ $SMOKE_EXIT -eq 0 ]; then
  echo ""
  echo "✓ Smoke tests passed."
else
  echo ""
  echo "✗ Mobile smoke tests FAILED (exit $SMOKE_EXIT) — see output above for details."
  exit $SMOKE_EXIT
fi
