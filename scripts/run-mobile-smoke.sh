#!/usr/bin/env bash
# Run the mobile Playwright smoke suite.
#
# Chromium is auto-discovered by playwright.config.ts (Nix-provided system
# Chromium, with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / CHROMIUM_PATH override).
# Do NOT use Playwright's bundled chrome-headless-shell — it crashes on launch
# in this container (missing system libs; --with-deps is forbidden).
#
# If the API server (port 8080) or the mobile static-export server (port 8099)
# are not already listening, they are started in the background and torn down
# when this script exits.  When the services are already running (e.g. the
# normal dev workflow is active) they are left untouched.
#
# Usage:
#   bash scripts/run-mobile-smoke.sh          # run all smoke tests
#   bash scripts/run-mobile-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

# ── Port constants (must match artifact.toml) ─────────────────────────────────
API_PORT=8080
MOBILE_PORT=8099

# ── Process tracking for cleanup ──────────────────────────────────────────────
PIDS=()

cleanup() {
  if [ "${#PIDS[@]}" -gt 0 ]; then
    echo "[mobile-smoke] Stopping background services..."
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
  echo "[mobile-smoke] Waiting for port $port (up to ${max_s}s)..."
  while ! port_open "$port"; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$max_s" ]; then
      echo "[mobile-smoke] ERROR: timeout waiting for port $port" >&2
      return 1
    fi
  done
  echo "[mobile-smoke] Port $port is ready (${elapsed}s)"
}

# ── Start services if not already running ─────────────────────────────────────
if port_open "$API_PORT"; then
  echo "[mobile-smoke] API server already running on :$API_PORT"
else
  echo "[mobile-smoke] Starting API server on :$API_PORT"
  PORT=$API_PORT pnpm --filter @workspace/api-server run dev \
    >/tmp/mobile-smoke-api.log 2>&1 &
  PIDS+=($!)
  wait_for_port "$API_PORT" 90
fi

if port_open "$MOBILE_PORT"; then
  echo "[mobile-smoke] Mobile static server already running on :$MOBILE_PORT"
else
  # Ensure a built dist/ exists before serving.
  DIST_DIR="artifacts/frame-mobile/dist"
  if [ ! -f "$DIST_DIR/index.html" ]; then
    echo "[mobile-smoke] dist/ not found — building frame-mobile..."
    pnpm --filter @workspace/frame-mobile run build \
      >/tmp/mobile-smoke-build.log 2>&1
    echo "[mobile-smoke] Build complete."
  fi

  echo "[mobile-smoke] Starting mobile static server on :$MOBILE_PORT"
  PORT=$MOBILE_PORT BASE_PATH=/mobile/ \
    node artifacts/frame-mobile/serve-static.mjs \
    >/tmp/mobile-smoke-static.log 2>&1 &
  PIDS+=($!)
  wait_for_port "$MOBILE_PORT" 30
fi

# ── Run Playwright suite ──────────────────────────────────────────────────────
echo "[mobile-smoke] Running Playwright mobile-smoke suite..."
exec pnpm playwright test e2e/mobile-smoke.spec.ts "$@"
