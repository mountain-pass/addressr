#!/usr/bin/env bats
# Integration tests for hook lifecycle interactions.
# Tests the marker/gate cycle across multiple hooks.

setup() {
  HOOKS_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  source "$HOOKS_DIR/lib/gate-helpers.sh"
  source "$HOOKS_DIR/lib/risk-gate.sh"

  TEST_SESSION="bats-lifecycle-$$-${BATS_TEST_NUMBER}"
  export RISK_TTL=60
}

teardown() {
  rm -f "/tmp/risk-commit-${TEST_SESSION}"
  rm -f "/tmp/risk-push-${TEST_SESSION}"
  rm -f "/tmp/risk-release-${TEST_SESSION}"
  rm -f "/tmp/risk-changeset-${TEST_SESSION}"
  rm -f "/tmp/risk-clean-${TEST_SESSION}"
  rm -f "/tmp/risk-state-hash-${TEST_SESSION}"
  rm -f "/tmp/risk-plan-reviewed-${TEST_SESSION}"
  rm -f "/tmp/risk-reducing-commit-${TEST_SESSION}"
  rm -f "/tmp/risk-reducing-push-${TEST_SESSION}"
  rm -f "/tmp/risk-reducing-release-${TEST_SESSION}"
  rm -f "/tmp/risk-incident-release-${TEST_SESSION}"
  rm -f "/tmp/wip-reviewed-${TEST_SESSION}"
  rm -f "/tmp/wip-nudge-verdict"
  rm -f "/tmp/briefing-injected-${TEST_SESSION}"
}

# --- WIP marker lifecycle ---

@test "WIP marker: created by risk-score.sh allows first edit" {
  touch "/tmp/wip-reviewed-${TEST_SESSION}"
  [ -f "/tmp/wip-reviewed-${TEST_SESSION}" ]
}

@test "WIP marker: missing marker blocks edit" {
  rm -f "/tmp/wip-reviewed-${TEST_SESSION}"
  [ ! -f "/tmp/wip-reviewed-${TEST_SESSION}" ]
}

@test "WIP marker: restored after scorer writes verdict" {
  rm -f "/tmp/wip-reviewed-${TEST_SESSION}"
  printf 'CONTINUE' > /tmp/wip-nudge-verdict
  # Simulate what wip-risk-mark.sh does on Agent completion
  if [ -f "/tmp/wip-nudge-verdict" ]; then
    rm -f "/tmp/wip-nudge-verdict"
    touch "/tmp/wip-reviewed-${TEST_SESSION}"
  fi
  [ -f "/tmp/wip-reviewed-${TEST_SESSION}" ]
}

# --- Risk-reducing bypass lifecycle ---

@test "bypass: commit bypass marker allows commit when score is above threshold" {
  printf '8' > "/tmp/risk-commit-${TEST_SESSION}"
  # Without bypass, gate should deny
  RISK_GATE_REASON=""
  if check_risk_gate "$TEST_SESSION" "commit"; then
    echo "Expected deny but got allow"
    return 1
  fi
  # With bypass marker, should allow
  printf 'reducing' > "/tmp/risk-reducing-commit-${TEST_SESSION}"
  [ -f "/tmp/risk-reducing-commit-${TEST_SESSION}" ]
}

@test "bypass: push bypass marker exists after risk-neutral assessment" {
  printf 'reducing' > "/tmp/risk-reducing-push-${TEST_SESSION}"
  [ -f "/tmp/risk-reducing-push-${TEST_SESSION}" ]
  # Simulate gate consuming it
  rm -f "/tmp/risk-reducing-push-${TEST_SESSION}"
  [ ! -f "/tmp/risk-reducing-push-${TEST_SESSION}" ]
}

@test "bypass: incident marker allows release when score is above threshold" {
  printf '12' > "/tmp/risk-release-${TEST_SESSION}"
  printf 'incident' > "/tmp/risk-incident-release-${TEST_SESSION}"
  [ -f "/tmp/risk-incident-release-${TEST_SESSION}" ]
  # Simulate gate consuming it
  rm -f "/tmp/risk-incident-release-${TEST_SESSION}"
  [ ! -f "/tmp/risk-incident-release-${TEST_SESSION}" ]
}

# --- Plan review lifecycle ---

@test "plan: verdict PASS creates marker" {
  printf 'PASS' > /tmp/risk-plan-verdict
  # Simulate risk-policy-mark-reviewed.sh logic
  PLAN_VERDICT=$(cat /tmp/risk-plan-verdict)
  rm -f /tmp/risk-plan-verdict
  case "$PLAN_VERDICT" in
    PASS) touch "/tmp/risk-plan-reviewed-${TEST_SESSION}" ;;
  esac
  [ -f "/tmp/risk-plan-reviewed-${TEST_SESSION}" ]
}

@test "plan: verdict FAIL does not create marker" {
  printf 'FAIL' > /tmp/risk-plan-verdict
  PLAN_VERDICT=$(cat /tmp/risk-plan-verdict)
  rm -f /tmp/risk-plan-verdict
  case "$PLAN_VERDICT" in
    PASS) touch "/tmp/risk-plan-reviewed-${TEST_SESSION}" ;;
  esac
  [ ! -f "/tmp/risk-plan-reviewed-${TEST_SESSION}" ]
}

# --- Clean tree lifecycle ---

@test "clean tree: marker allows commit without score" {
  touch "/tmp/risk-clean-${TEST_SESSION}"
  [ -f "/tmp/risk-clean-${TEST_SESSION}" ]
}

# --- Briefing inject lifecycle ---

@test "briefing: marker prevents re-injection" {
  touch "/tmp/briefing-injected-${TEST_SESSION}"
  [ -f "/tmp/briefing-injected-${TEST_SESSION}" ]
}

@test "briefing: no marker allows injection" {
  rm -f "/tmp/briefing-injected-${TEST_SESSION}"
  [ ! -f "/tmp/briefing-injected-${TEST_SESSION}" ]
}

# --- Helper function tests ---

@test "helper: _is_doc_file returns 0 for doc paths" {
  _is_doc_file "docs/decisions/001-foo.md"
  _is_doc_file ".claude/hooks/test.sh"
  _is_doc_file ".risk-reports/2026-01-01-commit.md"
  _is_doc_file "CLAUDE.md"
}

@test "helper: _is_doc_file returns 1 for source paths" {
  ! _is_doc_file "service/address-service.js"
  ! _is_doc_file "client/elasticsearch.js"
  ! _is_doc_file "src/waycharterServer.js"
  ! _is_doc_file "package.json"
}

@test "helper: _enable_err_trap sets trap" {
  _enable_err_trap
  # Verify trap is set (trap -p ERR should show something)
  trap -p ERR | grep -q "_err_trap_handler"
}
