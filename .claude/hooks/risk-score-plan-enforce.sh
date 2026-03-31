#!/bin/bash
# PreToolUse hook: Denies ExitPlanMode until risk-scorer has reviewed
# the plan and given PASS. Mirrors architect-plan-enforce.sh pattern.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"
_enable_err_trap

_parse_input

SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

# Check for risk plan review marker
MARKER="$(_risk_dir "$SESSION_ID")/plan-reviewed"
if [ -f "$MARKER" ]; then
  exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: Risk-scorer must review the plan before exiting plan mode. Delegate to risk-scorer-plan (subagent_type: 'risk-scorer-plan') to review the plan file for risk, including projected release risk."
  }
}
EOF
exit 0
