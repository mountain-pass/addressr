#!/bin/bash
# Stop hook: Clears risk score temp files on session end.

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('session_id', ''))
" 2>/dev/null)

if [ -n "$SESSION_ID" ]; then
    # Score files
    rm -f "/tmp/risk-commit-${SESSION_ID}" \
          "/tmp/risk-push-${SESSION_ID}" \
          "/tmp/risk-release-${SESSION_ID}" \
          "/tmp/risk-clean-${SESSION_ID}" \
          "/tmp/risk-changeset-${SESSION_ID}" \
          "/tmp/risk-state-hash-${SESSION_ID}" \
          "/tmp/risk-plan-reviewed-${SESSION_ID}" \
          "/tmp/risk-plan-verdict"
    # Old file names (transition cleanup)
    rm -f "/tmp/risk-score-value-${SESSION_ID}" \
          "/tmp/risk-score-clean-${SESSION_ID}"
fi

exit 0
