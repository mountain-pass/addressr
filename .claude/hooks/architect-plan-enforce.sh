#!/bin/bash
# Architecture - PreToolUse enforcement hook for ExitPlanMode
# BLOCKS ExitPlanMode until architect has reviewed the plan against ADRs.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/architect-gate.sh"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  architect_gate_parse_error
  exit 0
fi

# Only check if the architect agent exists
if [ ! -f ".claude/agents/architect.md" ]; then
  exit 0
fi

# Check gate
if check_architect_gate "$SESSION_ID"; then
  exit 0
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: Architect must review the plan file before exiting plan mode. You MUST first delegate to architect using the Agent tool (subagent_type: 'architect') to review the plan against existing decisions in docs/decisions/. After the review completes, this will be unblocked automatically."
  }
}
EOF
exit 0
