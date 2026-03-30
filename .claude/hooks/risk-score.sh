#!/bin/bash
# UserPromptSubmit hook: Delegates risk scoring to the risk-scorer agent.
# Gathers full pipeline state via lib/pipeline-state.sh, injects instruction
# to call risk-scorer agent for commit + push + release scoring.
# Blocks scoring if RISK-POLICY.md is missing or stale (> 2 weeks).
# Absorbs WIP nudge warnings (stale files, unpushed count).

set -euo pipefail

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('session_id', ''))
" 2>/dev/null || echo "")

COMMIT_SCORE_FILE="/tmp/risk-commit-${SESSION_ID}"
PUSH_SCORE_FILE="/tmp/risk-push-${SESSION_ID}"
RELEASE_SCORE_FILE="/tmp/risk-release-${SESSION_ID}"
CHANGESET_SCORE_FILE="/tmp/risk-changeset-${SESSION_ID}"
CLEAN_FILE="/tmp/risk-clean-${SESSION_ID}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

# --- Rotate old risk reports (keep last 7 days) ---
if [ -d ".risk-reports" ]; then
    find .risk-reports -name '*.md' -mtime +7 -delete 2>/dev/null || true
fi

# --- Hash check: skip early if pipeline state unchanged since last prompt ---
# Computed BEFORE the expensive --all call to avoid wasting time on unchanged state.
if [ -n "$SESSION_ID" ]; then
    CURRENT_HASH=$("$SCRIPT_DIR/lib/pipeline-state.sh" --hash-inputs 2>/dev/null | _hashcmd | cut -d' ' -f1)
    HASH_FILE="/tmp/risk-state-hash-${SESSION_ID}"
    PREV_HASH=""
    if [ -f "$HASH_FILE" ]; then
        PREV_HASH=$(cat "$HASH_FILE")
    fi
    echo "$CURRENT_HASH" > "$HASH_FILE"

    if [ "$CURRENT_HASH" = "$PREV_HASH" ] && [ -n "$PREV_HASH" ]; then
        exit 0
    fi
fi

# --- Docs-only fast path: skip scoring for non-code changes ---
if [ -n "$SESSION_ID" ]; then
    FAST_DEFAULT_BRANCH=""
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
        FAST_DEFAULT_BRANCH="origin/main"
    elif git rev-parse --verify origin/master >/dev/null 2>&1; then
        FAST_DEFAULT_BRANCH="origin/master"
    fi
    if [ -n "$FAST_DEFAULT_BRANCH" ]; then
        EXCL=$(_doc_exclusions)
        NON_DOC_CHANGES=$(eval "git diff $FAST_DEFAULT_BRANCH --name-only -- $EXCL" 2>/dev/null || true)
        if [ -z "$NON_DOC_CHANGES" ]; then
            # All changes are docs-only — write score 1 and skip scoring
            printf '%s' '1' > "$COMMIT_SCORE_FILE"
            printf '%s' '1' > "$PUSH_SCORE_FILE"
            printf '%s' '1' > "$RELEASE_SCORE_FILE"
            printf '%s' '1' > "$CHANGESET_SCORE_FILE"
            touch "$CLEAN_FILE"
            exit 0
        fi
    fi
fi

# --- Gather full pipeline state (only runs if hash changed) ---
PIPELINE_STATE=$("$SCRIPT_DIR/lib/pipeline-state.sh" --all 2>/dev/null || echo "(pipeline state unavailable)")

# --- Clean tree? Write marker ---
# Score files are NOT cleared here — the scorer overwrites them, and stale scores
# are harmless (gates only fire for actions that exist). Session cleanup handles removal.
if echo "$PIPELINE_STATE" | grep -q "No uncommitted changes."; then
    if [ -n "$SESSION_ID" ]; then
        printf '1' > "$CLEAN_FILE"
    fi
    # Check if there's anything left to score (unpushed or unreleased)
    HAS_UNRELEASED=false
    if ! echo "$PIPELINE_STATE" | grep -q "No unreleased changes."; then
        if echo "$PIPELINE_STATE" | grep -qE "Pending changesets:|Accumulated unreleased diff"; then
            HAS_UNRELEASED=true
        fi
    fi
    HAS_UNPUSHED_OR_UNRELEASED=false
    if ! echo "$PIPELINE_STATE" | grep -q "No unpushed commits."; then
        HAS_UNPUSHED_OR_UNRELEASED=true
    fi
    if [ "$HAS_UNRELEASED" = true ]; then
        HAS_UNPUSHED_OR_UNRELEASED=true
    fi
    if [ "$HAS_UNPUSHED_OR_UNRELEASED" = false ]; then
        # Fully clean — nothing to score
        exit 0
    fi
fi

# Dirty tree: remove clean marker if it exists
if ! echo "$PIPELINE_STATE" | grep -q "No uncommitted changes."; then
    rm -f "$CLEAN_FILE"
fi

