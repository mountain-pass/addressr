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

    # Plan review: agent completion = reviewed.
    # The main agent must actually run the review agent to reach this hook.
    # No verdict file needed — PostToolUse:Agent is the unforgeable signal.
    touch "/tmp/risk-plan-reviewed-${SESSION_ID}"

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
    ;;
esac

exit 0
