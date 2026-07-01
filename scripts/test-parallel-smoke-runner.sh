#!/usr/bin/env bash
# test-parallel-smoke-runner.sh
#
# Shell unit tests for parallel-smoke-runner.sh.
#
# Tests verify that when one suite exits non-zero while the sibling is still
# running the runner:
#   1. exits non-zero overall
#   2. prints the CANCELLED label for the killed suite
#   3. dumps both log files (partial output from the killed suite is present)
#
# Usage:
#   bash scripts/test-parallel-smoke-runner.sh
#
# Exit code: 0 = all tests passed, 1 = one or more tests failed.

set -euo pipefail

PASS=0
FAIL=0
RUNNER="$(dirname "$0")/parallel-smoke-runner.sh"

assert() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc  ($result)"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" text="$2" needle="$3"
  if echo "$text" | grep -qF "$needle"; then
    assert "$desc" "ok"
  else
    assert "$desc" "string not found: '$needle'"
  fi
}

assert_not_contains() {
  local desc="$1" text="$2" needle="$3"
  if ! echo "$text" | grep -qF "$needle"; then
    assert "$desc" "ok"
  else
    assert "$desc" "unexpected string found: '$needle'"
  fi
}

# ── Scenario helpers ──────────────────────────────────────────────────────────

run_scenario() {
  local coach_script="$1" mobile_script="$2"
  local TMP
  TMP=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$TMP'" RETURN

  local coach_log="$TMP/coach.log"
  local mobile_log="$TMP/mobile.log"
  local output exit_code

  set +e
  output=$(bash "$RUNNER" "$coach_script" "$mobile_script" "$coach_log" "$mobile_log" 2>&1)
  exit_code=$?
  set -e

  # Export for assertion functions
  SCENARIO_OUTPUT="$output"
  SCENARIO_EXIT="$exit_code"
  SCENARIO_COACH_LOG="$coach_log"
  SCENARIO_MOBILE_LOG="$mobile_log"
}

# ── Build fake suite scripts ──────────────────────────────────────────────────

make_fail_fast() {
  local f
  f=$(mktemp --suffix=.sh)
  cat >"$f" <<'EOF'
#!/usr/bin/env bash
echo "FAIL_FAST: starting"
echo "FAIL_FAST: work done"
exit 1
EOF
  chmod +x "$f"
  echo "$f"
}

make_slow() {
  local f
  f=$(mktemp --suffix=.sh)
  cat >"$f" <<'EOF'
#!/usr/bin/env bash
echo "SLOW: starting"
sleep 30
echo "SLOW: done (should not reach here)"
exit 0
EOF
  chmod +x "$f"
  echo "$f"
}

make_pass() {
  local f
  f=$(mktemp --suffix=.sh)
  cat >"$f" <<'EOF'
#!/usr/bin/env bash
echo "PASS: starting"
echo "PASS: done"
exit 0
EOF
  chmod +x "$f"
  echo "$f"
}

# ── Test 1: coach fails fast, mobile is cancelled ─────────────────────────────

echo ""
echo "Test 1: coach fails fast — mobile should be CANCELLED"
FAIL_FAST=$(make_fail_fast)
SLOW=$(make_slow)
trap 'rm -f "$FAIL_FAST" "$SLOW"' RETURN

run_scenario "$FAIL_FAST" "$SLOW"

assert_t1_exit() {
  [ "$SCENARIO_EXIT" -ne 0 ] && echo "ok" || echo "expected non-zero exit, got 0"
}
assert "exits non-zero overall" "$(assert_t1_exit)"

assert_contains \
  "output contains CANCELLED label for mobile" \
  "$SCENARIO_OUTPUT" \
  "[CANCELLED — coach suite failed first]"

assert_contains \
  "output contains mobile header" \
  "$SCENARIO_OUTPUT" \
  "Mobile smoke output"

assert_contains \
  "output contains coach header" \
  "$SCENARIO_OUTPUT" \
  "Coach smoke output"

assert_contains \
  "coach log is dumped (fail-fast output visible)" \
  "$SCENARIO_OUTPUT" \
  "FAIL_FAST: work done"

assert_contains \
  "mobile partial log is dumped (slow suite start line visible)" \
  "$SCENARIO_OUTPUT" \
  "SLOW: starting"

assert_contains \
  "results section shows coach FAILED" \
  "$SCENARIO_OUTPUT" \
  "Coach smoke tests FAILED"

assert_contains \
  "results section shows mobile CANCELLED" \
  "$SCENARIO_OUTPUT" \
  "Mobile smoke tests CANCELLED"

rm -f "$FAIL_FAST" "$SLOW"
trap - RETURN

# ── Test 2: mobile fails fast, coach is cancelled ─────────────────────────────

echo ""
echo "Test 2: mobile fails fast — coach should be CANCELLED"
FAIL_FAST=$(make_fail_fast)
SLOW=$(make_slow)
trap 'rm -f "$FAIL_FAST" "$SLOW"' RETURN

run_scenario "$SLOW" "$FAIL_FAST"

assert_t2_exit() {
  [ "$SCENARIO_EXIT" -ne 0 ] && echo "ok" || echo "expected non-zero exit, got 0"
}
assert "exits non-zero overall" "$(assert_t2_exit)"

assert_contains \
  "output contains CANCELLED label for coach" \
  "$SCENARIO_OUTPUT" \
  "[CANCELLED — mobile suite failed first]"

assert_contains \
  "mobile log is dumped (fail-fast output visible)" \
  "$SCENARIO_OUTPUT" \
  "FAIL_FAST: work done"

assert_contains \
  "coach partial log is dumped (slow suite start line visible)" \
  "$SCENARIO_OUTPUT" \
  "SLOW: starting"

assert_contains \
  "results section shows mobile FAILED" \
  "$SCENARIO_OUTPUT" \
  "Mobile smoke tests FAILED"

assert_contains \
  "results section shows coach CANCELLED" \
  "$SCENARIO_OUTPUT" \
  "Coach smoke tests CANCELLED"

rm -f "$FAIL_FAST" "$SLOW"
trap - RETURN

# ── Test 3: both pass — no CANCELLED label, exit 0 ───────────────────────────

echo ""
echo "Test 3: both suites pass — no cancellation"
PASS_A=$(make_pass)
PASS_B=$(make_pass)
trap 'rm -f "$PASS_A" "$PASS_B"' RETURN

run_scenario "$PASS_A" "$PASS_B"

assert_t3_exit() {
  [ "$SCENARIO_EXIT" -eq 0 ] && echo "ok" || echo "expected exit 0, got $SCENARIO_EXIT"
}
assert "exits zero overall" "$(assert_t3_exit)"

assert_not_contains \
  "no CANCELLED label in output" \
  "$SCENARIO_OUTPUT" \
  "[CANCELLED"

assert_contains \
  "results section shows all passed" \
  "$SCENARIO_OUTPUT" \
  "All smoke tests passed."

rm -f "$PASS_A" "$PASS_B"
trap - RETURN

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "──────────────────────────────────────────────"
echo " Test results: $PASS passed, $FAIL failed"
echo "──────────────────────────────────────────────"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
