#!/bin/bash
# PostToolUse hook: Creates session markers when risk-scorer passes reviews.
# Also refreshes the pipeline state hash so drift detection reflects the
# state at scoring time, not prompt-submit time. This prevents false drift
# failures when code is written and staged during the same prompt.
# Mirrors: architect-mark-reviewed.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

INPUT=$(cat)

SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

case "$SUBAGENT" in
  *risk-scorer*)
    # Check for policy review verdict
    POLICY_VERDICT_FILE="/tmp/risk-policy-verdict"
    if [ -f "$POLICY_VERDICT_FILE" ]; then
      VERDICT=$(cat "$POLICY_VERDICT_FILE")
      rm -f "$POLICY_VERDICT_FILE"
      case "$VERDICT" in
        PASS) touch "/tmp/risk-policy-reviewed-${SESSION_ID}" ;;
        FAIL) ;; # Do NOT create marker
      esac
    fi

    # Plan review: check verdict file before creating marker.
    # FAIL verdict means the plan must be revised and re-reviewed.
    PLAN_VERDICT_FILE="/tmp/risk-plan-verdict"
    if [ -f "$PLAN_VERDICT_FILE" ]; then
      PLAN_VERDICT=$(cat "$PLAN_VERDICT_FILE")
      rm -f "$PLAN_VERDICT_FILE"
      case "$PLAN_VERDICT" in
        PASS) touch "/tmp/risk-plan-reviewed-${SESSION_ID}" ;;
        FAIL) ;; # Do NOT create marker — plan must be revised
      esac
    else
      # Fallback: if no verdict file, agent completion = reviewed (backwards compat)
      touch "/tmp/risk-plan-reviewed-${SESSION_ID}"
    fi

    # Refresh pipeline state hash at scoring time.
    # The hash was originally written at UserPromptSubmit by risk-score.sh,
    # but if code was written/staged during the prompt, it's stale.
    # Recomputing here ensures the commit gate compares against the state
    # the scorer actually evaluated, preventing false drift failures.
    HASH_FILE="/tmp/risk-state-hash-${SESSION_ID}"
    CURRENT_HASH=$("$SCRIPT_DIR/lib/pipeline-state.sh" --hash-inputs 2>/dev/null | _hashcmd | cut -d' ' -f1)
    if [ -n "$CURRENT_HASH" ]; then
      echo "$CURRENT_HASH" > "$HASH_FILE"
    fi

    # --- P001 backup: extract scores from agent output if files still PENDING ---
    # The agent SHOULD write score files via Bash, but sometimes skips that step.
    # Parse tool_output for "Overall residual risk: N/25" patterns and write
    # scores to any gate files that are still PENDING.
    AGENT_OUTPUT=$(echo "$INPUT" | jq -r '.tool_output // empty' 2>/dev/null) || true
    if [ -n "$AGENT_OUTPUT" ]; then
      python3 -c "
import sys, re, os

output = sys.stdin.read()
session_id = '${SESSION_ID}'

actions = {
    'Commit': f'/tmp/risk-commit-{session_id}',
    'Push': f'/tmp/risk-push-{session_id}',
    'Release': f'/tmp/risk-release-{session_id}',
    'Changeset': f'/tmp/risk-changeset-{session_id}',
}

for action, score_file in actions.items():
    current = ''
    if os.path.isfile(score_file):
        with open(score_file) as f:
            current = f.read().strip()
        if re.match(r'^\d+(\.\d+)?$', current):
            continue  # Already numeric — agent wrote it

    pattern = rf'##\s+{action}\s+Risk\s+Report.*?Overall\s+residual\s+risk:\s*\**(\d+)/25'
    match = re.search(pattern, output, re.DOTALL | re.IGNORECASE)
    if match:
        score = match.group(1)
        with open(score_file, 'w') as f:
            f.write(score)
        os.utime(score_file, None)
" <<< "$AGENT_OUTPUT" 2>/dev/null || true
    fi
    ;;
esac

exit 0
