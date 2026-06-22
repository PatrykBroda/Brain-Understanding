#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

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
  echo "✗ Smoke tests FAILED (exit $SMOKE_EXIT) — see output above for details."
  exit $SMOKE_EXIT
fi
