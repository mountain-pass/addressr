#!/bin/bash
# PreToolUse hook: Denies ExitPlanMode until all review specialists have
# reviewed the plan. Each agent determines relevance — the hook always checks.
# Uses dedicated plan review markers, not edit markers.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/review-gate.sh"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  review_gate_parse_error
  exit 0
fi

# Always check all review systems — the agents determine relevance, not the hook
MISSING=""

for SYSTEM in a11y voice-tone style-guide jtbd; do
  MARKER="/tmp/${SYSTEM}-plan-reviewed-${SESSION_ID}"
  if [ ! -f "$MARKER" ]; then
    case "$SYSTEM" in
      a11y)       AGENT="accessibility-agents:accessibility-lead" ;;
      voice-tone) AGENT="voice-and-tone-lead" ;;
      style-guide) AGENT="style-guide-lead" ;;
      jtbd)       AGENT="jtbd-lead" ;;
    esac
    if [ -z "$MISSING" ]; then
      MISSING="$AGENT"
    else
      MISSING="${MISSING}, ${AGENT}"
    fi
  fi
done

if [ -n "$MISSING" ]; then
  review_gate_deny "BLOCKED: Cannot approve plan without specialist review. Missing: ${MISSING}. Delegate to each agent to review the plan. Each agent will write PASS/FAIL to determine if the plan is relevant to their domain."
  exit 0
fi

exit 0
