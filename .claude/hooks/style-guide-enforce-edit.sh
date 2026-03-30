#!/bin/bash
# Style Guide - PreToolUse enforcement hook
# BLOCKS Edit/Write to UI source files until style-guide-lead is consulted.
# Uses shared review-gate.sh for TTL, drift detection, and fail-closed.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/review-gate.sh"

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null || echo "")

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('session_id', ''))
except:
    print('')
" 2>/dev/null || echo "")

if [ -z "$SESSION_ID" ]; then
  review_gate_parse_error
  exit 0
fi

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Gate all UI source files (CSS and component files)
case "$FILE_PATH" in
  *.css|*.html|*.jsx|*.tsx|*.vue|*.svelte|*.ejs|*.hbs) ;;
  *) exit 0 ;;
esac

# Check gate with TTL + drift detection
if check_review_gate "$SESSION_ID" "style-guide" "docs/STYLE-GUIDE.md"; then
  exit 0
fi

BASENAME=$(basename "$FILE_PATH")
review_gate_deny "BLOCKED: Cannot edit '${BASENAME}' without style guide review. You MUST first delegate to style-guide-lead using the Agent tool (subagent_type: 'style-guide-lead'). ${REVIEW_GATE_REASON}"
exit 0
