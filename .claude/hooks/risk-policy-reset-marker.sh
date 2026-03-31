#!/bin/bash
# Stop hook: Clears risk-policy session marker.
# Mirrors: architect-reset-marker.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

_parse_input

SESSION_ID=$(_get_session_id)

if [ -n "$SESSION_ID" ]; then
  RDIR=$(_risk_dir "$SESSION_ID")
  rm -f "${RDIR}/policy-reviewed" "${RDIR}/plan-reviewed"
fi

exit 0
