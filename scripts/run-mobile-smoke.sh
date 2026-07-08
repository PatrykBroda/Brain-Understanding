#!/usr/bin/env bash
# Run the mobile Playwright smoke suite.
#
# Chromium is auto-discovered by playwright.config.ts (Nix-provided system
# Chromium, with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / CHROMIUM_PATH override).
# Do NOT use Playwright's bundled chrome-headless-shell — it crashes on launch
# in this container (missing system libs; --with-deps is forbidden).
#
# ISOLATION & FRESHNESS: this runner starts its OWN api-server + mobile static
# server + a tiny path-routing proxy (scripts/smoke-proxy.mjs) on RANDOMIZED
# per-run ports, and points Playwright at the proxy via SMOKE_BASE_URL.
# - Randomized ports mean a run can NEVER silently reuse a stale server left
#   over from a previous run — every service is freshly started from current
#   code, and the runner says so in its output.
#   (Fixed ports are also unreliable here: Replit's pid1 supervisor opens a
#   localhost forward for any port it sees an app bind and may hold it
#   forever, making previously-used fixed ports unbindable.)
# - Survivors from a previous interrupted run are torn down via a pidfile
#   (/tmp/mobile-smoke.pids) before starting.
# - It never touches the main workflow's ports (8080 / 8099 / 80), and its
#   port range is distinct from coach-smoke's, so the two suites can overlap
#   safely (EADDRINUSE → CONNECTION LOST gate).
#
# NB: the mobile app itself is served from a prebuilt dist/ — an existing
# dist/ may still be OLDER than the current source. Rebuild frame-mobile
# explicitly after mobile code changes (see replit.md gotchas); the runner
# prints the dist/ build time so staleness is visible.
#
# Usage:
#   bash scripts/run-mobile-smoke.sh          # run all smoke tests
#   bash scripts/run-mobile-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

PIDFILE=/tmp/mobile-smoke.pids

# ── Randomized per-run smoke ports (range distinct from coach-smoke's) ───────
# 19100-19899: never overlaps main workflow ports (8080/8099/80) or
# coach-smoke's 18100-18899 range.
rand_port() { echo $((19100 + RANDOM % 800)); }
API_PORT=$(rand_port)
MOBILE_PORT=$(rand_port)
PROXY_PORT=$(rand_port)
while [ "$MOBILE_PORT" = "$API_PORT" ]; do MOBILE_PORT=$(rand_port); done
while [ "$PROXY_PORT" = "$API_PORT" ] || [ "$PROXY_PORT" = "$MOBILE_PORT" ]; do PROXY_PORT=$(rand_port); done

# ── Kill a process and its descendants (pnpm wraps node children) ────────────
# True if $1 looks like one of OUR smoke processes (guards PID-reuse in the
# pidfile — never kill an unrelated process that inherited a recycled pid).
is_smoke_proc() {
  local cmd
  cmd=$(ps -p "$1" -o args= 2>/dev/null || true)
  case "$cmd" in
    *pnpm* | *node* | *npm* | *serve-static* | *smoke-proxy*) return 0 ;;
    *) return 1 ;;
  esac
}

kill_tree() {
  local pid="$1" sig="${2:-TERM}" child
  for child in $(ps -o pid= --ppid "$pid" 2>/dev/null); do
    kill_tree "$child" "$sig"
  done
  kill -s "$sig" "$pid" 2>/dev/null || true
}

