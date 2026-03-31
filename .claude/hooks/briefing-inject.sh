#!/bin/bash
# UserPromptSubmit hook: Injects docs/BRIEFING.md on the FIRST prompt of
# a session only. Uses a session marker to avoid re-injecting on every prompt.

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

# Only inject once per session
MARKER="/tmp/briefing-injected-${SESSION_ID}"
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
