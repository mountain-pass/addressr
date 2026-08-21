---
status: in-progress
story-id: a-test-that-cannot-fail-is-made-able-to-fail
reported: 2026-08-20
decision-makers: [Tom Howard]
problems: [P033, P116, P119]
rfcs: [RFC-009]
jtbd: [JTBD-400]
story-maps: [STORY-MAP-001]
estimated-effort: S
---

# STORY-001: A test that passes no matter what the code does is found and made able to fail

**Status**: in-progress
**Reported**: 2026-08-20
**Problems**: P033 (closed 2026-08-21), P116, P119
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
The batch found under P033 is unusual in size and not in kind. **No cardinal is stated here on purpose**:
P033 withdrew every tally on 2026-08-19 after three methods gave three answers, and its surviving headline
count now inflates in the wrong direction as governance guards are added. Route work by file identity.

**Sorting them first is the method, not the point.** Before a test can be made effective it has to be known
which kind it is: one that catches nothing (make it able to fail), one that is the only thing guarding a
behaviour (must not be deleted before it is replaced), or one that duplicates real coverage (safe to drop).
Skipping that step makes the work guesswork in both directions, and RFC-009 records both directions actually
being hit while it was written: a rule that would have deleted the only guard over the gateway login check,
and a replacement nearly written for something already covered under a different filename.

## Acceptance criteria

Observable, and each one fails if the work is not done.

- [x] Every pin in the RFC-009 population has a recorded verdict from `scripts/mutate.sh`, in **both**
      directions. **CORRECTED 2026-08-20**: this criterion originally required only a mutation that negates
      **the pin's own proposition**. Necessary but not sufficient — that direction is caught by the pin by
      construction, so it can never return blind. It remains the **vacuity and deletion-safety** probe: it is
      what establishes that a pin is the sole cover for a property and therefore must not be deleted. The
      **coverage** question needs the other direction — text preserved, behaviour broken, the P091 shape. A
      pin needs both.
- [x] Each verdict records the **failure list**, not just the exit code. A CAUGHT verdict names which test
      reddened.
- [x] Each pin is classified in **both** directions: sole cover / redundant from the text-negating probe
      (who else catches a deletion), and blind / covered from the text-preserving probe (does anything notice
      the behaviour dying). Measured 2026-08-20: all seven rows (nine pins) are sole cover in the first
      direction and BLIND in the second — including the two negative pins, whose dual is to break the
      behaviour with a spelling the pin does not grep.
- [x] The classification is recorded where the conversion work will read it, not in a session transcript.
- [x] No pin classified **sole cover** is deleted or repointed by this story. The classification is the
      deliverable; conversion is downstream.
- [x] The three verdicts measured on 2026-08-20 are **re-derived, not carried in**. They are recorded as the
      _expected_ result and the run either reproduces them or the discrepancy is investigated: the ADR-031
      read-shadow pin (expect blind), the `server2.js` shutdown-handler pins (expect sole cover — caught only
      by a sibling source pin), and the `proxy-auth.test.mjs` pre-auth-responder pins (expect sole cover —
      caught only by themselves). Re-deriving costs three `scripts/mutate.sh` runs; P033 records that the
      instrument is what made the practice cheap, so cost is not a reason to restate. A story written to
      discharge "figures restated rather than recomputed" must not open by restating three figures.

      **The first result recorded here was wrong and was superseded the same day — see _Superseded result_ below.**

- [x] Every file mutated during the exercise is restored byte-clean, verified by `git diff --stat` returning
      empty for it.

## Superseded result — retained because the error is this story's own subject

**What was written here first. Do NOT read this as the current position:**

> Two of the three reproduced; the ADR-031 one did not. The read-shadow pin is NOT blind — deleting the call
> site it asserts is caught by the pins themselves, so it is sole cover. The earlier BLIND reading came from a
> different mutation, disabling `mirrorRequest` behaviourally, which 16 behavioural tests in
> `read-shadow.test.mjs` catch. Carrying the seed in would have propagated a wrong verdict.

**That was wrong, and it was wrong because of the direction the mutation was run in.** Negating a text pin's
own proposition edits the exact bytes the pin greps, so the pin catches it by construction — the run could
only ever return "sole cover". Re-run in the text-preserving direction
(`if (process.env.NEVER) mirrorRequest({ method: 'search', params: searchParameters });`, every pinned string
still matching), the verdict is **BLIND**, at whole-suite scope.

**The seed was right. The "correction" was the error**, and it came within one commit of landing as an
amendment to two records that already had it right.

The causal account was wrong too: it credited `read-shadow.test.mjs`'s 16 tests with catching the earlier
mutation. Those tests exercise `src/read-shadow.js` directly and never reach the `address-service.js` call
site, so they cannot. The corrected per-row table is in RFC-009's Classification section.

## Implementation notes

**`scripts/mutate.sh` is the instrument** and already exists: exit 0 CAUGHT, 1 BLIND, 2 NO-OP. A NO-OP means
the mutation did not apply, so nothing was tested — it must never be recorded as a verdict.

**The classification rule — CORRECTED 2026-08-20, and the original is the trap.** The rule this story was
written with: a whole-suite CAUGHT discharges a pin only when the catching test is not itself a member of the
source-inspection population. **True, and insufficient.** Run in the direction this story originally
specified — negate the pin's own proposition — the catching test is ALWAYS the pin, so the rule resolves
every pin to "sole cover" and the blind bucket is unreachable. The discharging question is not _who caught
it_ but _which mutation was run_. **A pin is discharged when the text-PRESERVING mutation is CAUGHT.**
The original rule still governs the other direction, where it decides deletion-safety rather than coverage. Pins vouching for
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

**Its driving problem closed on 2026-08-21 while this story is still `in-progress`, and that is recorded
rather than left to be noticed.** P033 closed with the decision-bearing conversion done; this story's own
deliverable — the classification — was complete and ticked well before it. The conversion work that remains
is P116 and P119, which is why they now appear in this story's `problems:` trace alongside the closed P033.
A story tracing only to a closed problem reads as finished, and no check catches it: the link resolves, so
the doc-link guard stays green. That gap is R018's documented ceiling and it is now realised twice, here and
on RFC-009.

- **RFC-009** — the parent plan; carries the population predicate, the ordering, and the five measured
  baselines this story extends.
- **P033** — the driving Known Error.
- **STORY-MAP-001** — the story map this slice sits on.
