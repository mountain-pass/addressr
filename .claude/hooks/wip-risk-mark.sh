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

MARKER="$(_risk_dir "$SESSION_ID")/wip-reviewed"

case "$TOOL_NAME" in
  Edit|Write)
    FILE_PATH=$(_get_file_path)
    [ -n "$FILE_PATH" ] || exit 0

    if ! _is_doc_file "$FILE_PATH"; then
        rm -f "$MARKER"
    fi
    ;;
  # Agent case handled by risk-score-mark.sh
esac

exit 0
