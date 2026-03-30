#!/bin/bash
# PreToolUse hook: Blocks Edit/Write if content contains secret patterns.
# Mitigates WR-R2 (Secret leakage risk).

set -euo pipefail

INPUT=$(cat)

# Extract the content being written — check both "new_string" (Edit) and "content" (Write)
CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool_input = data.get('tool_input', {})
    text = tool_input.get('new_string', '') + tool_input.get('content', '')
    print(text)
except:
    print('')
" 2>/dev/null || echo "")

if [ -z "$CONTENT" ]; then
    exit 0
fi

# Check for secret patterns
MATCHED=""

# AWS access keys
if echo "$CONTENT" | grep -qE 'AKIA[0-9A-Z]{16}'; then
    MATCHED="AWS access key"
fi

# Private keys
if echo "$CONTENT" | grep -qE 'BEGIN[[:space:]]+(RSA|DSA|EC|OPENSSH|PGP)?[[:space:]]*PRIVATE KEY'; then
    MATCHED="private key"
fi

# GitHub tokens
if echo "$CONTENT" | grep -qE 'gh[pousr]_[A-Za-z0-9_]{36,}'; then
    MATCHED="GitHub token"
fi

# Generic API key/secret/token assignments with actual values (not variable references)
if echo "$CONTENT" | grep -qEi '(api_key|api_secret|auth_key|auth_token|secret_key)[[:space:]]*[=:][[:space:]]*["\x27][A-Za-z0-9+/=_-]{16,}'; then
    MATCHED="API key/secret assignment"
fi

# Cloudflare auth key pattern (specific to this project's legacy scripts)
if echo "$CONTENT" | grep -qE 'X-Auth-Key:[[:space:]]*[A-Za-z0-9]{30,}'; then
    MATCHED="Cloudflare auth key"
fi

# Netlify auth token
if echo "$CONTENT" | grep -qE 'NETLIFY_AUTH_TOKEN[[:space:]]*[=:][[:space:]]*["\x27][A-Za-z0-9_-]{16,}'; then
    MATCHED="Netlify auth token"
fi

if [ -n "$MATCHED" ]; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED (WR-R2): Detected probable $MATCHED in file content. Do not write secrets to files — use environment variables or CI secrets instead."
  }
}
EOF
    exit 0
fi

# No secrets detected — allow
exit 0
