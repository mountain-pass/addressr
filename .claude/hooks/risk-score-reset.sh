#!/bin/bash
# Stop hook: Clears risk score temp files on session end.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

_parse_input

SESSION_ID=$(_get_session_id)

if [ -n "$SESSION_ID" ]; then
    # Remove the entire session-scoped directory
    RDIR="${TMPDIR:-/tmp}/claude-risk-${SESSION_ID}"
    rm -rf "$RDIR"
fi

exit 0
