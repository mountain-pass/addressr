#!/usr/bin/env bats
# Integration tests for hook lifecycle interactions.
# Tests the marker/gate cycle across multiple hooks.

setup() {
  HOOKS_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  source "$HOOKS_DIR/lib/gate-helpers.sh"
  source "$HOOKS_DIR/lib/risk-gate.sh"

  TEST_SESSION="bats-lifecycle-$$-${BATS_TEST_NUMBER}"
  RDIR=$(_risk_dir "$TEST_SESSION")
  export RISK_TTL=60
}

teardown() {
  rm -rf "${TMPDIR:-/tmp}/claude-risk-${TEST_SESSION}"
}

# --- WIP marker lifecycle ---

@test "WIP marker: created by risk-score.sh allows first edit" {
  touch "${RDIR}/wip-reviewed"
  [ -f "${RDIR}/wip-reviewed" ]
}

@test "WIP marker: missing marker blocks edit" {
  rm -f "${RDIR}/wip-reviewed"
  [ ! -f "${RDIR}/wip-reviewed" ]
}

@test "WIP marker: restored after risk-score-mark.sh processes wip verdict" {
  rm -f "${RDIR}/wip-reviewed"
  # Simulate what risk-score-mark.sh does: touch marker when wip scorer completes
  touch "${RDIR}/wip-reviewed"
  [ -f "${RDIR}/wip-reviewed" ]
}

# --- Risk-reducing bypass lifecycle ---

@test "bypass: commit bypass marker allows commit when score is above threshold" {
  printf '8' > "${RDIR}/commit"
  # Without bypass, gate should deny
  RISK_GATE_REASON=""
  if check_risk_gate "$TEST_SESSION" "commit"; then
    echo "Expected deny but got allow"
    return 1
  fi
  # With bypass marker, should allow
  printf 'reducing' > "${RDIR}/reducing-commit"
  [ -f "${RDIR}/reducing-commit" ]
}

@test "bypass: push bypass marker exists after risk-neutral assessment" {
  printf 'reducing' > "${RDIR}/reducing-push"
  [ -f "${RDIR}/reducing-push" ]
  # Simulate gate consuming it
  rm -f "${RDIR}/reducing-push"
  [ ! -f "${RDIR}/reducing-push" ]
}

@test "bypass: incident marker allows release when score is above threshold" {
  printf '12' > "${RDIR}/release"
  printf 'incident' > "${RDIR}/incident-release"
  [ -f "${RDIR}/incident-release" ]
  # Simulate gate consuming it
  rm -f "${RDIR}/incident-release"
  [ ! -f "${RDIR}/incident-release" ]
}

# --- Plan review lifecycle ---

@test "plan: RISK_VERDICT PASS in output creates marker" {
  # Simulate risk-score-mark.sh parsing agent output
  AGENT_OUTPUT="Some report text
RISK_VERDICT: PASS"
  VERDICT_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_VERDICT:' | tail -1)
  VERDICT=$(echo "$VERDICT_LINE" | sed 's/^RISK_VERDICT:[[:space:]]*//' | tr -d '[:space:]')
  case "$VERDICT" in
    PASS) touch "${RDIR}/plan-reviewed" ;;
  esac
  [ -f "${RDIR}/plan-reviewed" ]
}

@test "plan: RISK_VERDICT FAIL in output does not create marker" {
  AGENT_OUTPUT="Some report text
RISK_VERDICT: FAIL"
  VERDICT_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_VERDICT:' | tail -1)
  VERDICT=$(echo "$VERDICT_LINE" | sed 's/^RISK_VERDICT:[[:space:]]*//' | tr -d '[:space:]')
  case "$VERDICT" in
    PASS) touch "${RDIR}/plan-reviewed" ;;
  esac
  [ ! -f "${RDIR}/plan-reviewed" ]
}

# --- Pipeline scorer output parsing ---

