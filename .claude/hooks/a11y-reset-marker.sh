#!/bin/bash
# Stop hook: Clears accessibility review session marker.
# Mirrors: voice-tone-reset-marker.sh, style-guide-reset-marker.sh

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -n "$SESSION_ID" ]; then
  rm -f "/tmp/a11y-reviewed-${SESSION_ID}" \
        "/tmp/a11y-reviewed-${SESSION_ID}.hash" \
        "/tmp/a11y-verdict" \
        "/tmp/a11y-plan-reviewed-${SESSION_ID}" \
        "/tmp/a11y-plan-verdict"
fi

exit 0