# ── Tear down survivors from a previous (interrupted) run ─────────────────────
if [ -f "$PIDFILE" ]; then
  STALE_FOUND=0
  while read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && is_smoke_proc "$pid"; then
      STALE_FOUND=1
      echo "[mobile-smoke] STALE server from a previous run detected (pid $pid) — killing so tests never run against outdated code"
      kill_tree "$pid" TERM
    fi
  done <"$PIDFILE"
  if [ "$STALE_FOUND" = 1 ]; then
    sleep 2
    while read -r pid; do
      [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && is_smoke_proc "$pid" && kill_tree "$pid" KILL || true
    done <"$PIDFILE"
    echo "[mobile-smoke] Stale servers torn down."
  fi
  rm -f "$PIDFILE"
fi

# ── Process tracking for cleanup ──────────────────────────────────────────────
PIDS=()

track() {
  PIDS+=("$1")
  echo "$1" >>"$PIDFILE"
}

cleanup() {
  if [ "${#PIDS[@]}" -gt 0 ]; then
    echo "[mobile-smoke] Stopping background services..."
    for pid in "${PIDS[@]}"; do
      kill_tree "$pid" TERM
    done
  fi
  rm -f "$PIDFILE"
}
trap cleanup EXIT INT TERM

# ── Readiness helper ──────────────────────────────────────────────────────────
# HTTP-based: Replit's pid1 supervisor may forward-listen on app ports and
# answer 502 before the real server binds, so raw TCP connects are NOT a
# reliable "server is up" signal. Wait for an HTTP status < 500 instead.
wait_for_http() {
  local label="$1" url="$2" max_s="$3" expect="${4:-}" elapsed=0 code
  echo "[mobile-smoke] Waiting for $label at $url (up to ${max_s}s)..."
  while true; do
    code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$url" 2>/dev/null) || code=000
    if { [ -n "$expect" ] && [ "$code" = "$expect" ]; } ||
       { [ -z "$expect" ] && [ "$code" != "000" ] && [ "$code" -lt 500 ]; }; then
      echo "[mobile-smoke] $label is ready (HTTP $code after ${elapsed}s)"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$max_s" ]; then
      echo "[mobile-smoke] ERROR: timeout waiting for $label (last HTTP $code)" >&2
      return 1
    fi
  done
}

# ── Start isolated smoke stack (always FRESH — never reuses old servers) ──────
echo "[mobile-smoke] Fresh run — ports: api=$API_PORT mobile=$MOBILE_PORT proxy=$PROXY_PORT (randomized per run; stale servers can never be reused)"

echo "[mobile-smoke] Starting FRESH smoke API server on :$API_PORT (current code)"
PORT=$API_PORT pnpm --filter @workspace/api-server run dev \
  >/tmp/mobile-smoke-api.log 2>&1 &
track $!
wait_for_http "API server" "http://127.0.0.1:$API_PORT/api/healthz" 90 200

# Ensure a built dist/ exists before serving; surface its build time so a
# stale bundle is at least visible in the runner output.
DIST_DIR="artifacts/frame-mobile/dist"
if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "[mobile-smoke] dist/ not found — building frame-mobile..."
  pnpm --filter @workspace/frame-mobile run build \
    >/tmp/mobile-smoke-build.log 2>&1
  echo "[mobile-smoke] Build complete."
else
  echo "[mobile-smoke] Serving existing dist/ (last built: $(date -u -r "$DIST_DIR/index.html" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || echo unknown)) — rebuild if mobile code changed since."
fi

echo "[mobile-smoke] Starting FRESH smoke mobile static server on :$MOBILE_PORT"
PORT=$MOBILE_PORT BASE_PATH=/mobile/ \
  node artifacts/frame-mobile/serve-static.mjs \
  >/tmp/mobile-smoke-static.log 2>&1 &
track $!
wait_for_http "mobile static server" "http://127.0.0.1:$MOBILE_PORT/mobile/" 30

echo "[mobile-smoke] Starting FRESH smoke proxy on :$PROXY_PORT"
PROXY_PORT=$PROXY_PORT API_PORT=$API_PORT APP_PORT=$MOBILE_PORT \
  node scripts/smoke-proxy.mjs \
  >/tmp/mobile-smoke-proxy.log 2>&1 &
track $!
wait_for_http "smoke proxy" "http://127.0.0.1:$PROXY_PORT/api/healthz" 15 200

echo "[mobile-smoke] All services freshly started — suite runs against current code."

# ── Run Playwright suite against the isolated stack ──────────────────────────
# (no exec — the EXIT trap must still fire to clean up the smoke stack)
echo "[mobile-smoke] Running Playwright mobile-smoke suite..."
SMOKE_BASE_URL="http://localhost:$PROXY_PORT" \
  pnpm playwright test e2e/mobile-smoke.spec.ts "$@"
