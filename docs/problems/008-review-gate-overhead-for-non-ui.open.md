# Problem 008: Review gate overhead for non-UI changes

**Status**: Open
**Reported**: 2026-03-31
**Priority**: 8 (Medium) — Impact: Minor (2) x Likelihood: Likely (4)

## Description

Every ExitPlanMode requires 6 specialist reviews (architect, risk-scorer, a11y, voice-tone, style-guide, jtbd) even when the plan only touches `.claude/` hooks, shell scripts, or governance docs. The 4 non-architect/risk specialists (a11y, voice-tone, style-guide, jtbd) always return "not relevant" for non-UI changes, wasting tokens and time.

## Symptoms

- Planning a hook script change requires 6 agent invocations before ExitPlanMode
- Each review cycle takes 30-60 seconds
- Editing the plan invalidates all reviews, requiring another full cycle
- Total overhead: 3-5 minutes per plan exit for work that has zero UI relevance

## Impact Assessment

- **Who is affected**: Developer (Claude Code workflow)
- **Frequency**: Every plan exit for non-UI work (majority of sessions)
- **Severity**: Medium — significant friction but no data loss or user impact

## Root Cause Analysis

### Preliminary Hypothesis

The `review-plan-enforce.sh` hook checks all 4 specialist markers unconditionally. Each specialist agent determines its own relevance but the hook doesn't pre-filter based on file paths in the plan.

### Investigation Tasks

- [ ] Add file-path-based pre-filtering to `review-plan-enforce.sh` — if the plan only touches `.claude/`, `docs/`, `scripts/`, or `*.sh` files, skip a11y/voice-tone/style-guide/jtbd
- [ ] Consider a "relevance cache" — if a specialist returned "not relevant" for a plan, don't re-check on minor plan edits
- [ ] Evaluate making some specialists opt-in rather than always-on

## Related

- `.claude/hooks/review-plan-enforce.sh` — the hook that checks all specialists
- `.claude/settings.json` — ExitPlanMode hook configuration
