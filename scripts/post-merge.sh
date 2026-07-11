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

API_PGID_FILE=/tmp/post-merge-api.pgid

cleanup_api() {
  if [ -n "$API_PID" ]; then
    echo "[post-merge] Stopping shared API server (process group $API_PID)..."
    # kill -- -PGID signals every process in the group: pnpm, tsx, the node
    # worker, and any other descendants — all in one shot.  Because the server
    # was started with setsid its PID == PGID (session-leader), so the negative
    # form of kill reliably reaps the whole tree.
    kill -- -"$API_PID" 2>/dev/null || kill "$API_PID" 2>/dev/null || true
  fi
  rm -f "$API_PGID_FILE"
}
trap cleanup_api EXIT INT TERM

if port_open "$API_PORT"; then
  echo "[post-merge] API server already running on :$API_PORT — skipping start."
else
  echo "[post-merge] Starting shared API server on :$API_PORT..."
  # setsid creates a new session whose leader PID == PGID, giving a stable
  # process-group handle.  setsid execs into pnpm (no intermediate fork), so
  # $! is both the session-leader PID and the PGID used in cleanup_api.
  PORT=$API_PORT setsid pnpm --filter @workspace/api-server run dev \
    >/tmp/post-merge-api.log 2>&1 &
  API_PID=$!
  # Persist the PGID so an external reaper (scripts/cleanup-post-merge-api.sh)
  # can kill the group even if this script is abruptly SIGKILL'd and the trap
  # never fires.
  echo "$API_PID" > "$API_PGID_FILE"
  wait_for_port "$API_PORT" 90
fi

# ── Run the coach smoke suite ────────────────────────────────────────────────
# The standalone FRAME Mobile app has been retired — /mobile now redirects to
# the full web app — so there is no separate mobile smoke suite to run.

echo "[post-merge] Running coach smoke suite..."
bash scripts/run-coach-smoke.sh
