#!/bin/bash
# Shared portable helpers for gate enforcement hooks.
# Sourced by architect-gate.sh, risk-gate.sh, and all hook scripts.
# Provides: _mtime, _hashcmd, _doc_exclusions, _err_trap, _get_*

# ---------------------------------------------------------------------------
# Portable utilities
# ---------------------------------------------------------------------------

# Portable mtime: tries GNU stat, falls back to macOS stat
_mtime() { stat -c%Y "$1" 2>/dev/null || /usr/bin/stat -f%m "$1" 2>/dev/null || echo 0; }

# Portable hash: tries md5sum, falls back to md5 -r, then shasum
_hashcmd() { md5sum 2>/dev/null || md5 -r 2>/dev/null || shasum 2>/dev/null; }

# Paths excluded from pipeline state hashing and docs-only detection.
_doc_exclusions() {
    echo ':!docs/' ':!.risk-reports/' ':!.changeset/' ':!governance/' ':!.claude/plans/' ':!CLAUDE.md' ':!AGENTS.md' ':!PRINCIPLES.md' ':!DECISION-MANAGEMENT.md' ':!AGENTIC_RISK_REGISTER.md' ':!PROBLEM-MANAGEMENT.md'
}

# ---------------------------------------------------------------------------
# ERR trap: outputs diagnostic JSON on hook errors (P010)
# Usage: source gate-helpers.sh at top of hook, then call _enable_err_trap
# ---------------------------------------------------------------------------

_enable_err_trap() {
    trap '_err_trap_handler "$BASH_SOURCE" "$LINENO" "$BASH_COMMAND"' ERR
}

_err_trap_handler() {
    local script="$1" line="$2" cmd="$3"
    local name
    name=$(basename "$script" 2>/dev/null || echo "$script")
    # Output diagnostic as systemMessage so it's visible in conversation
    cat <<EOF
{
  "systemMessage": "Hook error in ${name} at line ${line}: ${cmd}"
}
EOF
}

# ---------------------------------------------------------------------------
# JSON input parsing: standardised helpers replacing inline python3
# Each reads from _HOOK_INPUT (set by the hook before calling these)
# ---------------------------------------------------------------------------

# Store hook input for reuse by parsing helpers
_HOOK_INPUT=""

_parse_input() {
    _HOOK_INPUT=$(cat)
}

_get_tool_name() {
    echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_name', ''))
except:
    print('')
" 2>/dev/null || echo ""
}

_get_session_id() {
    echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('session_id', ''))
except:
    print('')
" 2>/dev/null || echo ""
}

_get_command() {
    echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null || echo ""
}

_get_file_path() {
    echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('file_path', ti.get('path', '')))
except:
    print('')
" 2>/dev/null || echo ""
}

_get_subagent_type() {
    echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('subagent_type', ''))
except:
    print('')
" 2>/dev/null || echo ""
}

_get_user_prompt() {
    echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('user_prompt', ''))
except:
    print('')
" 2>/dev/null || echo ""
}

_get_tool_output() {
    echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # PostToolUse provides tool_response (dict with content array), not tool_output
    tr = data.get('tool_response', {})
    if isinstance(tr, dict):
        content = tr.get('content', [])
        if isinstance(content, list):
            texts = [c.get('text', '') for c in content if isinstance(c, dict) and c.get('type') == 'text']
            if texts:
                print('\n'.join(texts))
                sys.exit(0)
    # Fallback for older/different hook formats
    print(data.get('tool_output', ''))
except:
    print('')
" 2>/dev/null || echo ""
}

# ---------------------------------------------------------------------------
# Session-scoped tmp directory for risk files
# ---------------------------------------------------------------------------

# Returns the session-scoped directory for risk temp files.
# Creates the directory if it doesn't exist.
# Usage: DIR=$(_risk_dir "$SESSION_ID"); echo "1" > "$DIR/commit"
_risk_dir() {
  local sid="$1"
  local dir="${TMPDIR:-/tmp}/claude-risk-${sid}"
  mkdir -p "$dir"
  echo "$dir"
}

# ---------------------------------------------------------------------------
# Non-doc file detection for WIP gating
# ---------------------------------------------------------------------------

_is_doc_file() {
    local file_path="$1"
    local EXCL
    EXCL=$(_doc_exclusions)
    for pattern in $EXCL; do
        local clean="${pattern#:!}"
        case "$file_path" in
            *"$clean"*) return 0 ;;
        esac
    done
    case "$file_path" in
        *.claude/*|*.risk-reports/*|*RISK-POLICY.md) return 0 ;;
    esac
    return 1
}
