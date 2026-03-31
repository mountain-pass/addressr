#!/bin/bash
# PostToolUse hook: Manages the WIP-reviewed marker.
# - After Edit/Write on non-doc files: clears the marker (blocks next edit)
# - After Agent (risk-scorer) completion: creates the marker (unblocks next edit)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"
_enable_err_trap

_parse_input

TOOL_NAME=$(_get_tool_name)
SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

MARKER="/tmp/wip-reviewed-${SESSION_ID}"

case "$TOOL_NAME" in
  Edit|Write)
    FILE_PATH=$(_get_file_path)
    [ -n "$FILE_PATH" ] || exit 0

    if ! _is_doc_file "$FILE_PATH"; then
        rm -f "$MARKER"
    fi
    ;;

  Agent)
    SUBAGENT=$(_get_subagent_type)
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
