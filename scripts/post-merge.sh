#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

echo ""
echo "──────────────────────────────────────────────"
echo " Installing Playwright Chromium browser…"
echo "──────────────────────────────────────────────"
pnpm exec playwright install chromium

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
