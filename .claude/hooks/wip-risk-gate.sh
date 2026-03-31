#!/bin/bash
# PreToolUse hook: Blocks Edit/Write on non-doc files until WIP risk
# assessment has been completed by the risk-scorer in WIP nudge mode.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"
_enable_err_trap

_parse_input

TOOL_NAME=$(_get_tool_name)
case "$TOOL_NAME" in
  Edit|Write) ;;
  *) exit 0 ;;
esac

FILE_PATH=$(_get_file_path)
[ -n "$FILE_PATH" ] || exit 0

# Skip doc/governance files
if _is_doc_file "$FILE_PATH"; then
    exit 0
fi

SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

MARKER="$(_risk_dir "$SESSION_ID")/wip-reviewed"
if [ -f "$MARKER" ]; then
    exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "WIP risk assessment required. Delegate to risk-scorer-wip (subagent_type: 'risk-scorer-wip') to assess cumulative pipeline risk for changes so far."
  }
}
EOF
exit 0
