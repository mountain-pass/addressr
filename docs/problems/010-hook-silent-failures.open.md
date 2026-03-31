# Problem 010: Hook scripts fail silently with set -euo pipefail

**Status**: Open
**Reported**: 2026-03-31
**Priority**: 6 (Medium) — Impact: Minor (2) x Likelihood: Possible (3)

## Description

Hook scripts use `set -euo pipefail` for safety but when an error occurs (e.g., `local` keyword outside a function, missing source file), the script exits with code 1 and produces no output. The Claude Code harness reports "UserPromptSubmit hook error" with no details about what failed.

## Symptoms

- "UserPromptSubmit hook error" shown in the IDE with no error message
- Hook produces no JSON output on failure — the harness can't distinguish between "hook declined to output" and "hook crashed"
- Debugging requires manually running `bash -x .claude/hooks/script.sh` with test input
- The `pipeline-state.sh` `local` keyword bug was only found this way

## Impact Assessment

- **Who is affected**: Developer (Claude Code workflow)
- **Frequency**: Whenever a hook has a bug — infrequent but high-friction when it happens
- **Severity**: Medium — no data loss but significant debugging time

## Root Cause Analysis

### Preliminary Hypothesis

`set -euo pipefail` causes immediate exit on any error. The hook scripts don't have error traps that produce diagnostic output.

### Fix Strategy

Add an `ERR` trap to hook scripts that outputs a JSON error message:

```bash
trap 'echo "{\"hookSpecificOutput\":{\"hookEventName\":\"UserPromptSubmit\",\"systemMessage\":\"Hook error in $(basename $0) at line $LINENO: $BASH_COMMAND\"}}" >&1' ERR
```

This would make hook errors visible in the conversation rather than silent.

### Investigation Tasks

- [ ] Add ERR trap to all hook scripts (or to a shared helper function)
- [ ] Test that the trap produces valid JSON that the harness can consume
- [ ] Consider adding hook error logging to `.risk-reports/` or a debug log

## Related

- `.claude/hooks/lib/pipeline-state.sh` — the `local` keyword bug that exposed this
- All hook scripts in `.claude/hooks/` use `set -euo pipefail`
