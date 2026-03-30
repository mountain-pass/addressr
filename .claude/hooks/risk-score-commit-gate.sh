#!/bin/bash
# PreToolUse hook: Denies git commit when commit risk score is missing,
# expired, drifted, or >= 5 (Medium).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/risk-gate.sh"

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_name', ''))
except:
    print('')
" 2>/dev/null || echo "")

[ "$TOOL_NAME" = "Bash" ] || exit 0

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null || echo "")

# Only act on git commit commands
echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*git commit' || exit 0

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('session_id', ''))
except:
    print('')
" 2>/dev/null || echo "")

[ -n "$SESSION_ID" ] || exit 0

# Clean tree marker means no uncommitted changes when last checked
CLEAN_FILE="/tmp/risk-clean-${SESSION_ID}"
if [ -f "$CLEAN_FILE" ]; then
    exit 0
fi

# Gate check: existence, TTL, drift, threshold
if ! check_risk_gate "$SESSION_ID" "commit"; then
    risk_gate_deny "Commit blocked: ${RISK_GATE_REASON}"
    exit 0
fi

exit 0
