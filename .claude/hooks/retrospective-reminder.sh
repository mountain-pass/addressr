#!/bin/bash
# Stop hook: Reminds the user to run /retrospective before ending the session.

cat <<'EOF'
{
  "stopReason": "Before ending: run /retrospective to capture session learnings, update docs/BRIEFING.md, and use the /problem skill to create problem tickets for anything that failed or was harder than it should have been."
}
EOF
exit 0
