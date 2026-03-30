#!/bin/bash
# Accessibility - PreToolUse enforcement hook
# BLOCKS Edit/Write to UI files until accessibility-lead is consulted.
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

# Gate UI files
IS_UI=false
case "$FILE_PATH" in
  *.jsx|*.tsx|*.vue|*.svelte|*.astro|*.html|*.ejs|*.hbs|*.leaf|*.erb|*.jinja|*.twig|*.blade.php)
    IS_UI=true ;;
  *.css|*.scss|*.less|*.sass)
    IS_UI=true ;;
esac

if [ "$IS_UI" = false ]; then
  case "$FILE_PATH" in
    */components/*|*/pages/*|*/views/*|*/layouts/*|*/templates/*)
      case "$FILE_PATH" in
        *.ts|*.js) IS_UI=true ;;
      esac ;;
  esac
fi

if [ "$IS_UI" = false ]; then
  exit 0
fi

# Check gate with TTL + drift detection (policy file is CLAUDE.md)
if check_review_gate "$SESSION_ID" "a11y" "CLAUDE.md"; then
  exit 0
fi

BASENAME=$(basename "$FILE_PATH")
review_gate_deny "BLOCKED: Cannot edit UI file '${BASENAME}' without accessibility review. You MUST first delegate to accessibility-agents:accessibility-lead using the Agent tool (subagent_type: 'accessibility-agents:accessibility-lead'). ${REVIEW_GATE_REASON}"
exit 0
