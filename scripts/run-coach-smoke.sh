#!/usr/bin/env bash
# Run the coach web-app Playwright smoke suite.
#
# Chromium is auto-discovered by playwright.config.ts (Nix-provided system
# Chromium, with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / CHROMIUM_PATH override).
# Do NOT use Playwright's bundled chrome-headless-shell — it crashes on launch
# in this container (missing system libs; --with-deps is forbidden).
#
# ISOLATION: this runner starts its OWN api-server + coach frontend on
# dedicated smoke ports plus a tiny path-routing proxy (scripts/smoke-proxy.mjs)
# that mimics the shared proxy, and points Playwright at it via SMOKE_BASE_URL.
# It never touches the main workflow's ports (8080 / 21706 / 80), so
# overlapping smoke runs and main-server restarts can no longer collide
# (EADDRINUSE → CONNECTION LOST gate).
#
# Usage:
#   bash scripts/run-coach-smoke.sh          # run all coach smoke tests
#   bash scripts/run-coach-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

# ── Dedicated smoke ports (distinct from artifact.toml AND mobile-smoke) ──────
API_PORT=18080
COACH_PORT=18706
PROXY_PORT=18000

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

# ── Start isolated smoke stack (reuse if a previous run left it up) ──────────
if port_open "$API_PORT"; then
  echo "[coach-smoke] Smoke API server already running on :$API_PORT"
else
  echo "[coach-smoke] Starting smoke API server on :$API_PORT"
  PORT=$API_PORT pnpm --filter @workspace/api-server run dev \
    >/tmp/coach-smoke-api.log 2>&1 &
  PIDS+=($!)
  wait_for_port "$API_PORT" 90
fi

if port_open "$COACH_PORT"; then
  echo "[coach-smoke] Smoke coach frontend already running on :$COACH_PORT"
else
  echo "[coach-smoke] Starting smoke coach frontend on :$COACH_PORT"
  PORT=$COACH_PORT BASE_PATH=/ pnpm --filter @workspace/coach run dev \
    >/tmp/coach-smoke-web.log 2>&1 &
  PIDS+=($!)
  wait_for_port "$COACH_PORT" 120
fi

if port_open "$PROXY_PORT"; then
  echo "[coach-smoke] Smoke proxy already running on :$PROXY_PORT"
else
  echo "[coach-smoke] Starting smoke proxy on :$PROXY_PORT"
  PROXY_PORT=$PROXY_PORT API_PORT=$API_PORT APP_PORT=$COACH_PORT \
    node scripts/smoke-proxy.mjs \
    >/tmp/coach-smoke-proxy.log 2>&1 &
  PIDS+=($!)
  wait_for_port "$PROXY_PORT" 15
fi

# ── Run Playwright suite against the isolated stack ──────────────────────────
echo "[coach-smoke] Running Playwright coach-smoke suite..."
SMOKE_BASE_URL="http://localhost:$PROXY_PORT" \
  exec pnpm playwright test e2e/coach-smoke.spec.ts "$@"
