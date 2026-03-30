#!/bin/bash
# PreToolUse hook: Denies Edit/Write to RISK-POLICY.md unless the
# /risk-policy skill has been engaged (marker file exists).
# Mirrors: architect-enforce-edit.sh

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty') || true
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ] || [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only gate RISK-POLICY.md
BASENAME=$(basename "$FILE_PATH")
if [ "$BASENAME" != "RISK-POLICY.md" ]; then
  exit 0
fi

# Check for marker
MARKER="/tmp/risk-policy-reviewed-${SESSION_ID}"
if [ -f "$MARKER" ]; then
  exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: Cannot edit RISK-POLICY.md directly. Run the /risk-policy skill first -- it enforces ISO 31000 compliance (reads the risk-scorer contract, discovers project context, checks for incidents, validates with you, and smoke-tests the result). Use the Skill tool with skill: \"risk-policy\"."
  }
}
EOF
exit 0
