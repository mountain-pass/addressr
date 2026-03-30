# Problem 001: Risk Scorer Not Writing Gate Scores

**Status**: Open
**Reported**: 2026-03-25
**Priority**: 6 (Medium) — Impact: Minor (2) x Likelihood: Possible (3)

## Description

The risk-scorer agent produces correct risk reports (saved to `.risk-reports/`) but does not write the numeric score to the gate files (`/tmp/risk-commit-{SESSION_ID}`, `/tmp/risk-push-{SESSION_ID}`). The hooks create these files with "PENDING" as a placeholder, but the scorer never overwrites them with the actual score. This causes the commit and push gates to block with "invalid value" or "scoring in progress" errors.

## Symptoms

- `git commit` blocked: "Risk score file contains an invalid value. Re-run the risk-scorer agent."
- `git push` blocked: "Push risk score is not yet available (scoring in progress)."
- `npm run release:watch` blocked: "No release risk score found" (no `/tmp/risk-release-{SESSION_ID}` created at all)
- `/tmp/risk-commit-{SESSION_ID}` contains "PENDING" (7 bytes) instead of a numeric score
- `/tmp/risk-push-{SESSION_ID}` contains "PENDING" (7 bytes) instead of a numeric score
- Risk reports ARE correctly written to `.risk-reports/` with valid scores
- Manual `printf '4' > /tmp/risk-commit-{SESSION_ID}` works as a workaround
- **TTL expiry**: even after manual fix, if the next action takes > 300s the score expires (file mtime checked)
- **Drift detection**: if files are staged AFTER the prompt (when the state hash is computed), the gate detects "pipeline state drift" and blocks — this is by design but compounds the problem since the scorer doesn't write scores, forcing manual intervention that changes the state hash
- **Three gate files needed**: commit (`/tmp/risk-commit-{SESSION_ID}`), push (`/tmp/risk-push-{SESSION_ID}`), and release (`/tmp/risk-release-{SESSION_ID}`) — all three must be manually written

## Workaround

Manually write the score to the gate file in a SEPARATE Bash call before committing:
```bash
# Step 1: write score (separate tool call)
printf '4' > /tmp/risk-commit-{SESSION_ID}
# Step 2: commit (separate tool call — PreToolUse hook checks BEFORE execution)
git commit -m "..."
```
Note: writing and committing in ONE chained command does NOT work because the PreToolUse hook checks the file BEFORE the Bash command executes.

## Impact Assessment

- **Who is affected**: Developer (Claude Code agent workflow)
- **Frequency**: Every commit and push attempt
- **Severity**: Medium — blocks the commit/push pipeline, requiring manual intervention each time
- **Analytics**: N/A

## Root Cause Analysis

### Preliminary Hypothesis

The risk-scorer agent writes its report to `.risk-reports/` markdown files and mentions "Risk score written to `/tmp/risk-score`" but the commit/push gates look for `/tmp/risk-{ACTION}-{SESSION_ID}`. The scorer doesn't know the session ID or the gate file naming convention.

### Investigation Tasks

- [ ] Check how the `PENDING` placeholder is created (which hook writes it?)
- [ ] Check if the risk-scorer agent is supposed to write to the gate files or if another mechanism should
- [ ] Check if there's a PostToolUse hook that should read the scorer's output and write the gate file
- [ ] Verify the expected flow: hook creates PENDING → scorer runs → ??? writes numeric score
- [ ] Create reproduction test

## Related

- `.claude/hooks/risk-score-commit-gate.sh` — commit gate
- `.claude/hooks/git-push-gate.sh` — push gate
- `.claude/hooks/lib/risk-gate.sh` — shared gate logic (reads `/tmp/risk-{ACTION}-{SESSION_ID}`)
- `.claude/agents/risk-scorer.md` — risk scorer agent definition
