#!/bin/bash
# UserPromptSubmit hook: Checks project health and injects reminders.

set -euo pipefail

REMINDERS=""

# Check: No GitHub Actions workflows
if [ ! -d ".github/workflows" ] || [ -z "$(ls -A .github/workflows 2>/dev/null)" ]; then
    REMINDERS="${REMINDERS}REMINDER: No GitHub Actions workflows exist in this repo. The CI pipeline needs to be set up. See RISK_REGISTER.md.\n"
fi

# Check: Detect npm install/add commands in user prompt to remind about audit
INPUT=$(cat)
USER_PROMPT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('prompt', ''))
except:
    print('')
" 2>/dev/null || echo "")

if echo "$USER_PROMPT" | grep -qEi 'npm (install|add|i )|yarn add|pnpm add|upgrade|update dep|add dep'; then
    REMINDERS="${REMINDERS}REMINDER: When adding or updating dependencies, run \`npm audit\` afterwards to check for known vulnerabilities. See RISK_REGISTER.md.\n"
fi

# Output reminders if any
if [ -n "$REMINDERS" ]; then
    # Escape for JSON
    ESCAPED=$(echo -e "$REMINDERS" | python3 -c "
import sys, json
text = sys.stdin.read().strip()
print(json.dumps(text))
" 2>/dev/null || echo '""')

    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "systemReminder": $ESCAPED
  }
}
EOF
    exit 0
fi

# No reminders needed
exit 0
