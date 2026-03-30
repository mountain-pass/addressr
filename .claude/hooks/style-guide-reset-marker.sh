#!/bin/bash
# Style Guide - Stop hook
# Removes the session marker so the next prompt requires a fresh style review.
# This tightens the gate from per-session to per-turn.

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('session_id', ''))
" 2>/dev/null)

if [ -n "$SESSION_ID" ]; then
  rm -f "/tmp/style-guide-reviewed-${SESSION_ID}" \
        "/tmp/style-guide-reviewed-${SESSION_ID}.hash" \
        "/tmp/style-guide-verdict" \
        "/tmp/style-guide-plan-reviewed-${SESSION_ID}" \
        "/tmp/style-guide-plan-verdict"
fi

exit 0
