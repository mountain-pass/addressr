# Problem 009: Cumulative risk scoring blocks governance-only commits

**Status**: Open
**Reported**: 2026-03-31
**Priority**: 8 (Medium) — Impact: Minor (2) x Likelihood: Likely (4)

## Description

The cumulative risk scoring system (Layer 1/2/3) correctly identifies that the unreleased queue is at Medium risk (8/25). However, this means every commit scores at least 8/25 regardless of what's being committed — including governance-only changes (`.claude/` hooks, `docs/` ADRs, BRIEFING.md) that cannot possibly affect the release risk.

This creates a deadlock: the developer wants to commit risk-reducing changes (new hooks, tests, controls) but the commit gate blocks because the release queue is hot.

## Symptoms

- Commit gate blocks with score 8/25 when committing only `.claude/` or `docs/` files
- Developer must manually write score files to bypass (P002) or accept the risk
- Risk-reducing work (adding tests, controls) is blocked by the very risk it's trying to reduce

## Impact Assessment

- **Who is affected**: Developer (Claude Code workflow)
- **Frequency**: Every commit when the unreleased queue has risk >= 5
- **Severity**: Medium — blocks productive work, encourages bypass

## Root Cause Analysis

### Preliminary Hypothesis

The cumulative scoring rule "commit score >= push score >= release score" is correct in principle but doesn't distinguish between commits that ADD release risk and commits that are NEUTRAL to release risk.

### Fix Strategy

Allow commits and pushes through the gate when they are **risk-neutral** (don't change cumulative release risk) or **risk-reducing** (lower cumulative release risk). The principle: actions that don't increase risk towards production should not be blocked by existing risk in the pipeline.

1. **Risk-neutral bypass**: If a commit only touches files that cannot affect the release (docs, governance, hooks, tests) AND the release risk is unchanged, the commit score should be the commit's own risk (1/25) rather than the cumulative release risk (8/25).
2. **Risk-reducing bypass**: If a commit adds tests, controls, or fixes that would reduce the cumulative release risk (e.g., adding v2 API tests to CI, fixing a bug), it should be allowed through even if cumulative risk is above appetite — because blocking it prevents the risk from being reduced.
3. The risk-scorer's "Risk-Reducing Bypass" section (line 92-105 of risk-scorer.md) already describes this concept for back-pressure but not for the cumulative score itself. Extend it to the cumulative scoring rules.

### Investigation Tasks

- [ ] Update the cumulative scoring rules: Layer 3 (commit) score should only inherit Layer 1 (release) score if the commit ADDS release risk. If the commit is neutral or reducing, score independently.
- [ ] Define criteria for "risk-neutral": no files in the npm package source, no runtime dependencies, no CI workflow changes affecting production
- [ ] Define criteria for "risk-reducing": adds tests covering existing release risks, fixes bugs in the release queue, adds controls (health checks, rollback scripts)
- [ ] Update the commit and push gates to recognise risk-neutral/reducing actions
- [ ] Update the risk-scorer instructions to apply the bypass in cumulative scoring

## Related

- `.claude/agents/risk-scorer.md` — cumulative scoring rules (Output section)
- `.claude/hooks/risk-score-commit-gate.sh` — commit gate
- `.claude/hooks/lib/gate-helpers.sh` — `_doc_exclusions()` function
- P002: Risk gate score bypass via direct write (the workaround developers use)
