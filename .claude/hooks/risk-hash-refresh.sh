#!/bin/bash
# PostToolUse:Bash hook — refreshes the pipeline state hash after git add.
# Eliminates the "stage before prompt" protocol: when files are staged within
# a prompt, the hash stays current so the commit gate doesn't detect false drift.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty') || true

# Only act on git add commands
echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*git add' || exit 0

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true
[ -n "$SESSION_ID" ] || exit 0

HASH_FILE="/tmp/risk-state-hash-${SESSION_ID}"
[ -f "$HASH_FILE" ] || exit 0  # No hash file yet — scorer hasn't run

CURRENT_HASH=$("$SCRIPT_DIR/lib/pipeline-state.sh" --hash-inputs 2>/dev/null | _hashcmd | cut -d' ' -f1)
if [ -n "$CURRENT_HASH" ]; then
  echo "$CURRENT_HASH" > "$HASH_FILE"
fi

exit 0
