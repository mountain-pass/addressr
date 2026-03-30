#!/bin/bash
# PreToolUse hook: Denies ExitPlanMode until risk-scorer has reviewed
# the plan and given PASS. Mirrors architect-plan-enforce.sh pattern.

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

# Check for risk plan review marker
MARKER="/tmp/risk-plan-reviewed-${SESSION_ID}"
if [ -f "$MARKER" ]; then
  exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: Risk-scorer must review the plan before exiting plan mode. Delegate to risk-scorer (subagent_type: 'risk-scorer') to review the plan file for risk, including projected release risk."
  }
}
EOF
exit 0
