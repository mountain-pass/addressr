#!/bin/bash
# UserPromptSubmit hook: Injects docs/BRIEFING.md on the FIRST prompt of
# a session only. Uses a session marker to avoid re-injecting on every prompt.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

_parse_input

SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

# Only inject once per session
MARKER="$(_risk_dir "$SESSION_ID")/briefing-injected"
if [ -f "$MARKER" ]; then
    exit 0
fi
touch "$MARKER"

BRIEFING_FILE="docs/BRIEFING.md"
if [ ! -f "$BRIEFING_FILE" ]; then
    exit 0
fi

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE" 2>/dev/null || exit 0)

BRIEFING_JSON=$(python3 -c "
import sys, json
content = sys.stdin.read()
print(json.dumps(content))
" <<< "$BRIEFING_CONTENT" 2>/dev/null || exit 0)

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": ${BRIEFING_JSON}
  }
}
EOF
exit 0
