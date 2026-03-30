#!/bin/bash
# Stop hook: Clears risk-policy session marker.
# Mirrors: architect-reset-marker.sh

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -n "$SESSION_ID" ]; then
  rm -f "/tmp/risk-policy-reviewed-${SESSION_ID}" "/tmp/risk-policy-verdict" \
        "/tmp/risk-plan-reviewed-${SESSION_ID}" "/tmp/risk-plan-verdict"
fi

exit 0
