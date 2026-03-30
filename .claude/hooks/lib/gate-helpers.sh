#!/bin/bash
# Shared portable helpers for gate enforcement hooks.
# Sourced by architect-gate.sh, risk-gate.sh, and other gate libraries.
# Provides: _mtime, _hashcmd

# Portable mtime: tries GNU stat, falls back to macOS stat
_mtime() { stat -c%Y "$1" 2>/dev/null || /usr/bin/stat -f%m "$1" 2>/dev/null || echo 0; }

# Portable hash: tries md5sum, falls back to md5 -r, then shasum
_hashcmd() { md5sum 2>/dev/null || md5 -r 2>/dev/null || shasum 2>/dev/null; }

# Paths excluded from pipeline state hashing and docs-only detection.
# These are non-user-facing files that cannot affect the running application.
_doc_exclusions() {
    echo ':!docs/' ':!.risk-reports/' ':!.changeset/' ':!governance/' ':!.claude/plans/' ':!CLAUDE.md' ':!AGENTS.md' ':!PRINCIPLES.md' ':!DECISION-MANAGEMENT.md' ':!AGENTIC_RISK_REGISTER.md' ':!PROBLEM-MANAGEMENT.md'
}
