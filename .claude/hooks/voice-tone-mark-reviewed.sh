#!/bin/bash
# Voice & Tone - PostToolUse hook for Agent tool
# Creates a session marker when voice-and-tone-lead has been consulted with PASS verdict.
# This marker unlocks the voice-tone-enforce-edit.sh PreToolUse block.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/review-gate.sh"

INPUT=$(cat)

SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

case "$SUBAGENT" in
  *voice-and-tone-lead*)
    VERDICT_FILE="/tmp/voice-tone-verdict"
    VERDICT=""
    if [ -f "$VERDICT_FILE" ]; then
      VERDICT=$(cat "$VERDICT_FILE")
      rm -f "$VERDICT_FILE"
    fi

    case "$VERDICT" in
      PASS)
        touch "/tmp/voice-tone-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "voice-tone" "docs/VOICE-AND-TONE.md"
        ;;
      FAIL)
        # Do NOT create marker — review found issues
        ;;
      *)
        # No verdict file — backward compat, allow with marker
        touch "/tmp/voice-tone-reviewed-${SESSION_ID}"
        store_review_hash "$SESSION_ID" "voice-tone" "docs/VOICE-AND-TONE.md"
        ;;
    esac

    # Plan review: agent completion = reviewed.
    # The main agent must actually run the review agent to reach this hook.
    # No verdict file needed — PostToolUse:Agent is the unforgeable signal.
    touch "/tmp/voice-tone-plan-reviewed-${SESSION_ID}"
    ;;
esac

exit 0
