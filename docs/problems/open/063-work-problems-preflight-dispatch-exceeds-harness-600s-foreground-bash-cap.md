# Problem 063: work-problems pre-flight subprocess dispatch exceeds harness 600s foreground Bash cap

**Status**: Open
**Reported**: 2026-07-21
**Priority**: 8 (Medium) — Impact: 2 × Likelihood: 4 — derived at capture from the description per Step 4a (cost/AFK-throughput harm only, no prod impact; structural — fires on every long pre-flight in this harness)
**Origin**: internal
**Effort**: M — derived at capture per Step 4a (upstream SKILL.md dispatch rework: backgrounded dispatch or internal time budget)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

work-problems pre-flight subprocess dispatch assumes unbounded foreground shell but harness caps foreground Bash at 600s. Evidence (2026-07-21 AFK session): Step 0d check-upstream-responses dispatched a `claude -p` subprocess via foreground Bash; the orchestrator's Bash tool killed it at the 600s cap mid-run; partial cache/audit-log writes had to be reverted per P358; $2.31 burned with zero durable output. Class-of-behaviour: work-problems Steps 0b/0c/0d pre-flight dispatch (and any other foreground `claude -p` dispatch in wr-itil skills) structurally exceeds the harness's 600s foreground Bash ceiling on long pre-flights. Fix locus upstream in @windyroad/itil work-problems SKILL.md: pre-flights need backgrounded dispatch (run_in_background with completion notification) or a shorter internal time budget passed to the subprocess. Related: P358 (partial-write revert contract), P062 (AFK subprocess context gaps).

## Symptoms

- Step 0d `check-upstream-responses` subprocess killed at exactly 600s by the orchestrator's Bash tool cap (2026-07-21 AFK session).
- Partial `docs/problems/.outbound-responses-cache.json` / `docs/audits/outbound-responses-log.md` writes left behind, reverted per P358.
- $2.31 of subprocess spend with zero durable output.

## Workaround

Dispatch pre-flight `claude -p` subprocesses via backgrounded Bash (`run_in_background`) and poll/await the completion notification, or skip the pre-flight when it cannot fit the 600s budget.

## Impact Assessment

- **Who is affected**: addressr-maintainer running `/wr-itil:work-problems` AFK sessions in harnesses with a foreground Bash time cap
- **Frequency**: every pre-flight whose subprocess runs long (upstream-response polling scales with the number of reported-upstream tickets)
- **Severity**: wasted spend + reverted partial writes; loop continues but pre-flight value is lost
- **Analytics**: 1 observed kill (Step 0d, 2026-07-21), $2.31

## Root Cause Analysis

### Investigation Tasks

- [ ] Confirm upstream fix locus: @windyroad/itil work-problems SKILL.md Steps 0b/0c/0d dispatch prose assumes unbounded foreground shell
- [ ] Decide backgrounded-dispatch vs internal-time-budget shape; report upstream via /wr-itil:report-upstream if accepted
- [ ] Create reproduction test

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P062 (AFK subprocess context gaps)

## Related

(captured via /wr-itil:capture-problem during work-problems session retro 2026-07-21; expand at next investigation)

- P358 (upstream @windyroad/itil partial-write revert contract) — governed the revert of the killed pre-flight's partial writes.
- P062 (AFK iter subprocess sessions missing BRIEFING.md content) — sibling AFK-subprocess structural gap.
- Duplicate-check matches (title-only, listed per contract, capture proceeded): P061 (matches "work-problems" keyword — different defect: iter-briefing caveat cross-wiring).
