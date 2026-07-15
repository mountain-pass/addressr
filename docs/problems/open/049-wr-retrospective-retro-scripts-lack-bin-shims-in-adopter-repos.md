# Problem 049: wr-retrospective retro scripts lack bin shims in adopter repos

**Status**: Open
**Reported**: 2026-07-15
**Priority**: 4 (Low) — Impact: Low (2) x Likelihood: Unlikely (2) — derived at capture from the description per Step 4a; cf. P041/P048 (same upstream wr-plugin-friction class, both rated 4)
**Origin**: internal
**Effort**: S — derived at capture per Step 4a (local scope: report upstream + document workaround; upstream fix is three ADR-049 shims + SKILL reword)
**JTBD**: (unconfirmed — elicitation queued)
**Persona**: addressr-maintainer

## Description

wr-retrospective run-retro references check-ask-hygiene.sh / check-briefing-budgets.sh / check-tickets-deferred-cause.sh via repo-relative `packages/retrospective/scripts/` paths and ships no bin/ shims for them, so adopter repos cannot run those retro passes as written. Observed 2026-07-15 in addressr AFK iter (P001): `wr-retrospective-check-ask-hygiene` → command not found; plugin cache 0.27.0 bin/ contains shims for 9 other scripts but not these three; SKILL.md Step 2d.8 and Step 3 budget pass name the scripts repo-relatively (P317/RFC-009 class — NEVER repo-relative from a SKILL). Upstream fix: add ADR-049 $PATH shims + reword SKILL.md to shim names.

## Symptoms

- `wr-retrospective-check-ask-hygiene` → command not found during run-retro Step 2d.8 (R6 gate) in adopter repos
- run-retro Step 3 Tier-3 budget pass and check-tickets-deferred-cause advisory cannot fire as written outside the source monorepo

## Workaround

Invoke the cached script directly: `bash ~/.claude/plugins/cache/windyroad/wr-retrospective/<ver>/scripts/check-ask-hygiene.sh docs/retros` (same for the other two scripts).

## Impact Assessment

- **Who is affected**: addressr-maintainer (and any wr-retrospective adopter) running retro passes outside the windyroad source monorepo
- **Frequency**: every run-retro invocation that reaches Step 2d.8 / Step 3 budget pass / tickets-deferred check
- **Severity**: Low — advisory passes degrade fail-open; retro continues; workaround is trivial
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Tasks

- [ ] Investigate root cause
- [ ] Create reproduction test

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)

- Upstream candidate: windyroad plugin suite (wr-retrospective 0.27.0) — report via /wr-itil:report-upstream when ready
- P317/RFC-009 class (upstream): repo-relative script references from SKILL.md
- Hang-off pre-filter: 0 candidates shared signals (packages/retrospective, check-ask-hygiene, check-briefing-budgets) across open/ + verifying/ — PROCEED_NEW without subagent dispatch (empty-candidates short-circuit)