# --- Build WIP warnings (absorbed from wip-nudge.sh) ---
WARNINGS=""

# Stale files warning (check pipeline state section, not instruction text)
STALE_OUTPUT=$("$SCRIPT_DIR/lib/pipeline-state.sh" --stale 2>/dev/null || echo "")
if echo "$STALE_OUTPUT" | grep -q "uncommitted for over 24h"; then
    STALE_LINE=$(echo "$STALE_OUTPUT" | grep "uncommitted for over 24h" | head -1)
    WARNINGS="${WARNINGS}WIP: ${STALE_LINE}\n"
fi

# Unpushed commits warning
UNPUSHED_COUNT=$(echo "$PIPELINE_STATE" | sed -n 's/.*Unpushed commits (\([0-9]*\)).*/\1/p' | head -1)
UNPUSHED_COUNT="${UNPUSHED_COUNT:-0}"
if [ "$UNPUSHED_COUNT" -ge 3 ]; then
    WARNINGS="${WARNINGS}WIP: ${UNPUSHED_COUNT} unpushed commits on master. Consider running \`npm run push:watch\`.\n"
fi

# --- Check for existing high scores (nudge) ---
NUDGE=""
if [ -f "$COMMIT_SCORE_FILE" ]; then
    PREV_COMMIT=$(cat "$COMMIT_SCORE_FILE" 2>/dev/null || echo "")
    IS_HIGH=$(python3 -c "
try:
    print('yes' if float('$PREV_COMMIT') >= 5 else 'no')
except:
    print('no')
" 2>/dev/null || echo "no")
    if [ "$IS_HIGH" = "yes" ]; then
        NUDGE="${NUDGE}WARNING: Previous commit risk rating was ${PREV_COMMIT}/25. Reduce uncommitted changes before committing.\n"
    fi
fi

if [ -f "$PUSH_SCORE_FILE" ]; then
    PREV_PUSH=$(cat "$PUSH_SCORE_FILE" 2>/dev/null || echo "")
    IS_HIGH=$(python3 -c "
try:
    print('yes' if float('$PREV_PUSH') >= 5 else 'no')
except:
    print('no')
" 2>/dev/null || echo "no")
    if [ "$IS_HIGH" = "yes" ]; then
        NUDGE="${NUDGE}WARNING: Previous push risk rating was ${PREV_PUSH}/25. Consider pushing or reducing unpushed changes before continuing.\n"
    fi
fi

# --- Check for existing high release score (nudge) ---
if [ -f "$RELEASE_SCORE_FILE" ]; then
    PREV_RELEASE=$(cat "$RELEASE_SCORE_FILE" 2>/dev/null || echo "")
    IS_HIGH=$(python3 -c "
try:
    print('yes' if float('$PREV_RELEASE') >= 5 else 'no')
except:
    print('no')
" 2>/dev/null || echo "no")
    if [ "$IS_HIGH" = "yes" ]; then
        NUDGE="${NUDGE}WARNING: Previous release risk rating was ${PREV_RELEASE}/25. Consider releasing existing changes or reducing unreleased scope before continuing.\n"
    fi
fi

# --- Determine which actions to score ---
HAS_UNCOMMITTED=true
HAS_UNPUSHED=true
HAS_UNRELEASED_SCORE=false
if echo "$PIPELINE_STATE" | grep -q "No uncommitted changes."; then
    HAS_UNCOMMITTED=false
fi
if echo "$PIPELINE_STATE" | grep -q "No unpushed commits."; then
    HAS_UNPUSHED=false
fi
# Check for unreleased changes (pending changesets or diff between publish and master)
if ! echo "$PIPELINE_STATE" | grep -q "No unreleased changes."; then
    if echo "$PIPELINE_STATE" | grep -qE "Pending changesets:|Accumulated unreleased diff"; then
        HAS_UNRELEASED_SCORE=true
    fi
fi

# --- Pre-populate score files with PENDING sentinel ---
# Gates treat non-numeric values as deny (fail-closed). The scorer agent
# overwrites with the real numeric score. This ensures score files always
# exist after the hook runs, preventing "missing score" blocking while
# preserving fail-closed behavior (PENDING = deny until scored).
if [ -n "$SESSION_ID" ]; then
    if [ "$HAS_UNCOMMITTED" = true ]; then
        printf '%s' PENDING > "$COMMIT_SCORE_FILE"
        printf '%s' PENDING > "$PUSH_SCORE_FILE"
    fi
    if [ "$HAS_UNRELEASED_SCORE" = true ]; then
        printf '%s' PENDING > "$RELEASE_SCORE_FILE"
        printf '%s' PENDING > "$CHANGESET_SCORE_FILE"
    fi
fi

SCORE_INSTRUCTIONS=""
if [ "$HAS_UNCOMMITTED" = true ]; then
    SCORE_INSTRUCTIONS="Score COMMIT risk. Write commit residual risk rating to: ${COMMIT_SCORE_FILE}
MANDATORY Bash command (execute FIRST, before reports): printf '%s' N > ${COMMIT_SCORE_FILE}"
fi

if [ "$HAS_UNPUSHED" = true ] || [ "$HAS_UNCOMMITTED" = true ]; then
    SCORE_INSTRUCTIONS="${SCORE_INSTRUCTIONS}

Score PUSH risk (the accumulated unpushed changes, including any uncommitted work that would be committed). Write push residual risk rating to: ${PUSH_SCORE_FILE}
MANDATORY Bash command (execute FIRST, before reports): printf '%s' N > ${PUSH_SCORE_FILE}"
fi

if [ "$HAS_UNRELEASED_SCORE" = true ]; then
    SCORE_INSTRUCTIONS="${SCORE_INSTRUCTIONS}

Score RELEASE risk (the accumulated unreleased changes that would be deployed if the release PR is merged). Write release residual risk rating to: ${RELEASE_SCORE_FILE}
MANDATORY Bash command (execute FIRST, before reports): printf '%s' N > ${RELEASE_SCORE_FILE}

Score CHANGESET risk (the risk of creating a changeset, which would allow the accumulated changes on main to go into release preview). Write changeset residual risk rating to: ${CHANGESET_SCORE_FILE}
MANDATORY Bash command (execute FIRST, before reports): printf '%s' N > ${CHANGESET_SCORE_FILE}"
fi

# --- Check RISK-POLICY.md existence and staleness ---
POLICY_MISSING=false
POLICY_STALE=""
if [ ! -f "RISK-POLICY.md" ] || [ ! -s "RISK-POLICY.md" ]; then
    POLICY_MISSING=true
else
    REVIEWED_DATE=$(grep -m1 'Last reviewed:' RISK-POLICY.md 2>/dev/null | sed 's/.*Last reviewed:[* ]*//' | sed 's/[* ]*$//' || echo "")
    if [ -n "$REVIEWED_DATE" ]; then
        POLICY_STALE=$(python3 -c "
from datetime import date
try:
    reviewed = date.fromisoformat('$REVIEWED_DATE'.strip())
    age_days = (date.today() - reviewed).days
    print('yes' if age_days > 14 else 'no')
except:
    print('no')
" 2>/dev/null || echo "no")
    fi
fi

# --- Build the instruction ---
POLICY_BLOCK_INSTRUCTION=""
if [ "$POLICY_MISSING" = true ]; then
    POLICY_BLOCK_INSTRUCTION="MISSING RISK POLICY: RISK-POLICY.md does not exist or is empty. You MUST run the /risk-policy skill to create it BEFORE running the risk-scorer agent. Use the Skill tool with skill: \"risk-policy\". After the policy is created, proceed with risk scoring.\n\n"
    WARNINGS="${WARNINGS}RISK POLICY: Missing. Must be created before risk scoring can proceed.\n"
elif [ "$POLICY_STALE" = "yes" ]; then
    POLICY_BLOCK_INSTRUCTION="STALE RISK POLICY: RISK-POLICY.md was last reviewed on ${REVIEWED_DATE} (over 2 weeks ago). You MUST run the /risk-policy skill to update it BEFORE running the risk-scorer agent. Use the Skill tool with skill: \"risk-policy\". After the policy is updated, proceed with risk scoring.\n\n"
    WARNINGS="${WARNINGS}RISK POLICY: Last reviewed ${REVIEWED_DATE} -- over 2 weeks ago. Will be updated before scoring.\n"
fi

INSTRUCTION="${WARNINGS}${NUDGE}${POLICY_BLOCK_INSTRUCTION}RISK SCORE CHECK (mandatory, every prompt).

You MUST call the risk-scorer agent (subagent_type: \"risk-scorer\") with this prompt:

Produce risk reports for the following pipeline state.

${PIPELINE_STATE}

${SCORE_INSTRUCTIONS}

After the agent returns, include the full risk reports in your response.

IMPORTANT: If you are about to perform a gated action (git commit, npm run push:watch, npm run release:watch, npx changeset, or ExitPlanMode), run the risk-scorer in the FOREGROUND (not background) so the score files exist before the gate fires. Background scoring is fine for informational prompts where no gated action is imminent."

# --- Output ---
ESCAPED=$(echo -e "$INSTRUCTION" | python3 -c "
import sys, json
text = sys.stdin.read().strip()
print(json.dumps(text))
" 2>/dev/null || echo '""')

# Include WIP warnings as systemMessage if present
if [ -n "$WARNINGS" ]; then
    SYSTEM_MSG=$(echo -e "$WARNINGS" | python3 -c "
import sys, json
text = sys.stdin.read().strip()
print(json.dumps(text))
" 2>/dev/null || echo '""')
    cat <<EOF
{
  "systemMessage": $SYSTEM_MSG,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": $ESCAPED
  }
}
EOF
else
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": $ESCAPED
  }
}
EOF
fi
