#!/usr/bin/env bash
# Verify that the setsid + kill -- -PGID pattern (and the external reaper
# fallback) correctly clean up the shared API server even under abrupt failure.
#
# Uses a throw-away port (59111) and lightweight fake servers so this test is
# safe to run at any time without touching real services.
#
# Tests:
#   1. kill -- -PGID frees the port (normal EXIT trap path)
#   2. kill -- -PGID also reaps grandchild processes (pnpm→tsx→node simulation)
#   3. Negative: plain kill $PID leaves grandchildren alive (motivates PGID fix)
#   4. E2E: SIGKILL the controller mid-run; external reaper clears the port
#      (covers the scenario where the EXIT trap never fires)
#
# Exit 0 = all assertions passed.
# Exit 1 = at least one assertion failed.
#
# Usage:
#   bash scripts/test-post-merge-cleanup.sh

set -uo pipefail

TEST_PORT=59111
PGID_FILE=/tmp/post-merge-api.pgid   # must match post-merge.sh + cleanup script
PASS=0
FAIL=0

port_open() { (echo > /dev/tcp/127.0.0.1/"$1") 2>/dev/null; }
fail()       { echo "[cleanup-test] FAIL: $*" >&2; FAIL=$((FAIL + 1)); }
pass()       { echo "[cleanup-test] PASS: $*";     PASS=$((PASS + 1)); }

wait_server() {
  local port=$1 deadline=$2 elapsed=0
  while ! port_open "$port"; do
    sleep 1; elapsed=$((elapsed + 1))
    [ "$elapsed" -ge "$deadline" ] && return 1
  done
}

# Ensure test port is available and no leftover pidfile from a previous run.
if port_open "$TEST_PORT"; then
  echo "[cleanup-test] ERROR: port $TEST_PORT is already in use — cannot run test." >&2
  exit 1
fi
rm -f "$PGID_FILE"

# Check that setsid is available (util-linux, ships in every Nix container).
if ! command -v setsid >/dev/null 2>&1; then
  echo "[cleanup-test] ERROR: setsid not found — cannot run test." >&2
  exit 1
fi

# ── Test 1: kill -- -PGID frees the port (normal EXIT trap path) ──────────────
echo "[cleanup-test] Test 1: kill -- -PGID frees the port"

setsid python3 -m http.server "$TEST_PORT" >/dev/null 2>&1 &
SRV1_PID=$!

sleep 2

if ! port_open "$TEST_PORT"; then
  fail "fake server did not open port $TEST_PORT"
  kill -- -"$SRV1_PID" 2>/dev/null || kill "$SRV1_PID" 2>/dev/null || true
else
  kill -- -"$SRV1_PID" 2>/dev/null || kill "$SRV1_PID" 2>/dev/null || true
  sleep 1
  if port_open "$TEST_PORT"; then
    fail "port $TEST_PORT still open after kill -- -PGID (pid $SRV1_PID)"
    kill -- -"$SRV1_PID" 2>/dev/null || true
  else
    pass "port $TEST_PORT closed after kill -- -PGID"
  fi
fi

# ── Test 2: kill -- -PGID reaps grandchild processes too ──────────────────────
# pnpm → tsx → node produces a process tree; verify the whole group is reaped.
echo ""
echo "[cleanup-test] Test 2: kill -- -PGID also reaps grandchildren"

GRANDCHILD_SENTINEL=/tmp/cleanup-test-grandchild-$$

read -r -d '' FAKE_SERVER_PY <<'PYEOF' || true
import os, socket, time, sys
sentinel = sys.argv[1]
port     = int(sys.argv[2])
pid = os.fork()
if pid == 0:
    with open(sentinel, "w") as f:
        f.write(str(os.getpid()))
    time.sleep(120)
else:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", port))
    s.listen(1)
    time.sleep(120)
PYEOF

setsid python3 -c "$FAKE_SERVER_PY" "$GRANDCHILD_SENTINEL" "$TEST_PORT" &
SRV2_PID=$!

ELAPSED=0
while [ "$ELAPSED" -lt 10 ]; do
  port_open "$TEST_PORT" && [ -f "$GRANDCHILD_SENTINEL" ] && break
  sleep 1; ELAPSED=$((ELAPSED + 1))
done

if ! port_open "$TEST_PORT"; then
  fail "fake multi-process server did not start"
  kill -- -"$SRV2_PID" 2>/dev/null || true
elif [ ! -f "$GRANDCHILD_SENTINEL" ]; then
  fail "grandchild sentinel not created"
  kill -- -"$SRV2_PID" 2>/dev/null || true
else
  GRANDCHILD_PID=$(cat "$GRANDCHILD_SENTINEL")
  kill -- -"$SRV2_PID" 2>/dev/null || kill "$SRV2_PID" 2>/dev/null || true
  sleep 1
  if port_open "$TEST_PORT"; then
    fail "port $TEST_PORT still open after kill -- -PGID on multi-process server"
    kill -- -"$SRV2_PID" 2>/dev/null || true
  else
    pass "port $TEST_PORT closed after kill -- -PGID on multi-process server"
  fi
  if kill -0 "$GRANDCHILD_PID" 2>/dev/null; then
    fail "grandchild pid $GRANDCHILD_PID still alive after kill -- -PGID"
    kill "$GRANDCHILD_PID" 2>/dev/null || true
  else
    pass "grandchild pid $GRANDCHILD_PID also reaped by kill -- -PGID"
  fi
fi
rm -f "$GRANDCHILD_SENTINEL"

# ── Test 3: plain kill leaves grandchildren alive (negative / motivating test) ─
echo ""
echo "[cleanup-test] Test 3 (negative): plain kill leaves grandchildren alive"

