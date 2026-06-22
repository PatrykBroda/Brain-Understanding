#!/usr/bin/env bash
# Run the coach web-app Playwright smoke suite.
#
# Dynamically locates the system Chromium so the path does not depend on a
# specific Nix store hash (which changes across Nix channel updates).
#
# If the API server (port 8080) or the coach frontend (port 21706) are not
# already listening, they are started in the background and torn down when
# this script exits.  When the services are already running (e.g. the normal
# dev workflow is active) they are left untouched.
#
# Usage:
#   bash scripts/run-coach-smoke.sh          # run all coach smoke tests
#   bash scripts/run-coach-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

# ── Chromium discovery ────────────────────────────────────────────────────────
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

# ── Port constants (must match artifact.toml) ─────────────────────────────────
API_PORT=8080
COACH_PORT=21706

# ── Process tracking for cleanup ──────────────────────────────────────────────
PIDS=()

cleanup() {
  if [ "${#PIDS[@]}" -gt 0 ]; then
    echo "[coach-smoke] Stopping background services..."
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
  fi
}
trap cleanup EXIT INT TERM

# ── Helpers ───────────────────────────────────────────────────────────────────
# Uses bash's built-in /dev/tcp pseudo-device — no external nc/curl required.
port_open() {
  (echo > /dev/tcp/127.0.0.1/"$1") 2>/dev/null
}

# Wait up to $2 seconds for TCP port $1 to accept connections (2s poll).
wait_for_port() {
  local port="$1" max_s="$2" elapsed=0
  echo "[coach-smoke] Waiting for port $port (up to ${max_s}s)..."
  while ! port_open "$port"; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$max_s" ]; then
      echo "[coach-smoke] ERROR: timeout waiting for port $port" >&2
      return 1
    fi
  done
  echo "[coach-smoke] Port $port is ready (${elapsed}s)"
}

# ── Start services if not already running ─────────────────────────────────────
if port_open "$API_PORT"; then
  echo "[coach-smoke] API server already running on :$API_PORT"
else
  echo "[coach-smoke] Starting API server on :$API_PORT"
  PORT=$API_PORT pnpm --filter @workspace/api-server run dev \
    >/tmp/coach-smoke-api.log 2>&1 &
  PIDS+=($!)
  wait_for_port "$API_PORT" 90
fi

if port_open "$COACH_PORT"; then
  echo "[coach-smoke] Coach frontend already running on :$COACH_PORT"
else
  echo "[coach-smoke] Starting coach frontend on :$COACH_PORT"
  PORT=$COACH_PORT BASE_PATH=/ pnpm --filter @workspace/coach run dev \
    >/tmp/coach-smoke-web.log 2>&1 &
  PIDS+=($!)
  wait_for_port "$COACH_PORT" 120
fi

# ── Run Playwright suite ──────────────────────────────────────────────────────
echo "[coach-smoke] Running Playwright coach-smoke suite..."
exec pnpm playwright test e2e/coach-smoke.spec.ts "$@"
