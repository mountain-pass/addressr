# Problem 062: AFK iter subprocess sessions missing docs/BRIEFING.md content

**Status**: Open
**Reported**: 2026-07-20
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3) — derived at capture from the description per Step 4a (institutional-knowledge invisibility causes rework only when a briefed trap recurs in an AFK iter; the structural absence is every iter, the harm is occasional — two demonstrated recurrences, #368 and #370 filings)
**Origin**: internal
**Effort**: S — derived at capture per Step 4a (one idempotent skill invocation, /wr-retrospective:migrate-briefing, plus a next-iter verification)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

AFK iter subprocess sessions do not receive docs/BRIEFING.md content — the wr-retrospective SessionStart briefing surface expects the per-topic docs/briefing/ tree, and this repo still carries the legacy single-file docs/BRIEFING.md (migrate-briefing never run). Observed 2026-07-20 (P059 iter): the briefing's 2026-07-19 entry documenting the external-comms gate's --body-file empty-draft trap (written after the same trap cost round-trips filing agent-plugins#368) was absent from the subprocess context, so the P059 iter re-derived the identical workaround from hook source at the cost of 3 gate denies + 2 redundant reviewer dispatches while filing agent-plugins#370. Institutional knowledge in the legacy briefing is silently invisible to every AFK iteration. Fix strategy: run /wr-retrospective:migrate-briefing (idempotent one-shot migration to docs/briefing/), then verify a subsequent AFK iter receives briefing content; workaround until then is to grep docs/BRIEFING.md for the relevant gate/tool surface before external-comms work in AFK iters.

## Symptoms

(deferred to investigation)

## Workaround

Grep docs/BRIEFING.md for the relevant gate/tool surface before external-comms (or other gate-heavy) work in AFK iters.

## Impact Assessment

- **Who is affected**: addressr-maintainer (JTBD-400 — Ship releases reliably from trunk) via every AFK /wr-itil:work-problems iteration
- **Frequency**: structural (every AFK iter lacks the briefing); harm manifests occasionally, when a briefed trap recurs
- **Severity**: Medium — rework cost when it bites (3 gate denies + 2 redundant reviewer dispatches on the 2026-07-20 recurrence)
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Tasks

- [ ] Investigate root cause
- [ ] Create reproduction test
- [ ] Run /wr-retrospective:migrate-briefing and verify a subsequent AFK iter receives briefing content

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- Hang-off-check verdict 2026-07-20 (capture-problem sub-step 2b): PROCEED_NEW. Candidate considered: P061 (work-problems iter briefing carries another ticket's evaluator caveat) — shares only the word "briefing"; P061's defect is upstream `@windyroad/itil` orchestrator iter-prompt assembly cross-wiring (wrong content injected), this ticket is the local wr-retrospective SessionStart docs/BRIEFING.md injection surface (correct content silently missing); different pipeline stage, plugin, and fix owner. Incidental link: P061's workaround note lives in the legacy BRIEFING.md — one of the entries this ticket shows is invisible to AFK iters.
- docs/BRIEFING.md line 37 — the external-comms `--body-file` trap entry whose invisibility drove this capture
- windyroad/agent-plugins#368, windyroad/agent-plugins#370 — the two filings that each paid the re-derivation cost

(captured via /wr-itil:capture-problem; expand at next investigation)
