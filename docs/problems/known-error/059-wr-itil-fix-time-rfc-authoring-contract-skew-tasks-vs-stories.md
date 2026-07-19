# Problem 059: wr-itil fix-time RFC authoring contract skew — Tasks vs stories

**Status**: Known Error
**Reported**: 2026-07-19
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2) — derived at capture from the description per Step 4a (governance-doc ambiguity only; no runtime or release surface; fires only on I13 fix-time auto-creates, which are occasional)
**Origin**: internal
**Effort**: M — derived at capture per Step 4a (upstream two-SKILL prose alignment + a clarifying rule; cf. P056's upstream SKILL-body ticket shape)
**WSJF**: 4.0 — (4 × 2.0) / 2 (Known Error transition 2026-07-19 review: root cause is the observed SKILL-prose contradiction in wr-itil 0.59.1, corroborated twice; judgement-call workaround documented)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

wr-itil fix-time RFC authoring contract skew: manage-problem SKILL.md I13 gate says capture-rfc --fix-time authors "a populated ## Scope and a real ## Tasks decomposition", but capture-rfc SKILL.md (same plugin, 0.59.1) says ## Tasks is superseded per ADR-089/095/096 and mandates authoring stories on a story map via capture-story-map + capture-story instead — while its own argument grammar simultaneously permits stories: [] as a legitimate structural state. Observed 2026-07-19 during the P029 fix-time RFC auto-create (RFC-004): the two SKILL contracts disagree on what --fix-time must author, forcing the agent to judgement-call (authored Scope prose + stories: [], no Tasks section, work tracked via Refs: RFC-004 trailer). Every future I13 fix-time auto-create in this repo hits the same ambiguity. Fix belongs upstream in @windyroad/itil (windyroad/agent-plugins): align manage-problem's I13 gate prose with capture-rfc's ADR-089 story mandate, and state explicitly whether a single-commit fix RFC may ship stories: [] without story-map ceremony.

## Symptoms

(deferred to investigation)

## Workaround

Judgement-call applied 2026-07-19 (RFC-004): author a populated `## Scope` from the traced problem's RCA + Fix Strategy, set `stories: []` (permitted structural state per capture-rfc's own argument grammar), emit no `## Tasks` section, and track the fix work via the `Refs: RFC-<NNN>` commit trailer (valid for "cross-cutting RFC work with no single story" per manage-problem's traversal prose).

## Impact Assessment

- **Who is affected**: addressr-maintainer (JTBD-400 — Ship releases reliably from trunk) whenever the I13 propose-fix gate auto-creates an RFC on an RFC-less Known Error
- **Frequency**: occasional — each fix-time RFC auto-create
- **Severity**: Low — ambiguity cost only; the judgement-call workaround is documented above
- **Analytics**: N/A

## Root Cause Analysis

**Corroborating occurrence (2026-07-19, P025 AFK iter)**: the I13 gate on P025 auto-fired `/wr-itil:capture-rfc --fix-time` (wr-itil 0.59.1). The SKILL's `--fix-time` branch instructs authoring the fix's work-breakdown as **stories on a story map** (route through `/wr-itil:capture-story-map` + `/wr-itil:capture-story`, ADR-089/095/096) — but this adopter repo has no story tier (`docs/stories/` absent), and the AFK loop contract forbids extra capture-* invocations mid-iter. Resolution used: authored RFC-005 with populated `## Scope`, `stories: []`, and a prose `## Stories` note explaining the repo does not use the story tier. Works, but the SKILL text offers no sanctioned no-story-tier path for adopter repos — each fix-time auto-create re-derives this deviation ad hoc.

### Investigation Tasks

- [ ] Investigate root cause
- [ ] Create reproduction test

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- Hang-off-check verdict 2026-07-19 (capture-problem sub-step 2b): PROCEED_NEW. Candidates considered: P043 (wr-itil SID-helper fallback picks subagent UUID — hook-lib race, different root cause and artefact class), P058 (restage-commit helper bypasses external-comms gate — @windyroad/risk-scorer surface regex, different plugin), P029 (Cucumber will-NOT-include v2 step bug — the RFC-004 signal is provenance, not shared root cause; absorbing an upstream-plugin process ticket into a shipping test-bug ticket would break its INVEST shape). No candidate shares the root cause (SKILL-prose contradiction inside @windyroad/itil 0.59.1) or fix locus.
- [RFC-004](../../rfcs/RFC-004-v2-fallback-will-not-include-step-absence-assertions.proposed.md) — the fix-time auto-create during which the skew was observed
- [P029](../verifying/029-will-not-include-step-v2-api-bug.md) — the ticket whose I13 gate surfaced the skew
- Upstream fix home: `@windyroad/itil` (windyroad/agent-plugins) — align `packages/itil/skills/manage-problem/SKILL.md` I13 prose with `packages/itil/skills/capture-rfc/SKILL.md` ADR-089 story mandate

(captured via /wr-itil:capture-problem; expand at next investigation)
