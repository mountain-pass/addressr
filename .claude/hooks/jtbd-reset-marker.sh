#!/bin/bash
# Stop hook: Clears JTBD review session markers.

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -n "$SESSION_ID" ]; then
  rm -f "/tmp/jtbd-reviewed-${SESSION_ID}" \
        "/tmp/jtbd-reviewed-${SESSION_ID}.hash" \
        "/tmp/jtbd-verdict" \
        "/tmp/jtbd-plan-reviewed-${SESSION_ID}" \
        "/tmp/jtbd-plan-verdict"
fi

exit 0
