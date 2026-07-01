#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# NOTE: Do NOT run `playwright install chromium` here. The bundled
# chrome-headless-shell crashes on launch in this container (missing system
# libs; `--with-deps` needs root and is forbidden). playwright.config.ts
# auto-discovers the Nix-provided system Chromium instead.

# ── Shared API server ─────────────────────────────────────────────────────────
# Start the API server here, once, before launching the two smoke suites in
# parallel.  Both run-*-smoke.sh scripts check port 8080 first; when they see
# it already open they skip their own start — eliminating the race window where
# both scripts see the port closed simultaneously and both try to bind it.

API_PORT=8080
API_PID=""

port_open() {
  (echo > /dev/tcp/127.0.0.1/"$1") 2>/dev/null
}

wait_for_port() {
  local port="$1" max_s="$2" elapsed=0
  echo "[post-merge] Waiting for port $port (up to ${max_s}s)..."
  while ! port_open "$port"; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$max_s" ]; then
      echo "[post-merge] ERROR: timeout waiting for port $port" >&2
      return 1
    fi
  done
  echo "[post-merge] Port $port is ready (${elapsed}s)"
}

cleanup_api() {
  if [ -n "$API_PID" ]; then
    echo "[post-merge] Stopping shared API server (pid $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup_api EXIT INT TERM

if port_open "$API_PORT"; then
  echo "[post-merge] API server already running on :$API_PORT — skipping start."
else
  echo "[post-merge] Starting shared API server on :$API_PORT..."
  PORT=$API_PORT pnpm --filter @workspace/api-server run dev \
    >/tmp/post-merge-api.log 2>&1 &
  API_PID=$!
  wait_for_port "$API_PORT" 90
fi

# ── Run both smoke suites in parallel ────────────────────────────────────────

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
