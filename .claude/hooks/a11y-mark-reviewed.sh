#!/bin/bash
# Accessibility - PostToolUse hook for Agent tool
# Creates a session marker when accessibility-lead has been consulted with PASS verdict.
# This marker unlocks the a11y-enforce-edit.sh PreToolUse block.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/review-gate.sh"

INPUT=$(cat)

SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

case "$SUBAGENT" in
  *accessibility-lead*|*accessibility-agents:accessibility-lead*)
    VERDICT_FILE="/tmp/a11y-verdict"
    VERDICT=""
    if [ -f "$VERDICT_FILE" ]; then
      VERDICT=$(cat "$VERDICT_FILE")
      rm -f "$VERDICT_FILE"
    fi

    case "$VERDICT" in
      PASS)
        touch "/tmp/a11y-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "a11y" "CLAUDE.md"
        ;;
      FAIL)
        # Do NOT create marker — review found issues
        ;;
      *)
        # No verdict file — backward compat, allow with marker
        touch "/tmp/a11y-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "a11y" "CLAUDE.md"
        ;;
    esac

    # Plan review: agent completion = reviewed.
    # The main agent must actually run the review agent to reach this hook.
    # No verdict file needed — PostToolUse:Agent is the unforgeable signal.
    touch "/tmp/a11y-plan-reviewed-${SESSION_ID}"
    ;;
esac

exit 0
