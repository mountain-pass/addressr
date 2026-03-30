#!/bin/bash
# Style Guide - PostToolUse hook for Agent tool
# Creates a session marker when style-guide-lead has been consulted with PASS verdict.
# This marker unlocks the style-guide-enforce-edit.sh PreToolUse block.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/review-gate.sh"

INPUT=$(cat)

SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

case "$SUBAGENT" in
  *style-guide-lead*)
    VERDICT_FILE="/tmp/style-guide-verdict"
    VERDICT=""
    if [ -f "$VERDICT_FILE" ]; then
      VERDICT=$(cat "$VERDICT_FILE")
      rm -f "$VERDICT_FILE"
    fi

    case "$VERDICT" in
      PASS)
        touch "/tmp/style-guide-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "style-guide" "docs/STYLE-GUIDE.md"
        ;;
      FAIL)
        # Do NOT create marker — review found issues
        ;;
      *)
        # No verdict file — backward compat, allow with marker
        touch "/tmp/style-guide-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "style-guide" "docs/STYLE-GUIDE.md"
        ;;
    esac

    # Plan review: agent completion = reviewed.
    # The main agent must actually run the review agent to reach this hook.
    # No verdict file needed — PostToolUse:Agent is the unforgeable signal.
    touch "/tmp/style-guide-plan-reviewed-${SESSION_ID}"
    ;;
esac

exit 0
