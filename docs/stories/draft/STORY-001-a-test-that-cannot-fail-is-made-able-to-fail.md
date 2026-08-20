---
status: draft
story-id: a-test-that-cannot-fail-is-made-able-to-fail
reported: 2026-08-20
decision-makers: [Tom Howard]
problems: [P033]
rfcs: [RFC-009]
jtbd: [JTBD-400]
story-maps: [STORY-MAP-001]
estimated-effort: S
---

# STORY-001: A test that passes no matter what the code does is found and made able to fail

**Status**: draft
**Reported**: 2026-08-20
**Problem**: P033
**RFC**: RFC-009
**Story map**: STORY-MAP-001
**JTBD**: JTBD-400 — on its **anti-erosion clause**, not the release path. The job statement asks that
"test profiles keep reporting the coverage they claim ... [and] no test coverage silently erodes", and
classifying a pin as blind / sole cover / redundant is that measurement directly. The release-path hop —
P091 was a release defect, therefore pin quality is release work — is two inferences deep and routes through
a path this story is plainly not on: it writes no behavioural tests and changes no production code. JTBD-400's
own screens list already ruled on this, saying of its governance-prose guards that they are in scope
"on the job statement's anti-erosion clause, NOT on the release path". P091 stays as evidence of **severity**,
not as the trace.

**Deliberately NOT JTBD-001.** The parent RFC carries `[JTBD-400, JTBD-001]` and this story carries only
`[JTBD-400]`. That asymmetry is correct and should not be harmonised: JTBD-001 (search and autocomplete) is
the _harmed_ outcome — what P091 degraded — but this story delivers a classification, not a search
behaviour. JTBD-001 belongs on the downstream conversion story that re-tests the retrieval path end to end,
where a JTBD-001 outcome is actually observable.

## User value

In order to trust a green test run, as the maintainer, I want a test that cannot fail to be found and made
able to fail.

That is the whole value. A test that passes whatever the code does is worse than no test, because no test is
honestly absent and this one reports coverage it does not have. Making it effective is the work; deleting it
is only correct once something else covers the same ground.

**This is ordinary work, not a cleanup project.** Ineffective tests turn up from time to time and the
response is always the same shape — find out whether the test can fail, and if it cannot, make it able to.
The batch found under P033 is roughly thirty of them, which is unusual in size and not in kind.

**Sorting them first is the method, not the point.** Before a test can be made effective it has to be known
which kind it is: one that catches nothing (make it able to fail), one that is the only thing guarding a
behaviour (must not be deleted before it is replaced), or one that duplicates real coverage (safe to drop).
Skipping that step makes the work guesswork in both directions, and RFC-009 records both directions actually
being hit while it was written: a rule that would have deleted the only guard over the gateway login check,
and a replacement nearly written for something already covered under a different filename.

## Acceptance criteria

Observable, and each one fails if the work is not done.

- [ ] Every pin in the RFC-009 population has a recorded verdict from `scripts/mutate.sh` against a mutation
      that negates **the pin's own proposition** — not merely one that disables its subject.
- [ ] Each verdict records the **failure list**, not just the exit code. A CAUGHT verdict names which test
      reddened.
- [ ] Each pin is classified into exactly one of: **blind** (nothing caught it), **sole cover** (only the pin
      itself, or only other members of the source-inspection population, caught it), or **redundant** (a test
      that executes the subject caught it).
- [ ] The classification is recorded where the conversion work will read it, not in a session transcript.
- [ ] No pin classified **sole cover** is deleted or repointed by this story. The classification is the
      deliverable; conversion is downstream.
- [ ] The three verdicts measured on 2026-08-20 are **re-derived, not carried in**. They are recorded as the
      _expected_ result and the run either reproduces them or the discrepancy is investigated: the ADR-031
      read-shadow pin (expect blind), the `server2.js` shutdown-handler pins (expect sole cover — caught only
      by a sibling source pin), and the `proxy-auth.test.mjs` pre-auth-responder pins (expect sole cover —
      caught only by themselves). Re-deriving costs three `scripts/mutate.sh` runs; P033 records that the
      instrument is what made the practice cheap, so cost is not a reason to restate. A story written to
      discharge "figures restated rather than recomputed" must not open by restating three figures.
- [ ] Every file mutated during the exercise is restored byte-clean, verified by `git diff --stat` returning
      empty for it.

## Implementation notes

**`scripts/mutate.sh` is the instrument** and already exists: exit 0 CAUGHT, 1 BLIND, 2 NO-OP. A NO-OP means
the mutation did not apply, so nothing was tested — it must never be recorded as a verdict.

**The classification rule that makes this non-trivial**, from RFC-009: a whole-suite CAUGHT discharges a pin
only when the catching test is **not itself a member of the source-inspection population**. Pins vouching for
pins is a quorum of the same assumption, not cover. The `server2.js` case is the worked example — three
sibling pins over the same two `indexOf` results, each of which reddens when another's proposition is
mutated, while nothing behavioural reaches that file at all.

**Mutations must hit the production module and the production call site.** A CAUGHT verdict against a
test-local copy or a freshly constructed instance proves nothing; P033 records two closed episodes of exactly
that shape.

**Sequencing.** This story is deliberately first in the backbone because every later conversion depends on
knowing which bucket a pin is in. It is also the cheapest — it writes no behavioural tests and changes no
production code.

## Related

- **RFC-009** — the parent plan; carries the population predicate, the ordering, and the five measured
  baselines this story extends.
- **P033** — the driving Known Error.
- **STORY-MAP-001** — the story map this slice sits on.
