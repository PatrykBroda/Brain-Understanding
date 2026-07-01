#!/usr/bin/env bash
# parallel-smoke-runner.sh — run two smoke suites in parallel with early-exit on failure.
#
# Usage:
#   bash scripts/parallel-smoke-runner.sh <coach-script> <mobile-script> <coach-log> <mobile-log>
#
# Exit code: non-zero when either suite fails.
# Behaviour: if one suite exits non-zero while the sibling is still running the
# sibling process group is killed (SIGTERM → SIGKILL after 5 s), then both log
# files are dumped with CANCELLED / normal labels before reporting results.

set -euo pipefail

COACH_SCRIPT="${1:?coach-script required}"
MOBILE_SCRIPT="${2:?mobile-script required}"
COACH_LOG="${3:?coach-log required}"
MOBILE_LOG="${4:?mobile-log required}"

echo ""
echo "──────────────────────────────────────────────"
echo " Running coach and mobile smoke tests in parallel…"
echo "──────────────────────────────────────────────"
echo " Logs → $COACH_LOG  $MOBILE_LOG"
echo ""

set +e

# Launch each suite in its own session so its PID equals its PGID.
# kill -- -PID terminates the full subprocess tree.
setsid bash "$COACH_SCRIPT"  >"$COACH_LOG"  2>&1 &
COACH_PID=$!

setsid bash "$MOBILE_SCRIPT" >"$MOBILE_LOG" 2>&1 &
MOBILE_PID=$!

# Send SIGTERM to the process group; escalate to SIGKILL after 5 s if still alive.
# Reaps the process afterwards and stores its real exit status in KILL_GROUP_EXIT
# so the caller can report the actual code (e.g. 137 after a SIGKILL) instead of
# assuming a hardcoded value.
KILL_GROUP_EXIT=""
kill_group() {
  local pid=$1 label=$2
  echo "[parallel-runner] Sending SIGTERM to ${label} process group (pgid=${pid})…"
  kill -- -"$pid" 2>/dev/null || true
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null && [ "$elapsed" -lt 5 ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "[parallel-runner] ${label} still alive after ${elapsed}s — sending SIGKILL…"
    kill -9 -- -"$pid" 2>/dev/null || true
  fi
  # Reap the process and capture its actual exit status.  A SIGKILLed process
  # yields 137 (128+9); a process that honoured SIGTERM yields 143 (128+15).
  # Either way we surface the real code so a hung suite can never masquerade as 0.
  wait "$pid" 2>/dev/null
  KILL_GROUP_EXIT=$?
}

COACH_EXIT=""
MOBILE_EXIT=""
CANCELLED=""

# Poll once per second.  The moment either suite exits non-zero the sibling
# process group is killed immediately; both logs are still dumped below.
while [ -z "$COACH_EXIT" ] || [ -z "$MOBILE_EXIT" ]; do
  sleep 1

  # ── Check coach ───────────────────────────────────────────────────────────
  if [ -z "$COACH_EXIT" ] && ! kill -0 "$COACH_PID" 2>/dev/null; then
    wait "$COACH_PID"; COACH_EXIT=$?
    if [ "$COACH_EXIT" -ne 0 ] && [ -z "$MOBILE_EXIT" ]; then
      echo "[parallel-runner] Coach suite failed — cancelling mobile suite…"
      kill_group "$MOBILE_PID" "mobile"
      MOBILE_EXIT=$KILL_GROUP_EXIT
      CANCELLED="mobile"
    fi
  fi

  # ── Check mobile ──────────────────────────────────────────────────────────
  if [ -z "$MOBILE_EXIT" ] && ! kill -0 "$MOBILE_PID" 2>/dev/null; then
    wait "$MOBILE_PID"; MOBILE_EXIT=$?
    if [ "$MOBILE_EXIT" -ne 0 ] && [ -z "$COACH_EXIT" ]; then
      echo "[parallel-runner] Mobile suite failed — cancelling coach suite…"
      kill_group "$COACH_PID" "coach"
      COACH_EXIT=$KILL_GROUP_EXIT
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
