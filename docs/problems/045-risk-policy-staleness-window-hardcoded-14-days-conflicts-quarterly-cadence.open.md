# Problem 045: RISK-POLICY staleness window hardcoded at 14 days conflicts with the quarterly review cadence

**Status**: Open
**Reported**: 2026-07-06
**Priority**: 3 (Medium) — Impact: 3 x Likelihood: 1 (deferred — re-rate at next /wr-itil:review-problems)
**Origin**: internal
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

wr-risk-scorer commit-gate hook hardcodes 14-day RISK-POLICY staleness window; policy now declares a user-directed quarterly review cadence (RISK-POLICY.md 2026-07-06), so the gate will nag fortnightly regardless — upstream plugin needs a configurable window.

The hardcode is at `wr-risk-scorer/0.13.5/hooks/risk-score-commit-gate.sh:50` (`(date.today() - reviewed).days > 14`). RISK-POLICY.md's declared cadence (`**Review cadence:** quarterly (next review due 2026-10-06)`) is not read by the hook, so commits will be blocked with the "stale policy" deny roughly every fortnight and the operator must bump the last-reviewed date (or re-run /wr-risk-scorer:update-policy) far more often than the policy requires. Likely fix direction: upstream feature request / patch making the window configurable (env var, or parse the cadence line from the policy itself), reported via /wr-itil:report-upstream to the windyroad plugin repo.

## Symptoms

(deferred to investigation)

## Workaround

Bump the `Last reviewed:` date in RISK-POLICY.md whenever the gate blocks (a fortnightly date-only touch commit), keeping the quarterly substantive review cadence recorded in the policy.

## Impact Assessment

- **Who is affected**: (deferred to investigation)
- **Frequency**: (deferred to investigation)
- **Severity**: (deferred to investigation)
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] Report upstream to the wr-risk-scorer plugin repo via /wr-itil:report-upstream (configurable staleness window, or hook reads the policy's cadence line)
- [ ] Create reproduction test

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)

- RISK-POLICY.md quarterly-cadence amendment (commit d2ee199, 2026-07-06) — the user direction the hook contradicts.
