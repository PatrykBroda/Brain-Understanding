#!/usr/bin/env bash
# Run the coach web-app Playwright smoke suite.
#
# Chromium is auto-discovered by playwright.config.ts (Nix-provided system
# Chromium, with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / CHROMIUM_PATH override).
# Do NOT use Playwright's bundled chrome-headless-shell — it crashes on launch
# in this container (missing system libs; --with-deps is forbidden).
#
# ISOLATION & FRESHNESS: this runner starts its OWN api-server + coach
# frontend + a tiny path-routing proxy (scripts/smoke-proxy.mjs) on RANDOMIZED
# per-run ports, and points Playwright at the proxy via SMOKE_BASE_URL.
# - Randomized ports mean a run can NEVER silently reuse a stale server left
#   over from a previous run — every service is freshly started from current
#   code, and the runner says so in its output.
#   (Fixed ports are also unreliable here: Replit's pid1 supervisor opens a
#   localhost forward for any port it sees an app bind and may hold it
#   forever, making previously-used fixed ports unbindable.)
# - Survivors from a previous interrupted run are torn down via a pidfile
#   (/tmp/coach-smoke.pids) before starting.
# - It never touches the main workflow's ports (8080 / 21706 / 80), so
#   overlapping smoke runs and main-server restarts can't collide
#   (EADDRINUSE → CONNECTION LOST gate).
#
# Usage:
#   bash scripts/run-coach-smoke.sh          # run all coach smoke tests
#   bash scripts/run-coach-smoke.sh --headed  # pass-through Playwright flags
set -euo pipefail

PIDFILE=/tmp/coach-smoke.pids

# ── Randomized per-run smoke ports (range distinct from mobile-smoke's) ──────
# 18100-18899: never overlaps main workflow ports (8080/21706/80) or
# mobile-smoke's 19100-19899 range.
rand_port() { echo $((18100 + RANDOM % 800)); }
API_PORT=$(rand_port)
COACH_PORT=$(rand_port)
PROXY_PORT=$(rand_port)
while [ "$COACH_PORT" = "$API_PORT" ]; do COACH_PORT=$(rand_port); done
while [ "$PROXY_PORT" = "$API_PORT" ] || [ "$PROXY_PORT" = "$COACH_PORT" ]; do PROXY_PORT=$(rand_port); done

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
      echo "[coach-smoke] STALE server from a previous run detected (pid $pid) — killing so tests never run against outdated code"
      kill_tree "$pid" TERM
    fi
  done <"$PIDFILE"
  if [ "$STALE_FOUND" = 1 ]; then
    sleep 2
    while read -r pid; do
      [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && is_smoke_proc "$pid" && kill_tree "$pid" KILL || true
    done <"$PIDFILE"
    echo "[coach-smoke] Stale servers torn down."
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
    echo "[coach-smoke] Stopping background services..."
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
  echo "[coach-smoke] Waiting for $label at $url (up to ${max_s}s)..."
  while true; do
    code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$url" 2>/dev/null) || code=000
    if { [ -n "$expect" ] && [ "$code" = "$expect" ]; } ||
       { [ -z "$expect" ] && [ "$code" != "000" ] && [ "$code" -lt 500 ]; }; then
      echo "[coach-smoke] $label is ready (HTTP $code after ${elapsed}s)"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$max_s" ]; then
      echo "[coach-smoke] ERROR: timeout waiting for $label (last HTTP $code)" >&2
      return 1
    fi
  done
}

# ── Start isolated smoke stack (always FRESH — never reuses old servers) ──────
echo "[coach-smoke] Fresh run — ports: api=$API_PORT coach=$COACH_PORT proxy=$PROXY_PORT (randomized per run; stale servers can never be reused)"

echo "[coach-smoke] Starting FRESH smoke API server on :$API_PORT (current code)"
PORT=$API_PORT pnpm --filter @workspace/api-server run dev \
  >/tmp/coach-smoke-api.log 2>&1 &
track $!
wait_for_http "API server" "http://127.0.0.1:$API_PORT/api/healthz" 90 200

echo "[coach-smoke] Starting FRESH smoke coach frontend on :$COACH_PORT (current code)"
PORT=$COACH_PORT BASE_PATH=/ pnpm --filter @workspace/coach run dev \
  >/tmp/coach-smoke-web.log 2>&1 &
track $!
wait_for_http "coach frontend" "http://127.0.0.1:$COACH_PORT/" 120

echo "[coach-smoke] Starting FRESH smoke proxy on :$PROXY_PORT"
PROXY_PORT=$PROXY_PORT API_PORT=$API_PORT APP_PORT=$COACH_PORT \
  node scripts/smoke-proxy.mjs \
  >/tmp/coach-smoke-proxy.log 2>&1 &
track $!
wait_for_http "smoke proxy" "http://127.0.0.1:$PROXY_PORT/api/healthz" 15 200

echo "[coach-smoke] All services freshly started — suite runs against current code."

# ── Run Playwright suite against the isolated stack ──────────────────────────
# (no exec — the EXIT trap must still fire to clean up the smoke stack)
echo "[coach-smoke] Running Playwright coach-smoke suite..."
SMOKE_BASE_URL="http://localhost:$PROXY_PORT" \
  pnpm playwright test e2e/coach-smoke.spec.ts "$@"
