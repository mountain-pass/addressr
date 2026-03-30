# Problem 003: ExitPlanMode gate ignores background agent results

**Status**: Open
**Reported**: 2026-03-25
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Likely (2)

## Description

The `PreToolUse:ExitPlanMode` hooks (`review-plan-enforce.sh`, `risk-score-plan-enforce.sh`, `architect-plan-enforce.sh`) block ExitPlanMode unless specialist review agents have run and written marker/verdict files. When review agents are launched in the background (via `run_in_background: true`), they complete and write their verdicts, but the hooks still block ExitPlanMode because they cannot detect the background agents' marker files.

This forces Claude to re-run all review agents in the foreground — duplicating work that was already completed in the background. In practice, every plan review cycle runs 6 agents twice: once in background (results discarded by hooks), once in foreground (results accepted).

## Symptoms

- Review agents (accessibility-lead, voice-and-tone-lead, style-guide-lead, jtbd-lead, risk-scorer, architect) launched in background complete successfully with PASS verdicts
- ExitPlanMode is called and blocked by hooks: "Missing: accessibility-agents:accessibility-lead, voice-and-tone-lead, style-guide-lead, jtbd-lead"
- All 6 agents must be re-launched in foreground
- Each review cycle takes ~2x the agent compute it should

## Workaround

Always run review agents in the foreground (not background) before calling ExitPlanMode. This wastes wall-clock time (agents run sequentially with the main conversation blocked) but avoids the duplicate work.

## Impact Assessment

- **Who is affected**: Developer workflow efficiency — Claude and human time wasted on duplicate agent runs
- **Frequency**: Every plan review cycle (multiple times per session when plans are revised)
- **Severity**: Medium — no data loss or correctness issue, but significant waste of compute and time. Each duplicate cycle adds ~60-90 seconds of agent compute.
- **Analytics**: Count agent invocations per ExitPlanMode in conversation logs

## Root Cause Analysis

### Preliminary Hypothesis

The enforce hooks likely check for marker files (e.g., `/tmp/jtbd-verdict`, `/tmp/risk-plan-verdict`) or session state that background agents write to. Possible causes:

1. Background agents write markers to a different path or with different naming than what the hooks expect
2. The hooks check for markers at ExitPlanMode time but background agents haven't finished writing yet (race condition)
3. The hooks use a session-scoped detection mechanism that only recognizes foreground agent completions
4. The marker files are ephemeral and get cleaned up between the background agent completion and the ExitPlanMode call

### Investigation Tasks

- [ ] Investigate root cause — read the enforce hook scripts to understand what they check for
- [ ] Determine what marker files/state background agents produce vs what hooks expect
- [ ] Create reproduction test
- [ ] Create INVEST story for permanent fix

## Related

- `.claude/hooks/review-plan-enforce.sh` — specialist review gate
- `.claude/hooks/risk-score-plan-enforce.sh` — risk scorer gate
- `.claude/hooks/architect-plan-enforce.sh` — architect gate
