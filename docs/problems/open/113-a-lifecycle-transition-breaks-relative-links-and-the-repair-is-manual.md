# Problem 113: A lifecycle transition breaks relative links, both directions, and the repair is manual

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 6 (Medium) — Impact: 2 × Likelihood: 3. Impact 2: governance-record traceability only; no build, publish or runtime path. Likelihood 3 rather than 5: the break is certain per transition, but `doc-links-resolve.test.mjs` catches every instance before the commit lands, so the realised cost is repair effort rather than a shipped defect.
**Origin**: internal
**Effort**: S — the detector exists and enumerates every offender; what is missing is the repair.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

**`git mv`-ing a ticket between `open/`, `verifying/` and `closed/` invalidates relative links in BOTH
directions, and nothing in the transition flow repoints them.** Four instances on 2026-08-20, none
anticipated. The first three:

- **Outbound** (the moved ticket's own links go stale): P111 and P112 each linked to sibling tickets by bare
  filename. Moving them into `closed/` meant those targets needed an `../open/` prefix.
- **Inbound** (links in files the transition never touches): P069 moved to `closed/`, which broke a link in
  `docs/problems/closed/007-search-scoring-exact-address-ranked-below-subunits.md` — a ticket closed months
  earlier and not part of the change at all.

The inbound direction is the more surprising of the two: a transition can redden the suite through a file
the author never opened.

**Fourth instance, same day, and an order of magnitude larger.** P033's Open → Known Error transition on
2026-08-20 broke **nine** links across **eight** files: two outbound (P033's own references to siblings still
in `open/`) and seven inbound — from an ADR (`docs/decisions/044-native-esm-without-a-build-step.proposed.md`),
from a ticket already closed (`closed/094`), and from five open siblings (`089`, `091`, `098`, `114`, `115`).
Two of the inbound breaks were in tickets **filed earlier the same day by this very ticket's author**, which
is the clearest possible demonstration that the class does not depend on the referring file being old or
forgotten — it depends only on something pointing at the moved ticket.

The count scales with how well cross-referenced a ticket is, so the tickets most worth linking are the most
expensive to transition. P033 has 110 siblings and is the most-referenced ticket in the backlog; a
peripheral ticket breaks one or two links, a hub breaks nine.

**The detector works; the repair does not exist.** `doc-links-resolve.test.mjs` caught all four, named every
offending link each time, and is mutation-tested. So this is not a detection gap — R018 already prices the
residual as "not zero, because the repair is still manual once the test points at it". Four instances in one
day, twelve broken links between them, argues for automating the repair, NOT for tightening detection. Recording that distinction
explicitly, because the naive reading of "it broke three times" is that the control is weak, and it is not.

**A repointing tool must inherit one exemption from day one.** The first repair attempt was a blanket
`docs/**` path rewrite, which also edited `docs/retros/2026-08-02-context-analysis.md` — a dated
contemporaneous measurement record that correctly recorded where the file lived on that date. That reference
was backticked TEXT, not a link, so the detector had never flagged it; the edit was both unnecessary and
historically false, and was reverted after reading the diff. **The discriminator is structural**: a markdown
link gets repointed, a backticked path in a dated record does not. This is R028's structurally-quoted
exemption — "a backtick sits at the claim" — and any tool built here should carry it from the start rather
than learn it the expensive way.

**Illustrative link syntax in prose is itself a hazard.** The briefing entry written about this defect used
literal bracket-paren examples and reddened the suite, because the detector matched them as live links —
**backticks did not exempt them**. Prose about links has to be written without link shapes.

## Symptoms

1. A transition commit reddens `doc-links-resolve` on a file the author never edited.
2. The repair is a manual read of the failure output followed by hand-edits, once per instance.
3. A blanket path-rewrite "fix" silently falsifies dated records that were correct as written.

## Root Cause Analysis

The lifecycle transition owns the rename and the README refresh but not the reference graph. Relative links
encode the source file's directory depth, so the same target text is correct in one state directory and wrong
in another — and inbound references live in arbitrary files that no transition step enumerates.

### Investigation Tasks

- [ ] Decide where the repair belongs: a step in the transition flow, a repo-level script, or a codemod the
      detector's own output feeds. The detector already emits `<file> -> <target>` pairs, which is most of a
      machine-readable repair input.
- [ ] **Carry the dated-record exemption from day one.** Repoint markdown links only; never a backticked path,
      and never inside `docs/retros/**`, where a path is a measurement of where a file was on a date.
- [ ] Confirm the fix handles the inbound direction, not just the moved file's own links. The fourth
      instance settles this: a fix that only repointed the moved file would have left SEVEN of P033's nine
      broken links unrepaired, including one in an ADR and one in an already-closed ticket.
- [ ] This is an upstream `wr-itil` surface (`transition-problem` owns the rename). Decide local script vs
      upstream report; see P060 for the precedent of an upstream-blocked `update-upstream` defect.

## Fix Strategy

**Kind**: `improve`. **Shape**: script (repo-level) OR skill improvement (upstream `wr-itil`
`transition-problem`) — the routing decision is Investigation Task 4.

**Target**: the transition flow's post-rename step. **Observed flaw**: the rename invalidates relative links
in both directions and nothing repoints them. **Edit summary**: consume `doc-links-resolve`'s existing
`<file> -> <target>` output to repoint markdown links only, excluding backticked paths and `docs/retros/**`.

**Evidence**: four instances on 2026-08-20 — P111 outbound, P112 outbound, P069 inbound, and P033 BOTH
directions at nine links across eight files; plus one falsified dated record from a naive blanket-rewrite
repair, caught by reading the diff and reverted.

## Related

- **R018** — the moved-path referrer risk. Its residual already prices the manual repair; this ticket is that
  residual made concrete, not a re-score. Both directions are already inside R018's scope.
- **R028** — the structurally-quoted exemption (a backtick sits at the claim) that a repointing tool must
  inherit.
- **[P103](103-workflow-referrers-outside-guard-coverage-rot-unseen.md)** — sibling class: referrers outside
  guard coverage. This one is inside coverage and still costs manual repair.
- **ADR-048** — moved-path referrers resolved by executable guard. The guard exists; the repair does not.
