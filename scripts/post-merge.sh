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

# Launch each suite as its own session so its PID equals its PGID.
# kill -- -PID then terminates the full subprocess tree (playwright, node, etc.)
# instead of just the top-level bash wrapper.
setsid bash scripts/run-coach-smoke.sh  >"$COACH_LOG"  2>&1 &
COACH_PID=$!

setsid bash scripts/run-mobile-smoke.sh >"$MOBILE_LOG" 2>&1 &
MOBILE_PID=$!

# Send SIGTERM to the process group; escalate to SIGKILL after 5 s if still alive.
kill_group() {
  local pid=$1 label=$2
  echo "[post-merge] Sending SIGTERM to ${label} process group (pgid=${pid})…"
  kill -- -"$pid" 2>/dev/null || true
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null && [ "$elapsed" -lt 5 ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "[post-merge] ${label} still alive after ${elapsed}s — sending SIGKILL…"
    kill -9 -- -"$pid" 2>/dev/null || true
  fi
}

COACH_EXIT=""
MOBILE_EXIT=""
CANCELLED=""

# Poll once per second.  The moment either suite exits non-zero the sibling
# process group is killed immediately; both logs are still dumped below.
while [ -z "$COACH_EXIT" ] || [ -z "$MOBILE_EXIT" ]; do
  sleep 1

  # ── Check coach ─────────────────────────────────────────────────────────────
  if [ -z "$COACH_EXIT" ] && ! kill -0 "$COACH_PID" 2>/dev/null; then
    wait "$COACH_PID"; COACH_EXIT=$?
    if [ "$COACH_EXIT" -ne 0 ] && [ -z "$MOBILE_EXIT" ]; then
      echo "[post-merge] Coach suite failed — cancelling mobile suite…"
      kill_group "$MOBILE_PID" "mobile"
      wait "$MOBILE_PID" 2>/dev/null || true
      MOBILE_EXIT=130
      CANCELLED="mobile"
    fi
  fi

  # ── Check mobile ─────────────────────────────────────────────────────────────
  if [ -z "$MOBILE_EXIT" ] && ! kill -0 "$MOBILE_PID" 2>/dev/null; then
    wait "$MOBILE_PID"; MOBILE_EXIT=$?
    if [ "$MOBILE_EXIT" -ne 0 ] && [ -z "$COACH_EXIT" ]; then
      echo "[post-merge] Mobile suite failed — cancelling coach suite…"
      kill_group "$COACH_PID" "coach"
      wait "$COACH_PID" 2>/dev/null || true
      COACH_EXIT=130
      CANCELLED="coach"
    fi
  fi
done

set -e

echo "──────────────────────────────────────────────"
if [ "$CANCELLED" = "coach" ]; then
  echo " Coach smoke output  [CANCELLED — mobile suite failed first]"
else
  echo " Coach smoke output"
fi
echo "──────────────────────────────────────────────"
cat "$COACH_LOG"

echo ""
echo "──────────────────────────────────────────────"
if [ "$CANCELLED" = "mobile" ]; then
  echo " Mobile smoke output  [CANCELLED — coach suite failed first]"
else
  echo " Mobile smoke output"
fi
echo "──────────────────────────────────────────────"
cat "$MOBILE_LOG"

echo ""
echo "──────────────────────────────────────────────"
echo " Results"
echo "──────────────────────────────────────────────"

OVERALL=0

if [ "$COACH_EXIT" -eq 0 ]; then
  echo "✓ Coach smoke tests passed."
elif [ "$CANCELLED" = "coach" ]; then
  echo "✗ Coach smoke tests CANCELLED (mobile suite failed first)."
  OVERALL=$MOBILE_EXIT
else
  echo "✗ Coach smoke tests FAILED (exit $COACH_EXIT) — see output above."
  OVERALL=$COACH_EXIT
fi

if [ "$MOBILE_EXIT" -eq 0 ]; then
  echo "✓ Mobile smoke tests passed."
elif [ "$CANCELLED" = "mobile" ]; then
  echo "✗ Mobile smoke tests CANCELLED (coach suite failed first)."
  OVERALL=$COACH_EXIT
else
  echo "✗ Mobile smoke tests FAILED (exit $MOBILE_EXIT) — see output above."
  OVERALL=$MOBILE_EXIT
fi

if [ $OVERALL -eq 0 ]; then
  echo ""
  echo "✓ All smoke tests passed."
fi

exit $OVERALL
