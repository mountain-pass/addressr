#!/bin/bash
# Voice & Tone - Stop hook
# Removes the session marker so the next prompt requires a fresh voice review.
# This tightens the gate from per-session to per-turn.

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('session_id', ''))
" 2>/dev/null)

if [ -n "$SESSION_ID" ]; then
  rm -f "/tmp/voice-tone-reviewed-${SESSION_ID}" \
        "/tmp/voice-tone-reviewed-${SESSION_ID}.hash" \
        "/tmp/voice-tone-verdict" \
        "/tmp/voice-tone-plan-reviewed-${SESSION_ID}" \
        "/tmp/voice-tone-plan-verdict"
fi

exit 0
