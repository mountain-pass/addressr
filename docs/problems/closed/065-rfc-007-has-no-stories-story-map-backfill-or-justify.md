# Problem 065: RFC-007 carries `stories: []` — no story map, no story, no recorded reason

**Status**: Closed — 2026-08-20, no longer applicable
**Reported**: 2026-07-26
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2) — derived at capture from the description per Step 4a. Impact 2: the harm is a broken governance trace, not a defect in anything running. Likelihood 2: RFC-007's work has already shipped, so the missing trace costs an audit reconstruction rather than misdirecting live work.
**Origin**: internal
**Effort**: S — derived at capture: either a story-map plus one story, or a short recorded justification; single artefact either way — cf. P059 (S), the same authoring-contract surface
**WSJF**: 4.0 — (4 × 1.0) / 1 — backfilled 2026-07-29 (review)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

> **Anchoring note (2026-07-26)**: captured mid-iter with `persona=plugin-developer, jtbd=JTBD-101` supplied by the orchestrator. Those are the **upstream `agent-plugins` home-repo** enum values; this repo's `JTBD-101` is "normalize messy address data" (data-quality-analyst), which is unrelated, and it has no `plugin-developer` persona. Re-anchored to `addressr-maintainer` / `JTBD-400` per the P383 adopter-portability rule and the P061 precedent (user correction 2026-07-24).

> **CLOSED 2026-08-20 — no longer applicable, not fixed.** This ticket asks whether RFC-007's `stories: []`
> is a governance gap needing a story map plus a story, or a gap needing a recorded justification. **RFC-007
> was rejected on 2026-08-20** and the three artefacts it specified were deleted, so there is no work for a
> story to trace. The question is moot rather than answered: nobody decided that an empty `stories:` list is
> acceptable, and the next RFC to carry one raises it again. Closing this rather than leaving it open against
> a withdrawn RFC, because an open ticket pointing at a rejected record reads as live work and is not.
>
> See ADR-051 for the rule behind the rejection, and P032 for what the probe measured while it ran.

## Description

RFC-007 (the CI perf-regression probe) carries `stories: []`. ADR-089 requires an RFC at `accepted` to trace to a story map and at least one story, so an empty story list is either a gap to back-fill or a shape that needs its exemption written down. Right now it is neither: nothing records whether the emptiness is deliberate.

Two acceptable outcomes, and the ticket is to pick one and land it:

1. **Back-fill** — author a story map plus at least one story tracing RFC-007, per ADR-089.
2. **Justify** — record on RFC-007 why its atomic shape needs no story decomposition, so the empty list reads as a decision rather than an omission.

## Symptoms

- RFC-007's `stories:` field is an empty list with no accompanying rationale.
- `/wr-itil:list-stories --rfc RFC-007` returns nothing, and there is no way to tell an intentional no-story RFC from an unfinished one.
- The ADR-089 trace chain (problem → RFC → story map → story) terminates early for this RFC.

## Workaround

Read RFC-007's own Scope and Tasks sections for the decomposition a story map would otherwise carry. The information exists; it just is not in the shape the trace chain expects.

## Impact Assessment

- **Who is affected**: whoever audits the governance trace chain, or picks up RFC-007-adjacent work and expects the story tier to describe it.
- **Frequency**: once, on this RFC — though `stories: []` is a permitted structural state, so the same ambiguity recurs on any future RFC that lands empty.
- **Severity**: Minor — a documentation and traceability gap on already-shipped work.
- **Analytics**: N/A

## Root Cause Analysis

### Preliminary Hypothesis

`stories: []` is simultaneously (a) the initial state of a freshly captured RFC and (b) a permitted terminal state for an RFC that genuinely needs no story decomposition. Nothing distinguishes the two, so an RFC can reach `accepted` with an empty list and no gate notices. This is the same contract ambiguity **P059** records — the fix-time RFC authoring skew between `manage-rfc`'s Tasks decomposition and `capture-rfc`'s ADR-089 story mandate, with `stories: []` permitted by both.

The `wr-itil-check-rfc-has-stories` helper exists in the installed plugin's `bin/`, which suggests the check is available but is not firing (or not firing at the `accepted` transition) for RFC-007.

### Investigation Tasks

- [ ] Run `wr-itil-check-rfc-has-stories` against RFC-007 and record what it reports
- [ ] Confirm RFC-007's current lifecycle state — the ADR-089 obligation attaches at `accepted`, so establish whether it has crossed that line
- [ ] Decide back-fill vs justify, and record the decision on RFC-007 either way
- [ ] If back-filling: author the story map plus at least one story via `/wr-itil:capture-story-map` and `/wr-itil:capture-story`

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none) — this is local repo content, resolvable here regardless of the upstream P059 contract skew
- **Composes with**: P059 (the authoring-contract ambiguity that lets this state exist)

## Related

- **RFC-007** — the subject; CI perf-regression probe, the fix vehicle for P032.
- **P032** (`docs/problems/known-error/032-no-ci-perf-regression-detection.md`) — the problem RFC-007 traces to.
- **P059** (`docs/problems/parked/059-wr-itil-fix-time-rfc-authoring-contract-skew-tasks-vs-stories.md`) — upstream contract skew that makes `stories: []` a permitted state with no disambiguation; `windyroad/agent-plugins#370`.
- ADR-089 — the story-map and story trace requirement at `accepted`.
- Captured via `/wr-itil:work-problems` iter, 2026-07-26 (manual capture-problem steps; Skill tool erroring this session).
