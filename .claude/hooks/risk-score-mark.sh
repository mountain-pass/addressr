#!/bin/bash
# PostToolUse:Agent hook: Deterministically writes all risk score files,
# verdict markers, and bypass markers by parsing structured output from
# risk-scorer agents. This is the ONLY place score files are written —
# agents output structured markers, this hook writes the files.
#
# Handles: risk-scorer-pipeline, risk-scorer-plan, risk-scorer-wip, risk-scorer-policy
# Replaces: risk-policy-mark-reviewed.sh (which had fragile P001 backup parsing)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/gate-helpers.sh"
_enable_err_trap

_parse_input

TOOL_NAME=$(_get_tool_name)
[ "$TOOL_NAME" = "Agent" ] || exit 0

SUBAGENT=$(_get_subagent_type)
SESSION_ID=$(_get_session_id)
[ -n "$SESSION_ID" ] || exit 0

# Only handle risk-scorer agents
case "$SUBAGENT" in
  *risk-scorer*) ;;
  *) exit 0 ;;
esac

AGENT_OUTPUT=$(_get_tool_output)
RDIR=$(_risk_dir "$SESSION_ID")

# ---------------------------------------------------------------------------
# Pipeline scorer: write commit/push/release scores + bypass markers
# ---------------------------------------------------------------------------
if echo "$SUBAGENT" | grep -qE 'risk-scorer-pipeline'; then
  # Parse RISK_SCORES: commit=N push=N release=N
  SCORES_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_SCORES:' | tail -1) || true
  if [ -n "$SCORES_LINE" ]; then
    COMMIT=$(echo "$SCORES_LINE" | grep -oE 'commit=[0-9]+' | cut -d= -f2) || true
    PUSH=$(echo "$SCORES_LINE" | grep -oE 'push=[0-9]+' | cut -d= -f2) || true
    RELEASE=$(echo "$SCORES_LINE" | grep -oE 'release=[0-9]+' | cut -d= -f2) || true

    [ -n "$COMMIT" ] && printf '%s' "$COMMIT" > "${RDIR}/commit"
    [ -n "$PUSH" ] && printf '%s' "$PUSH" > "${RDIR}/push"
    [ -n "$RELEASE" ] && printf '%s' "$RELEASE" > "${RDIR}/release"
  fi

  # Parse RISK_BYPASS: reducing|incident
  BYPASS_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_BYPASS:' | tail -1) || true
  if [ -n "$BYPASS_LINE" ]; then
    BYPASS_TYPE=$(echo "$BYPASS_LINE" | sed 's/^RISK_BYPASS:[[:space:]]*//' | tr -d '[:space:]')
    case "$BYPASS_TYPE" in
      reducing)
        touch "${RDIR}/reducing-commit"
        touch "${RDIR}/reducing-push"
        touch "${RDIR}/reducing-release"
        ;;
      incident)
        touch "${RDIR}/incident-release"
        ;;
    esac
  fi

  # Refresh pipeline state hash so drift detection matches scoring time
  CURRENT_HASH=$("$SCRIPT_DIR/lib/pipeline-state.sh" --hash-inputs 2>/dev/null | _hashcmd | cut -d' ' -f1)
  if [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > "${RDIR}/state-hash"
  fi

  # Save report to .risk-reports/
  REPORT_DIR=".risk-reports"
  mkdir -p "$REPORT_DIR"
  TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%S)
  echo "$AGENT_OUTPUT" > "${REPORT_DIR}/${TIMESTAMP}-commit.md"
fi

# ---------------------------------------------------------------------------
# Plan scorer: write plan-reviewed marker on PASS
# ---------------------------------------------------------------------------
if echo "$SUBAGENT" | grep -qE 'risk-scorer-plan'; then
  VERDICT_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_VERDICT:' | tail -1) || true
  VERDICT=$(echo "$VERDICT_LINE" | sed 's/^RISK_VERDICT:[[:space:]]*//' | tr -d '[:space:]')
  case "$VERDICT" in
    PASS) touch "${RDIR}/plan-reviewed" ;;
    FAIL) ;; # Do NOT create marker — plan must be revised
    *) ;; # Unknown verdict — fail closed
  esac

  # Refresh pipeline state hash
  CURRENT_HASH=$("$SCRIPT_DIR/lib/pipeline-state.sh" --hash-inputs 2>/dev/null | _hashcmd | cut -d' ' -f1)
  if [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > "${RDIR}/state-hash"
  fi
fi

# ---------------------------------------------------------------------------
# WIP scorer: write wip-reviewed marker (unblocks next edit)
# ---------------------------------------------------------------------------
if echo "$SUBAGENT" | grep -qE 'risk-scorer-wip'; then
  # WIP assessment was done — unblock next edit regardless of CONTINUE/PAUSE
  # (PAUSE is advisory guidance to the user, not a hard gate)
  touch "${RDIR}/wip-reviewed"
fi

# ---------------------------------------------------------------------------
# Policy scorer: write policy-reviewed marker on PASS
# ---------------------------------------------------------------------------
if echo "$SUBAGENT" | grep -qE 'risk-scorer-policy'; then
  VERDICT_LINE=$(echo "$AGENT_OUTPUT" | grep -E '^RISK_VERDICT:' | tail -1) || true
  VERDICT=$(echo "$VERDICT_LINE" | sed 's/^RISK_VERDICT:[[:space:]]*//' | tr -d '[:space:]')
  case "$VERDICT" in
    PASS) touch "${RDIR}/policy-reviewed" ;;
    FAIL) ;; # Do NOT create marker — policy must be revised
    *) ;; # Unknown verdict — fail closed
  esac
fi

exit 0
