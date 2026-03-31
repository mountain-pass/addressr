#!/bin/bash
# UserPromptSubmit hook: No-op.
# Risk scoring is triggered by Edit/Write (WIP nudge gate) and gated actions
# (commit/push/release gates). This hook is retained only for the session
# marker lifecycle — creating the WIP marker so the first edit isn't blocked.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

_parse_input

SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

# Create WIP marker so first edit of the session isn't blocked
RDIR=$(_risk_dir "$SESSION_ID")
WIP_MARKER="${RDIR}/wip-reviewed"
if [ ! -f "$WIP_MARKER" ]; then
    touch "$WIP_MARKER"
fi

# Rotate old risk reports (keep last 7 days)
if [ -d ".risk-reports" ]; then
    find .risk-reports -name '*.md' -mtime +7 -delete 2>/dev/null || true
fi

exit 0
