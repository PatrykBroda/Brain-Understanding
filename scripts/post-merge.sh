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
echo " Running coach and mobile smoke tests in parallel…"
echo "──────────────────────────────────────────────"
echo " Logs → /tmp/post-merge-coach.log  /tmp/post-merge-mobile.log"
echo ""

COACH_LOG=/tmp/post-merge-coach.log
MOBILE_LOG=/tmp/post-merge-mobile.log

set +e

bash scripts/run-coach-smoke.sh  >"$COACH_LOG"  2>&1 &
COACH_PID=$!

bash scripts/run-mobile-smoke.sh >"$MOBILE_LOG" 2>&1 &
MOBILE_PID=$!

# Wait for both suites and collect exit codes independently.
wait "$COACH_PID";  COACH_EXIT=$?
wait "$MOBILE_PID"; MOBILE_EXIT=$?

set -e

echo "──────────────────────────────────────────────"
echo " Coach smoke output"
echo "──────────────────────────────────────────────"
cat "$COACH_LOG"

echo ""
echo "──────────────────────────────────────────────"
echo " Mobile smoke output"
echo "──────────────────────────────────────────────"
cat "$MOBILE_LOG"

echo ""
echo "──────────────────────────────────────────────"
echo " Results"
echo "──────────────────────────────────────────────"

OVERALL=0

if [ $COACH_EXIT -eq 0 ]; then
  echo "✓ Coach smoke tests passed."
else
  echo "✗ Coach smoke tests FAILED (exit $COACH_EXIT) — see output above."
  OVERALL=$COACH_EXIT
fi

if [ $MOBILE_EXIT -eq 0 ]; then
  echo "✓ Mobile smoke tests passed."
else
  echo "✗ Mobile smoke tests FAILED (exit $MOBILE_EXIT) — see output above."
  OVERALL=$MOBILE_EXIT
fi

if [ $OVERALL -eq 0 ]; then
  echo ""
  echo "✓ All smoke tests passed."
fi

exit $OVERALL
