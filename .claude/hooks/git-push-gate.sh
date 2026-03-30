#!/bin/bash
# PreToolUse hook for pipeline discipline:
# - Blocks bare `git push` and directs to npm run push:watch.
# - Gates `npm run push:watch` on push risk score (TTL + drift + threshold).
# - Gates `npx changeset` / `npm run changeset` on release + push risk (back-pressure).
# - Gates `npm run release:watch` on release risk score (TTL + drift + threshold).
# - Blocks `gh pr merge` and directs to npm run release:watch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/risk-gate.sh"

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_name', ''))
except:
    print('')
" 2>/dev/null || echo "")

[ "$TOOL_NAME" = "Bash" ] || exit 0

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null || echo "")

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('session_id', ''))
except:
    print('')
" 2>/dev/null || echo "")

# Block git push to master/main/publish/changeset-release/*, or bare git push.
# Allow explicit pushes to other branches (feature branches etc).
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*git push(\s|$)'; then
    # Allow if pushing to an explicit branch that isn't a protected/managed branch
    if echo "$COMMAND" | grep -qE 'git push\s+\S+\s+\S+' && \
       ! echo "$COMMAND" | grep -qE 'git push\s+\S+\s+(master|main|publish|changeset-release/)'; then
        exit 0
    fi
    risk_gate_deny "Use \`npm run push:watch\` instead of \`git push\`. It pushes, watches the pipeline, and then surfaces either the release PR URL (if there are pending changesets) or the test deploy URL so you can review before releasing. The publish and changeset-release/* branches are managed by the pipeline -- do not push to them directly."
    exit 0
fi

# Gate push:watch on push risk score
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*npm run push:watch(\s|$)'; then
    if [ -n "$SESSION_ID" ]; then
        # Clean tree bypass: if no uncommitted changes, pushing existing commits is safe
        CLEAN_FILE="/tmp/risk-clean-${SESSION_ID}"
        if [ -f "$CLEAN_FILE" ]; then
            exit 0
        fi
        # Push gate: check score existence, TTL, and threshold only.
        # Skip drift detection because a prior commit in the same prompt
        # changes git diff origin/main (content moves from uncommitted to
        # unpushed), and a prior push advances origin/main entirely.
        # The commit gate already enforced drift detection before committing.
        PUSH_SCORE_FILE="/tmp/risk-push-${SESSION_ID}"
        if [ ! -f "$PUSH_SCORE_FILE" ]; then
            risk_gate_deny "Push blocked: No push risk score found. Delegate to risk-scorer (subagent_type: 'risk-scorer') to assess the accumulated unpushed changes and their projected release risk."
            exit 0
        fi
        PUSH_NOW=$(date +%s)
        PUSH_SCORE_TIME=$(_mtime "$PUSH_SCORE_FILE")
        PUSH_AGE=$(( PUSH_NOW - PUSH_SCORE_TIME ))
        PUSH_TTL="${RISK_TTL:-1800}"
        if [ "$PUSH_AGE" -ge "$PUSH_TTL" ]; then
            risk_gate_deny "Push blocked: Push risk score expired (${PUSH_AGE}s old, TTL ${PUSH_TTL}s). Submit a new prompt to rescore."
            exit 0
        fi
        PUSH_SCORE=$(cat "$PUSH_SCORE_FILE" 2>/dev/null || echo "")
        # Validate score is numeric (fail-closed: PENDING or invalid = deny)
        if ! echo "$PUSH_SCORE" | grep -qE '^[0-9]+(\.[0-9]+)?$'; then
            risk_gate_deny "Push blocked: Push risk score is not yet available (scoring in progress). Wait a moment and retry, or submit a new prompt."
            exit 0
        fi
        PUSH_DENIED=$(python3 -c "print('yes' if float('${PUSH_SCORE}') >= 5 else 'no')" 2>/dev/null || echo "no")
        if [ "$PUSH_DENIED" = "yes" ]; then
            risk_gate_deny "Push blocked: Push risk score ${PUSH_SCORE}/25 (Medium or above). The accumulated changes would push projected release risk above appetite. To proceed, consider: (1) release the current unreleased queue first via \`npm run release:watch\`, (2) split the push into smaller batches, or (3) add risk-reducing measures (tests, rollback procedures) before pushing."
            exit 0
        fi
    fi
    exit 0
fi

# Gate changeset creation on changeset risk score
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*(npx changeset|npm run changeset)(\s|$)'; then
    if [ -n "$SESSION_ID" ]; then
        # Permissive on missing: only gate if changeset score exists
        if risk_score_exists "$SESSION_ID" "changeset"; then
            if ! check_risk_gate "$SESSION_ID" "changeset"; then
                risk_gate_deny "Changeset blocked: ${RISK_GATE_REASON}"
                exit 0
            fi
        fi
    fi
    exit 0
fi

# Gate release:watch on release risk score
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*npm run release:watch(\s|$)'; then
    if [ -n "$SESSION_ID" ]; then
        if ! check_risk_gate "$SESSION_ID" "release"; then
            risk_gate_deny "Release blocked: ${RISK_GATE_REASON}. The accumulated unreleased changes carry risk above appetite. To proceed, consider: (1) split the release into smaller batches by reverting some changesets and releasing incrementally, (2) add risk-reducing measures (additional tests covering the riskiest changes, manual smoke tests against a local OpenSearch instance), or (3) accept the risk explicitly by re-running the risk-scorer with acknowledgement."
            exit 0
        fi
    fi
    exit 0
fi

# Match gh pr merge. Should go via npm run release:watch instead.
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*gh pr merge(\s|$)'; then
    risk_gate_deny "Use \`npm run release:watch\` instead of \`gh pr merge\`. It merges the release PR, watches the publish pipeline, and surfaces the production URL when live -- or tells you what failed and how to fix it."
    exit 0
fi

exit 0
