# Problem 011: Risk-scorer agent inconsistently writes score files

**Status**: Open
**Reported**: 2026-03-31
**Priority**: 8 (Medium) — Impact: Minor (2) x Likelihood: Likely (4)

## Description

The risk-scorer agent is instructed to write score files (`/tmp/risk-{action}-{SESSION_ID}`) via Bash `printf` commands before producing reports. The agent has Bash tool access and CAN execute these commands, but it inconsistently does so — sometimes producing reports without writing the score files.

P001 added a PostToolUse backup extraction mechanism that parses the agent's output for score patterns. This partially mitigates the issue but the primary mechanism (agent writes via Bash) remains unreliable.

## Symptoms

- Score files contain "PENDING" (the sentinel value) instead of numeric scores
- Commit/push gates block with "scoring in progress" or "invalid value"
- PostToolUse backup sometimes catches the scores, sometimes doesn't (depends on output format)
- The MANDATORY section at the top of risk-scorer.md and the "execute FIRST" labels on commands don't consistently change agent behavior

## Impact Assessment

- **Who is affected**: Developer (Claude Code workflow)
- **Frequency**: Intermittent — varies by session and scorer invocation
- **Severity**: Medium — blocks pipeline, forces manual intervention or retry

## Root Cause Analysis

### Preliminary Hypothesis

The risk-scorer is an LLM agent. Despite strong instruction language ("MANDATORY", "NON-OPTIONAL", "execute FIRST"), the agent's tool-calling behavior is probabilistic. Long analysis before the Bash calls increases the chance the agent "forgets" to execute them.

The PostToolUse backup (P001 fix) extracts scores from the output text but depends on the exact format: `## {Action} Risk Report ... Overall residual risk: N/25`. Format variations cause silent extraction failure.

### Fix Strategy

Consider moving score writing entirely to the PostToolUse hook (make the backup the primary mechanism) and removing the instruction for the agent to write scores directly. This eliminates the unreliable agent-Bash-call path.

The PostToolUse approach would need to be more robust — perhaps requiring a structured summary block at the end of the output that the hook can reliably parse.

### Investigation Tasks

- [ ] Track success rate of agent-written vs backup-extracted scores over multiple sessions
- [ ] Consider a structured output format (e.g., JSON block) that's easier to parse than markdown
- [ ] Evaluate making PostToolUse extraction the primary mechanism
- [ ] Consider whether the agent should write to a well-known format that the hook consumes, rather than writing score files directly

## Related

- P001: Risk scorer not writing gate scores (original problem, partially resolved)
- `.claude/agents/risk-scorer.md` — MANDATORY section and Output section
- `.claude/hooks/risk-policy-mark-reviewed.sh` — PostToolUse backup extraction
