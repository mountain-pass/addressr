#!/bin/bash
# PreToolUse hook: Denies ExitPlanMode until review specialists have
# reviewed the plan. Skips UI specialists (a11y, voice-tone, style-guide,
# jtbd) when the plan only touches non-UI files (P008 optimization).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/review-gate.sh"
source "$SCRIPT_DIR/lib/gate-helpers.sh"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty') || true

if [ -z "$SESSION_ID" ]; then
  review_gate_parse_error
  exit 0
fi

# Detect if the plan touches UI files by checking uncommitted changes
# UI patterns: *.html, *.jsx, *.tsx, *.vue, *.svelte, *.astro, *.css, *.scss
HAS_UI_FILES=false
UI_PATTERNS='\.html$|\.jsx$|\.tsx$|\.vue$|\.svelte$|\.astro$|\.css$|\.scss$|\.ejs$|\.hbs$|\.erb$|\.leaf$'
if git diff --cached --name-only 2>/dev/null | grep -qE "$UI_PATTERNS"; then
    HAS_UI_FILES=true
elif git diff --name-only 2>/dev/null | grep -qE "$UI_PATTERNS"; then
    HAS_UI_FILES=true
elif git ls-files --others --exclude-standard 2>/dev/null | grep -qE "$UI_PATTERNS"; then
    HAS_UI_FILES=true
fi

# Also check the plan file itself for mentions of UI files
PLAN_DIR="$HOME/.claude/plans"
if [ -d "$PLAN_DIR" ] && [ "$HAS_UI_FILES" = false ]; then
    LATEST_PLAN=$(ls -t "$PLAN_DIR"/*.md 2>/dev/null | head -1)
    if [ -n "$LATEST_PLAN" ] && grep -qiE '\.html|\.jsx|\.tsx|\.vue|\.svelte|\.css|component|page|form|modal|dialog' "$LATEST_PLAN" 2>/dev/null; then
        HAS_UI_FILES=true
    fi
fi

MISSING=""

if [ "$HAS_UI_FILES" = true ]; then
    # UI files detected — require all specialists
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
else
    # No UI files — skip a11y, voice-tone, style-guide, jtbd
    # Auto-create their markers so the gate passes
    for SYSTEM in a11y voice-tone style-guide jtbd; do
        touch "/tmp/${SYSTEM}-plan-reviewed-${SESSION_ID}"
    done
fi

if [ -n "$MISSING" ]; then
  review_gate_deny "BLOCKED: Cannot approve plan without specialist review. Missing: ${MISSING}. Delegate to each agent to review the plan."
  exit 0
fi

exit 0
