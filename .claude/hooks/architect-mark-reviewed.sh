#!/bin/bash
# Architecture - PostToolUse hook for Agent tool
# Creates a session marker when architect has been consulted.
# This marker unlocks the architect-enforce-edit.sh PreToolUse block.
# Mirrors: voice-tone-mark-reviewed.sh

# Source shared portable helpers (_mtime, _hashcmd)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

INPUT=$(cat)

SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

case "$SUBAGENT" in
  *architect*)
    # Check verdict file from architect agent
    VERDICT_FILE="/tmp/architect-verdict"
    VERDICT=""
    if [ -f "$VERDICT_FILE" ]; then
      VERDICT=$(cat "$VERDICT_FILE")
      rm -f "$VERDICT_FILE"
    fi

    case "$VERDICT" in
      PASS)
        # Architect explicitly passed, create marker
        touch "/tmp/architect-reviewed-${SESSION_ID}"
        ;;
      FAIL)
        # Architect found issues, do NOT create marker
        ;;
      *)
        # No verdict file (agent error or old agent version)
        # Allow with warning to avoid permanent lockout
        touch "/tmp/architect-reviewed-${SESSION_ID}"
        ;;
    esac

    # Store decision hash for drift detection
    if [ -f "/tmp/architect-reviewed-${SESSION_ID}" ]; then
      if [ -d "docs/decisions" ]; then
        HASH=$(find docs/decisions -name '*.md' -not -name 'README.md' -print0 | sort -z | xargs -0 cat 2>/dev/null | _hashcmd | cut -d' ' -f1)
      else
        HASH="none"
      fi
      echo "$HASH" > "/tmp/architect-reviewed-${SESSION_ID}.hash"
    fi

    ;;
esac

exit 0
