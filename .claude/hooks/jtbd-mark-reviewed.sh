#!/bin/bash
# JTBD - PostToolUse hook for Agent tool
# Creates session markers when jtbd-lead has been consulted with PASS verdict.
# Handles both edit review and plan review verdicts.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/review-gate.sh"

INPUT=$(cat)

SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

case "$SUBAGENT" in
  *jtbd-lead*)
    # Check for edit review verdict
    VERDICT_FILE="/tmp/jtbd-verdict"
    VERDICT=""
    if [ -f "$VERDICT_FILE" ]; then
      VERDICT=$(cat "$VERDICT_FILE")
      rm -f "$VERDICT_FILE"
    fi

    case "$VERDICT" in
      PASS)
        touch "/tmp/jtbd-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "jtbd" "docs/jtbd"
        ;;
      FAIL)
        # Do NOT create marker — review found issues
        ;;
      *)
        # No verdict file — backward compat, allow with marker
        touch "/tmp/jtbd-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "jtbd" "docs/jtbd"
        ;;
    esac

    # Plan review: agent completion = reviewed.
    # The main agent must actually run the review agent to reach this hook.
    # No verdict file needed — PostToolUse:Agent is the unforgeable signal.
    touch "/tmp/jtbd-plan-reviewed-${SESSION_ID}"
    ;;
esac

exit 0
