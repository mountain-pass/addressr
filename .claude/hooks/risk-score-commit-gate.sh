#!/bin/bash
# PreToolUse hook: Denies git commit when risk policy is stale,
# commit risk score is missing/expired/drifted/above threshold.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/risk-gate.sh"
_enable_err_trap

_parse_input

TOOL_NAME=$(_get_tool_name)
[ "$TOOL_NAME" = "Bash" ] || exit 0

COMMAND=$(_get_command)
echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*git commit' || exit 0

SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

# RISK-POLICY.md must exist and not be stale (>14 days)
if [ ! -f "RISK-POLICY.md" ] || [ ! -s "RISK-POLICY.md" ]; then
    risk_gate_deny "Commit blocked: RISK-POLICY.md is missing. Run /risk-policy to create it before committing."
    exit 0
fi
POLICY_STALE=$(python3 -c "
from datetime import date
import re
try:
    text = open('RISK-POLICY.md').read()
    m = re.search(r'Last reviewed:\*{0,2}\s*(\d{4}-\d{2}-\d{2})', text)
    if m:
        reviewed = date.fromisoformat(m.group(1))
        print('yes' if (date.today() - reviewed).days > 14 else 'no')
    else:
        print('no')
except:
    print('no')
" 2>/dev/null || echo "no")
if [ "$POLICY_STALE" = "yes" ]; then
    risk_gate_deny "Commit blocked: RISK-POLICY.md is stale (last reviewed over 2 weeks ago). Run /risk-policy to update it before committing."
    exit 0
fi

# Clean tree bypass
RDIR=$(_risk_dir "$SESSION_ID")
if [ -f "${RDIR}/clean" ]; then
    exit 0
fi

# Risk-reducing/neutral bypass
if [ -f "${RDIR}/reducing-commit" ]; then
    rm -f "${RDIR}/reducing-commit"
    exit 0
fi

# Gate check: existence, TTL, drift, threshold
if ! check_risk_gate "$SESSION_ID" "commit"; then
    risk_gate_deny "Commit blocked: ${RISK_GATE_REASON} To proceed: (1) stage files with git add, (2) delegate to risk-scorer-pipeline (subagent_type: 'risk-scorer-pipeline') to assess cumulative pipeline risk. If the commit is risk-neutral or risk-reducing, the scorer will create a bypass marker."
    exit 0
fi

exit 0
