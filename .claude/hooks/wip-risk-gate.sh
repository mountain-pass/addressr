#!/bin/bash
# PreToolUse hook: Blocks Edit/Write on non-doc files until WIP risk
# assessment has been completed by the risk-scorer in WIP nudge mode.
# Mirrors the architect-enforce-edit.sh gate pattern.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_name', ''))
except:
    print('')
" 2>/dev/null || echo "")

case "$TOOL_NAME" in
  Edit|Write) ;;
  *) exit 0 ;;
esac

# Extract the file path being edited
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('file_path', ti.get('path', '')))
except:
    print('')
" 2>/dev/null || echo "")

[ -n "$FILE_PATH" ] || exit 0

# Check if the file is a doc/governance file (excluded from WIP gating)
EXCL=$(_doc_exclusions)
IS_DOC=false
for pattern in $EXCL; do
  # Strip the ':!' prefix to get the path pattern
  clean="${pattern#:!}"
  case "$FILE_PATH" in
    *"$clean"*) IS_DOC=true; break ;;
  esac
done

# Also exclude .claude/ files, .risk-reports/, and plan files
case "$FILE_PATH" in
  *.claude/*|*.risk-reports/*|*RISK-POLICY.md) IS_DOC=true ;;
esac

if [ "$IS_DOC" = true ]; then
  exit 0
fi

# Check for WIP-reviewed marker
SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('session_id', ''))
except:
    print('')
" 2>/dev/null || echo "")

[ -n "$SESSION_ID" ] || exit 0

MARKER="/tmp/wip-reviewed-${SESSION_ID}"
if [ -f "$MARKER" ]; then
  exit 0
fi

# Block: WIP assessment required
cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "WIP risk assessment required. Delegate to risk-scorer (subagent_type: 'risk-scorer') in WIP nudge mode to assess cumulative pipeline risk for changes so far."
  }
}
EOF
exit 0
