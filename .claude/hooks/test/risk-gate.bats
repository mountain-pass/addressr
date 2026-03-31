#!/usr/bin/env bats
# Tests for .claude/hooks/lib/risk-gate.sh

setup() {
  HOOKS_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  source "$HOOKS_DIR/lib/gate-helpers.sh"
  source "$HOOKS_DIR/lib/risk-gate.sh"

  TEST_SESSION="bats-test-$$-${BATS_TEST_NUMBER}"
  RDIR=$(_risk_dir "$TEST_SESSION")
  SCORE_FILE="${RDIR}/commit"
  HASH_FILE="${RDIR}/state-hash"

  export RISK_TTL=5
  rm -f "$SCORE_FILE" "$HASH_FILE"
}

teardown() {
  rm -rf "${TMPDIR:-/tmp}/claude-risk-${TEST_SESSION}"
}

# Helper: call check_risk_gate directly (not via run) so RISK_GATE_REASON is visible
assert_gate_denies() {
  local session="$1" action="$2" expected_reason="$3"
  RISK_GATE_REASON=""
  if check_risk_gate "$session" "$action"; then
    echo "Expected gate to deny but it allowed"
    return 1
  fi
  if [[ "$RISK_GATE_REASON" != *"$expected_reason"* ]]; then
    echo "Expected reason to contain '$expected_reason' but got: $RISK_GATE_REASON"
    return 1
  fi
}

assert_gate_allows() {
  local session="$1" action="$2"
  if ! check_risk_gate "$session" "$action"; then
    echo "Expected gate to allow but it denied: $RISK_GATE_REASON"
    return 1
  fi
}

@test "missing score file denies" {
  assert_gate_denies "$TEST_SESSION" "commit" "No commit risk score found"
}

@test "score file with PENDING denies (non-numeric)" {
  printf 'PENDING' > "$SCORE_FILE"
  assert_gate_denies "$TEST_SESSION" "commit" "invalid value"
}

@test "score 4 allows (below threshold)" {
  printf '4' > "$SCORE_FILE"
  assert_gate_allows "$TEST_SESSION" "commit"
}

@test "score 5 denies (at threshold)" {
  printf '5' > "$SCORE_FILE"
  assert_gate_denies "$TEST_SESSION" "commit" "5/25"
}

@test "score 8 denies (above threshold)" {
  printf '8' > "$SCORE_FILE"
  assert_gate_denies "$TEST_SESSION" "commit" "8/25"
}

@test "score 1 allows (very low)" {
  printf '1' > "$SCORE_FILE"
  assert_gate_allows "$TEST_SESSION" "commit"
}

@test "expired score file denies" {
  printf '3' > "$SCORE_FILE"
  # Backdate mtime by 10 seconds (TTL is 5)
  touch -t "$(date -v-10S +%Y%m%d%H%M.%S 2>/dev/null || date -d '10 seconds ago' +%Y%m%d%H%M.%S 2>/dev/null)" "$SCORE_FILE"
  assert_gate_denies "$TEST_SESSION" "commit" "expired"
}

@test "fresh score file allows" {
  printf '3' > "$SCORE_FILE"
  touch "$SCORE_FILE"
  assert_gate_allows "$TEST_SESSION" "commit"
}

@test "drift detection: hash mismatch denies" {
  printf '3' > "$SCORE_FILE"
  touch "$SCORE_FILE"
  echo "oldhash123" > "$HASH_FILE"
  assert_gate_denies "$TEST_SESSION" "commit" "drift"
}

@test "no hash file skips drift check (backwards compat)" {
  printf '3' > "$SCORE_FILE"
  touch "$SCORE_FILE"
  rm -f "$HASH_FILE"
  assert_gate_allows "$TEST_SESSION" "commit"
}

@test "risk_gate_deny outputs valid JSON" {
  run risk_gate_deny "Test reason"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null
  [[ "$output" == *"permissionDecision"* ]]
  [[ "$output" == *"deny"* ]]
  [[ "$output" == *"Test reason"* ]]
}
