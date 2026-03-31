#!/bin/bash
# PreToolUse hook: Fires on EnterPlanMode to inject release risk context.
# Provides preemptive guidance so the plan author knows the unreleased queue
# state and release risk before writing the plan.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"
_enable_err_trap

_parse_input

SESSION_ID=$(_get_session_id)

# --- Gather pipeline state summary ---
UNRELEASED_SUMMARY=""
if [ -x "$SCRIPT_DIR/lib/pipeline-state.sh" ]; then
  UNRELEASED_SUMMARY=$("$SCRIPT_DIR/lib/pipeline-state.sh" --unreleased 2>/dev/null | head -20 || echo "Unable to determine unreleased changes.")
fi

# --- Check for existing release risk score ---
RELEASE_SCORE="not yet scored"
RDIR=$(_risk_dir "$SESSION_ID")
RELEASE_SCORE_FILE="${RDIR}/release"
if [ -n "$SESSION_ID" ] && [ -f "$RELEASE_SCORE_FILE" ]; then
  SCORE_VAL=$(cat "$RELEASE_SCORE_FILE" 2>/dev/null || echo "")
  if [[ "$SCORE_VAL" =~ ^[0-9]+$ ]]; then
    RELEASE_SCORE="${SCORE_VAL}/25"
  fi
fi

# --- Read appetite from RISK-POLICY.md ---
APPETITE="5"
if [ -f "RISK-POLICY.md" ]; then
  EXTRACTED=$(grep -oP 'Threshold:\s*\K[0-9]+' RISK-POLICY.md 2>/dev/null | head -1 || echo "")
  if [ -n "$EXTRACTED" ]; then
    APPETITE="$EXTRACTED"
  fi
fi

# --- Emit guidance (allow — advisory only, not a gate) ---
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "systemMessage": "RELEASE RISK GUIDANCE FOR PLANNING:\nThe unreleased queue currently contains:\n${UNRELEASED_SUMMARY}\n\nCurrent release risk score: ${RELEASE_SCORE}.\nRisk appetite threshold: ${APPETITE} (Medium).\n\nYour plan MUST account for projected release risk. If the plan's proposed changes would push projected release risk above appetite when combined with the existing unreleased queue, the plan MUST include one or more of:\n- Release the current unreleased queue first (before implementing the plan)\n- Split the plan into smaller batches that keep projected release risk within appetite\n- Include specific risk-reducing steps (additional tests, rollback procedures)\n\nThe risk-scorer will assess projected release risk at ExitPlanMode and FAIL plans that exceed appetite without a release strategy."
  }
}
EOF
exit 0
