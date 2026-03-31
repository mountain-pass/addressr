#!/bin/bash
# PostToolUse hook: Manages the WIP-reviewed marker.
# - After Edit/Write on non-doc files: clears the marker (blocks next edit)
# - After Agent (risk-scorer) completion: creates the marker (unblocks next edit)

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

case "$TOOL_NAME" in
  Edit|Write)
    # Extract the file path
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

    # Check if the file is doc/governance (excluded from WIP gating)
    IS_DOC=false
    EXCL=$(_doc_exclusions)
    for pattern in $EXCL; do
      clean="${pattern#:!}"
      case "$FILE_PATH" in
        *"$clean"*) IS_DOC=true; break ;;
      esac
    done
    case "$FILE_PATH" in
      *.claude/*|*.risk-reports/*|*RISK-POLICY.md) IS_DOC=true ;;
    esac

    if [ "$IS_DOC" = false ]; then
      # Non-doc edit: clear the marker so next edit is blocked
      rm -f "$MARKER"
    fi
    ;;

  Agent)
    # Check if risk-scorer completed WIP nudge mode
    SUBAGENT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('subagent_type', ''))
except:
    print('')
" 2>/dev/null || echo "")

    case "$SUBAGENT" in
      *risk-scorer*)
        VERDICT_FILE="/tmp/wip-nudge-verdict"
        if [ -f "$VERDICT_FILE" ]; then
          rm -f "$VERDICT_FILE"
          touch "$MARKER"
        fi
        ;;
    esac
    ;;
esac

exit 0
