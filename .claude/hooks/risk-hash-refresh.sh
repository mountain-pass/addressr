#!/bin/bash
# PostToolUse:Bash hook — refreshes the pipeline state hash after git add.
# Eliminates the "stage before prompt" protocol: when files are staged within
# a prompt, the hash stays current so the commit gate doesn't detect false drift.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

_parse_input

COMMAND=$(_get_command)

# Only act on commands that change git state
echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*git (add|commit|stash|reset|checkout|restore)' || exit 0

SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

RDIR=$(_risk_dir "$SESSION_ID")
HASH_FILE="${RDIR}/state-hash"
[ -f "$HASH_FILE" ] || exit 0  # No hash file yet — scorer hasn't run

CURRENT_HASH=$("$SCRIPT_DIR/lib/pipeline-state.sh" --hash-inputs 2>/dev/null | _hashcmd | cut -d' ' -f1)
if [ -n "$CURRENT_HASH" ]; then
  echo "$CURRENT_HASH" > "$HASH_FILE"
fi

exit 0
