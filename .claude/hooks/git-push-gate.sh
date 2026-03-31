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
_enable_err_trap

_parse_input

TOOL_NAME=$(_get_tool_name)
[ "$TOOL_NAME" = "Bash" ] || exit 0

COMMAND=$(_get_command)
SESSION_ID=$(_get_session_id)

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
        RDIR=$(_risk_dir "$SESSION_ID")
        # Risk-reducing/neutral bypass for push
        if [ -f "${RDIR}/reducing-push" ]; then
            rm -f "${RDIR}/reducing-push"
            exit 0
        fi
        # Clean tree bypass: if no uncommitted changes, pushing existing commits is safe
        if [ -f "${RDIR}/clean" ]; then
            exit 0
        fi
        PUSH_SCORE_FILE="${RDIR}/push"
        if [ ! -f "$PUSH_SCORE_FILE" ]; then
            risk_gate_deny "Push blocked: No push risk score found. Delegate to risk-scorer-pipeline (subagent_type: 'risk-scorer-pipeline') to assess cumulative pipeline risk."
            exit 0
        fi
        PUSH_NOW=$(date +%s)
        PUSH_SCORE_TIME=$(_mtime "$PUSH_SCORE_FILE")
        PUSH_AGE=$(( PUSH_NOW - PUSH_SCORE_TIME ))
        PUSH_TTL="${RISK_TTL:-1800}"
        if [ "$PUSH_AGE" -ge "$PUSH_TTL" ]; then
            risk_gate_deny "Push blocked: Push risk score expired (${PUSH_AGE}s old, TTL ${PUSH_TTL}s). Delegate to risk-scorer to rescore."
            exit 0
        fi
        PUSH_SCORE=$(cat "$PUSH_SCORE_FILE" 2>/dev/null || echo "")
        if ! echo "$PUSH_SCORE" | grep -qE '^[0-9]+(\.[0-9]+)?$'; then
            risk_gate_deny "Push blocked: Push risk score is not yet available (scoring in progress). Wait a moment and retry."
            exit 0
        fi
        PUSH_DENIED=$(python3 -c "print('yes' if float('${PUSH_SCORE}') >= 5 else 'no')" 2>/dev/null || echo "no")
        if [ "$PUSH_DENIED" = "yes" ]; then
            risk_gate_deny "Push blocked: Push risk score ${PUSH_SCORE}/25 (Medium or above). To proceed: (1) release first via \`npm run release:watch\`, (2) split the push, or (3) add risk-reducing measures. If risk-neutral or risk-reducing, delegate to risk-scorer-pipeline (subagent_type: 'risk-scorer-pipeline') — it will create a bypass marker."
            exit 0
        fi
    fi
    exit 0
fi

# Gate changeset creation on release risk score (fail-closed).
# Changesets feed directly into releases, so gate on the release score.
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*(npx changeset|npm run changeset)(\s|$)'; then
    if [ -n "$SESSION_ID" ]; then
        if ! check_risk_gate "$SESSION_ID" "release"; then
            risk_gate_deny "Changeset blocked: ${RISK_GATE_REASON}"
            exit 0
        fi
    fi
    exit 0
fi

# Gate release:watch on release risk score
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\|)\s*npm run release:watch(\s|$)'; then
    if [ -n "$SESSION_ID" ]; then
        RDIR=$(_risk_dir "$SESSION_ID")
        # Live-incident bypass: if an incident marker exists, allow release
        # regardless of risk score. Used when addressing outages, security
        # incidents, or information disclosure that requires immediate deployment.
        if [ -f "${RDIR}/incident-release" ]; then
            rm -f "${RDIR}/incident-release"
            exit 0
        fi
        # Risk-reducing bypass for release
        if [ -f "${RDIR}/reducing-release" ]; then
            rm -f "${RDIR}/reducing-release"
            exit 0
        fi
        if ! check_risk_gate "$SESSION_ID" "release"; then
            risk_gate_deny "Release blocked: ${RISK_GATE_REASON}. To proceed: (1) split the release, (2) add risk-reducing measures, or (3) for a LIVE INCIDENT, delegate to risk-scorer-pipeline (subagent_type: 'risk-scorer-pipeline') with incident context for an incident bypass."
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