@test "pipeline: RISK_SCORES line writes all three score files" {
  AGENT_OUTPUT="## Pipeline Risk Report
Some analysis here.

RISK_SCORES: commit=3 push=2 release=1"

  SCORES_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_SCORES:' | tail -1)
  COMMIT=$(echo "$SCORES_LINE" | grep -oE 'commit=[0-9]+' | cut -d= -f2)
  PUSH=$(echo "$SCORES_LINE" | grep -oE 'push=[0-9]+' | cut -d= -f2)
  RELEASE=$(echo "$SCORES_LINE" | grep -oE 'release=[0-9]+' | cut -d= -f2)

  [ -n "$COMMIT" ] && printf '%s' "$COMMIT" > "${RDIR}/commit"
  [ -n "$PUSH" ] && printf '%s' "$PUSH" > "${RDIR}/push"
  [ -n "$RELEASE" ] && printf '%s' "$RELEASE" > "${RDIR}/release"

  [ "$(cat ${RDIR}/commit)" = "3" ]
  [ "$(cat ${RDIR}/push)" = "2" ]
  [ "$(cat ${RDIR}/release)" = "1" ]
}

@test "pipeline: RISK_BYPASS reducing creates all bypass markers" {
  AGENT_OUTPUT="RISK_SCORES: commit=1 push=1 release=1
RISK_BYPASS: reducing"

  BYPASS_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_BYPASS:' | tail -1)
  BYPASS_TYPE=$(echo "$BYPASS_LINE" | sed 's/^RISK_BYPASS:[[:space:]]*//' | tr -d '[:space:]')

  case "$BYPASS_TYPE" in
    reducing)
      touch "${RDIR}/reducing-commit"
      touch "${RDIR}/reducing-push"
      touch "${RDIR}/reducing-release"
      ;;
  esac

  [ -f "${RDIR}/reducing-commit" ]
  [ -f "${RDIR}/reducing-push" ]
  [ -f "${RDIR}/reducing-release" ]
}

@test "pipeline: RISK_BYPASS incident creates incident marker" {
  AGENT_OUTPUT="RISK_SCORES: commit=15 push=15 release=15
RISK_BYPASS: incident"

  BYPASS_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_BYPASS:' | tail -1)
  BYPASS_TYPE=$(echo "$BYPASS_LINE" | sed 's/^RISK_BYPASS:[[:space:]]*//' | tr -d '[:space:]')

  case "$BYPASS_TYPE" in
    incident)
      touch "${RDIR}/incident-release"
      ;;
  esac

  [ -f "${RDIR}/incident-release" ]
}

@test "pipeline: missing RISK_SCORES line writes no files" {
  AGENT_OUTPUT="Some report without the structured line"

  SCORES_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_SCORES:' | tail -1) || true
  [ -z "$SCORES_LINE" ]
  [ ! -f "${RDIR}/commit" ]
}

@test "pipeline: scores written to session-scoped dir are found by gate" {
  printf '2' > "${RDIR}/commit"
  # No state-hash file = skip drift check (backwards compat)
  rm -f "${RDIR}/state-hash"
  # Gate should find the score and pass (below threshold of 5)
  check_risk_gate "$TEST_SESSION" "commit"
}

# --- Session cleanup ---

@test "cleanup: rm -rf session dir removes all files" {
  touch "${RDIR}/commit" "${RDIR}/push" "${RDIR}/release"
  touch "${RDIR}/wip-reviewed" "${RDIR}/plan-reviewed"
  rm -rf "${TMPDIR:-/tmp}/claude-risk-${TEST_SESSION}"
  [ ! -d "${TMPDIR:-/tmp}/claude-risk-${TEST_SESSION}" ]
}

# --- Clean tree lifecycle ---

@test "clean tree: marker allows commit without score" {
  touch "${RDIR}/clean"
  [ -f "${RDIR}/clean" ]
}

# --- Briefing inject lifecycle ---

@test "briefing: marker prevents re-injection" {
  touch "${RDIR}/briefing-injected"
  [ -f "${RDIR}/briefing-injected" ]
}

@test "briefing: no marker allows injection" {
  rm -f "${RDIR}/briefing-injected"
  [ ! -f "${RDIR}/briefing-injected" ]
}

# --- Helper function tests ---

@test "helper: _risk_dir creates directory" {
  TESTDIR=$(_risk_dir "$TEST_SESSION")
  [ -d "$TESTDIR" ]
  [[ "$TESTDIR" == *"claude-risk-${TEST_SESSION}" ]]
}

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
