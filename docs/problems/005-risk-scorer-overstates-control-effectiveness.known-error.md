# Problem 005: Risk scorer overstates control effectiveness

**Status**: Known Error
**Reported**: 2026-03-26
**Priority**: 12 (High) — Impact: Significant (4) x Likelihood: Possible (3)

## Description

The risk scorer reduces likelihood based on controls (tests, CI, preview deploy) without verifying that those controls actually cover the **specific failure mode** identified in the risk. This leads to residual risk scores that are too low, allowing risky changes to pass the gate.

In the P034 incident, the scorer rated the composite pipeline refactoring at residual 3/25 (Low). The actual outcome was a production outage (game page showed no plays). The scorer claimed:
- "All 719 tests passed — reduces likelihood from 2 to 1" — but no test covered the cache staleness failure mode
- "Release preview — reduces impact" — but the preview had a cold cache and couldn't reproduce the warm-cache bug
- "Alpha phase — reduces impact from 4 to 3" — correct, but insufficient when likelihood was wrong

The inherent risk (8/25 Medium) was correctly assessed. The problem was entirely in control evaluation.

## Symptoms

- Risk scores consistently land at 3-4/25 (Low) even for changes that break production
- Controls are listed as "reduces likelihood" without evidence they cover the failure scenario
- "Tests pass" is treated as a universal likelihood reducer regardless of what the tests actually test
- Preview deploys are treated as impact reducers even when the preview environment differs from production (cold vs. warm cache)

## Workaround

Manually review the risk report's control claims: for each "reduces likelihood" statement, ask "does this control exercise the exact failure mode?" If not, the reduction is invalid.

## Impact Assessment

- **Who is affected**: Developer (user) — false confidence from risk scores
- **Frequency**: Every risk assessment that involves caching, state management, or environment-specific behavior
- **Severity**: High — directly caused a production outage (P034) and wasted hours on debugging
- **Analytics**: `.risk-reports/2026-03-25T11-16-20-commit.md` is the specific report that overstated controls

## Root Cause Analysis

### Confirmed Root Cause

The risk scorer prompt doesn't require controls to be **mapped to the specific failure mode**. It treats "tests pass" as a generic likelihood reducer. The scorer should instead ask: "Does this control exercise the exact scenario described in the risk?" and only reduce likelihood if the answer is yes.

### Evidence

From `.risk-reports/2026-03-25T11-16-20-commit.md`:
```
Risk 1: Behavioural regression in event routing
- Controls: All 719 tests passed - executed - reduces likelihood from 2 to 1
  because tests cover the game pipeline and projector paths
```

The tests did NOT cover:
1. Server-side cache staleness (LRU not invalidated by play events)
2. WeakMap data loss on actor replacement during event replay
3. Warm-cache vs. cold-cache behavior differences

### Fix Strategy

Update the risk scorer agent's prompt to require **failure-mode-specific control mapping**:
1. For each risk, the scorer must identify the specific failure scenario
2. For each claimed control, the scorer must explain HOW the control exercises that exact scenario
3. If a control only covers adjacent scenarios, it must NOT be used to reduce likelihood
4. Add explicit checks: "Does this test cover cache behavior?" / "Does the preview reproduce production state?"

### Investigation Tasks

- [x] Investigate root cause — confirmed: controls not mapped to failure modes
- [x] Update risk scorer agent prompt with failure-mode-specific control requirements
- [ ] Add post-incident review step that compares predicted vs. actual risk for production issues

## Fix Released

Risk scorer prompt updated with mandatory failure-mode-specific control mapping (lines 113-120 of `.claude/agents/risk-scorer.md`). The scorer now requires explaining HOW each control exercises the exact failure scenario, and explicitly checks for environment mismatches (cold vs warm cache, mocked vs real). Awaiting verification via next production incident review.

## Related

- Problem 034: Game page plays not rendering (the incident caused by this gap)
- Problem 032: Risk scorer ignores release risk accumulation (related scorer issue)
- `.risk-reports/2026-03-25T11-16-20-commit.md` — the report that let P034 through
- `.claude/agents/risk-scorer.md` — the scorer agent prompt to update
