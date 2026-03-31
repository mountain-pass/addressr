#!/bin/bash
# UserPromptSubmit hook: Injects docs/BRIEFING.md as context at the start
# of every conversation. This provides institutional knowledge that isn't
# obvious from the code alone.

set -euo pipefail

BRIEFING_FILE="docs/BRIEFING.md"

if [ ! -f "$BRIEFING_FILE" ]; then
    exit 0
fi

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE" 2>/dev/null || exit 0)

# Escape for JSON
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