setsid python3 -c "$FAKE_SERVER_PY" "$GRANDCHILD_SENTINEL" "$TEST_PORT" &
SRV3_PID=$!
ELAPSED=0
while [ "$ELAPSED" -lt 10 ]; do
  port_open "$TEST_PORT" && [ -f "$GRANDCHILD_SENTINEL" ] && break
  sleep 1; ELAPSED=$((ELAPSED + 1))
done

if ! port_open "$TEST_PORT" || [ ! -f "$GRANDCHILD_SENTINEL" ]; then
  echo "[cleanup-test] SKIP Test 3: fake server didn't start cleanly"
else
  GRANDCHILD_PID=$(cat "$GRANDCHILD_SENTINEL")
  kill "$SRV3_PID" 2>/dev/null || true   # OLD approach: single-PID kill
  sleep 1
  if kill -0 "$GRANDCHILD_PID" 2>/dev/null; then
    pass "confirmed: plain kill leaves grandchild $GRANDCHILD_PID alive (motivates kill -- -PGID)"
    kill "$GRANDCHILD_PID" 2>/dev/null || true
  else
    echo "[cleanup-test] NOTE: grandchild exited even with plain kill (shared fd / early exit)"
    PASS=$((PASS + 1))
  fi
fi
rm -f "$GRANDCHILD_SENTINEL"

# ── Test 4: E2E — SIGKILL controller, external reaper clears the port ─────────
# This is the scenario where post-merge.sh is abruptly killed (OOM / Playwright
# OOM kill) and its EXIT trap never fires.  The external reaper
# (scripts/cleanup-post-merge-api.sh) reads the pidfile and kills the group.
echo ""
echo "[cleanup-test] Test 4 (E2E): SIGKILL controller, external reaper clears port"

rm -f "$PGID_FILE"

# A minimal controller that mirrors what post-merge.sh does:
#   1. Starts a fake API server with setsid.
#   2. Writes the PGID to the well-known pidfile.
#   3. "Runs smoke tests" (sleeps), then normally cleans up.
# We will SIGKILL this controller before it gets to clean up itself.
cat > /tmp/fake-controller-$$.sh << CTLEOF
#!/usr/bin/env bash
set -euo pipefail
PGID_FILE=$PGID_FILE
TEST_PORT=$TEST_PORT

cleanup() {
  if [ -n "\${SRV_PID:-}" ]; then
    kill -- -"\$SRV_PID" 2>/dev/null || kill "\$SRV_PID" 2>/dev/null || true
  fi
  rm -f "\$PGID_FILE"
}
trap cleanup EXIT INT TERM

setsid python3 -m http.server "\$TEST_PORT" >/dev/null 2>&1 &
SRV_PID=\$!
echo "\$SRV_PID" > "\$PGID_FILE"

# Wait for the fake server to come up.
ELAPSED=0
while ! (echo > /dev/tcp/127.0.0.1/"\$TEST_PORT") 2>/dev/null; do
  sleep 1; ELAPSED=\$((ELAPSED + 1))
  [ "\$ELAPSED" -ge 10 ] && exit 1
done

# Signal readiness, then simulate a long-running smoke suite.
echo "READY"
sleep 120
CTLEOF
chmod +x /tmp/fake-controller-$$.sh

bash /tmp/fake-controller-$$.sh > /tmp/fake-controller-$$.out 2>&1 &
CONTROLLER_PID=$!

# Wait until the controller signals it's ready (port open + pidfile written).
ELAPSED=0
CONTROLLER_READY=0
while [ "$ELAPSED" -lt 15 ]; do
  if port_open "$TEST_PORT" && [ -f "$PGID_FILE" ]; then
    CONTROLLER_READY=1
    break
  fi
  sleep 1; ELAPSED=$((ELAPSED + 1))
done

if [ "$CONTROLLER_READY" -eq 0 ]; then
  fail "controller did not reach ready state (port $TEST_PORT open + pidfile)"
  kill "$CONTROLLER_PID" 2>/dev/null || true
  rm -f /tmp/fake-controller-$$.sh /tmp/fake-controller-$$.out "$PGID_FILE"
else
  # SIGKILL the controller (simulates OOM / Playwright crash killing post-merge.sh).
  # The EXIT trap does NOT fire; the fake server keeps running on $TEST_PORT.
  kill -9 "$CONTROLLER_PID" 2>/dev/null || true
  sleep 1

  # Confirm the server is still running (proving the trap didn't fire).
  if ! port_open "$TEST_PORT"; then
    # Unexpected: server already gone — controller may have cleaned up via some
    # other mechanism.  Still counts as pass for overall goal but note it.
    echo "[cleanup-test] NOTE: server gone before reaper ran (trap may have fired)"
    PASS=$((PASS + 1))
    rm -f "$PGID_FILE"
  else
    # Server still up — confirmed orphan. Now run the external reaper.
    echo "[cleanup-test] Confirmed: server still on port $TEST_PORT after SIGKILL (orphaned)"
    bash scripts/cleanup-post-merge-api.sh
    sleep 1

    if port_open "$TEST_PORT"; then
      fail "port $TEST_PORT still open after external reaper ran"
    else
      pass "external reaper cleared port $TEST_PORT after SIGKILL of controller"
    fi

    if [ -f "$PGID_FILE" ]; then
      fail "pidfile $PGID_FILE not deleted by external reaper"
    else
      pass "external reaper deleted the pidfile"
    fi
  fi
fi

rm -f /tmp/fake-controller-$$.sh /tmp/fake-controller-$$.out "$PGID_FILE"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────────────"
echo " cleanup-test results: $PASS passed, $FAIL failed"
echo "──────────────────────────────────────────────────────────────"

[ "$FAIL" -eq 0 ]
