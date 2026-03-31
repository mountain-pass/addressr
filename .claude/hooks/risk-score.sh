#!/bin/bash
# UserPromptSubmit hook: No-op.
# Risk scoring is triggered by Edit/Write (WIP nudge gate) and gated actions
# (commit/push/release gates). This hook is retained only for the session
# marker lifecycle — creating the WIP marker so the first edit isn't blocked.

set -euo pipefail

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('session_id', ''))
except:
    print('')
" 2>/dev/null || echo "")

[ -n "$SESSION_ID" ] || exit 0

# Create WIP marker so first edit of the session isn't blocked
WIP_MARKER="/tmp/wip-reviewed-${SESSION_ID}"
if [ ! -f "$WIP_MARKER" ]; then
    touch "$WIP_MARKER"
fi

# Rotate old risk reports (keep last 7 days)
if [ -d ".risk-reports" ]; then
    find .risk-reports -name '*.md' -mtime +7 -delete 2>/dev/null || true
fi

exit 0
