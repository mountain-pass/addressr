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
    "permissionDecisionReason": "BLOCKED: Risk-scorer must review the plan before exiting plan mode. You MUST first delegate to risk-scorer using the Agent tool (subagent_type: 'risk-scorer') to review the plan. Prompt it with: 'Review this plan for risk. Read the plan file at [path]. Assess whether the proposed changes would introduce risk above the appetite threshold in RISK-POLICY.md. Write your verdict (PASS or FAIL) to /tmp/risk-plan-verdict.' After the review completes, this will be unblocked automatically."
  }
}
EOF
exit 0
