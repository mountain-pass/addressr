# Risk R028: The register's scaffold path is mechanical and its curation path is not

**Status**: Active
**Category**: delivery — governance record
**Identified**: 2026-08-05
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05

## Description

New register entries arrive **mechanically**: a `wr-risk-scorer:pipeline` `RISK_REGISTER_HINT` becomes a `docs/risks/R<NNN>-<slug>.active.md` with the ADR-026 ungrounded-output sentinel in every scoring field, via the Phase 2b drain (`wr-risk-scorer` ADR-056). Curating one is entirely **by hand**: there is no curate/update skill, and `create-risk` mints a new ID with no path for editing an existing entry, so P079's instruction to "route via `/wr-risk-scorer:create-risk` rather than editing scoring fields by hand" is unsatisfiable as written.

An automated inflow against a manual outflow drifts in two directions, and nothing caught either:

- **Re-accumulation.** Ungrounded entries pile up at a rate set by scorer activity rather than maintainer decision. That is what P083 was opened about — 24 of 25 entries uncurated, with every risk assessment reporting "no lifetime baseline to reconcile against", sixteen times in one session.
- **Self-disagreement.** Curated entries drift against their own index rows and against their own prose, because every number is written by hand and nothing recomputes it.

This is not the same risk as [R027](R027-deferred-integration-accumulates-unpriced-risk.active.md). R027 prices an _action_ scored against an unscored baseline; R028 is a _register_ that decays between scored actions. Distinct mechanisms.

### Measured at the end of the drain that was supposed to have finished

Every one of these was live on 2026-08-05 after P083's seventh and final batch declared the register curated:

| Drift                                                                                                                            | Count |
| -------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Contradictory above-appetite counts in one document (`six of fifteen` vs the computed `ten of 15`)                               | 2     |
| Entries carrying a duplicated `## Change Log` stanza                                                                             | 5     |
| Curated entries asserting in present tense that their own grounded fields were ungrounded                                        | 9     |
| Descriptions quoting a residual their own Change Log had superseded                                                              | 2     |
| Unchecked task asserting "~15 sentinel-bearing entries remain", directly above a section declaring zero                          | 1     |
| A close-out count not recomputed after a score moved ("ten of 16 above appetite" after R028 itself went 2 → 6, making it eleven) | 1     |

The counts matter more than any single instance: this is what one batch of hand-maintenance produced **while the maintainer was actively watching for exactly this class of error**, having already caught and corrected one instance of it in the same sitting.

## Inherent Risk

Impact × Likelihood _before_ controls.

> **Scale interpretation.** The policy's likelihood descriptors are written about _changes_. This is a standing posture, so likelihood reads as the probability of the condition materialising in a given period — the R010 precedent.

- **Impact**: 2 (Minor) — no runtime, publish or consumer path. The damage lands on the governance surface: `docs/risks/` is read by the ADR-059 catalog protocol on **every future scored action**, so a stale entry or a wrong score degrades every subsequent baseline. Not Impact 1, because this is a machine-consumed surface rather than inert prose.
- **Likelihood**: 4 (Likely) — an observed base rate, not a projection. **Twenty** instances in the batch tabled above.
- **Inherent Score**: 8
- **Inherent Band**: Medium

## Controls

- **`test/js/__tests__/risk-register-invariants.test.mjs`** — **evidenced**, runs in the unit suite, and mutation-tested at introduction (understating R006's residual in the index from 10 to 5 made it fail and name that exact cell). It asserts **nine** invariants: no active entry carries the sentinel; no curated entry claims in present tense that its fields are ungrounded; every entry has exactly one Change Log; every README Register row's inherent and residual match the entry's own scores; this entry's cited drift-table total matches the table's own Count column; this entry's stated check-count matches the test file; any document stating the above-appetite partition in the exact bolded digit form agrees with the entries; no entry refers to a check by position; and the index covers every active and retired file.

  The checks are named, never numbered. An earlier draft referred to checks by position in two places, with different literals and different fates: one named the README-row check, which was fourth then and is fourth now; the other named the partition check, which was accurate when written and went wrong only when a later check landed ahead of it. That is the whole argument for naming — a positional reference can be correct on the day and false by the next edit, with nothing signalling the change.

  It earned its keep on introduction, finding a duplicated Change Log in a retired entry that the by-hand sweep of the same defect had missed.

  **It also closes the re-accumulation half, as a side effect worth naming**: a freshly scaffolded entry carries the sentinel, so the next Phase 2b drain will **red the build** until the entry is curated. That converts silent accumulation into a loud stop. It is the right default — an ungrounded entry in a machine-consumed catalog is a defect — but it means the drain can no longer land entries unattended, which is a consequence to accept deliberately rather than discover.

- **NOT a control: the maintainer recomputing before commit.** It has evidence of application — it caught one wrong count in this very batch — and it still missed a sibling instance of the identical sentence-shape two paragraphs below in the same file. A procedural check that demonstrably misses instances in the artefact it is checking cannot be credited, which is the discipline R003, R004, R010 and R022 each applied to their own procedural controls.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 2 (Minor) — unchanged; the control detects rather than prevents.
- **Likelihood**: 3 (Possible) — **corrected from 1.** The first draft justified 1 with "a breach now fails CI on the commit that causes it, so neither drift direction can accumulate silently." That is true of cells and false of sentences, so it credited the control by its coverage-in-name rather than its configured coverage — the move R003's curation withdrew when it credited `create_before_destroy` and a `DeploymentPolicy` named "Rolling". The prose surface has no control and a three-batch base rate.
- **Residual Score**: 6
- **Residual Band**: Medium
- **Within appetite?**: **No** — appetite is 5 inclusive.

### What the control does not cover

**Free prose that is not arithmetic.** The invariants are structural — sentinels, headings, index rows, score cells, and (since the partition check) any document's claimed above-appetite partition. What they still cannot check is a sentence carrying a judgement rather than a number: a Description quoting a superseded residual in prose, a rationale that has gone stale against its own controls, a Change Log describing a correction inaccurately. Those occurred in the batch tabled above and were fixed by hand.

That is the residual's honest ceiling: the class of error that started this entry — **a number asserted rather than computed** — is closed wherever the number lives in a checkable cell, and open wherever it lives in a sentence.

## Treatment

**Mitigate.** The invariants test is the control for the structural half. It does **not** bring the residual within appetite, because the prose half is uncontrolled and that is where a third of the observed instances live.

The root cause is **not** fixed and is not this repo's to fix: an automated inflow against a manual outflow remains the shape until `wr-risk-scorer` ships a curate/update skill. What the test changes is that drift now stops the build instead of accumulating unobserved, which is the difference between a hazard that is bounded and one that is not.

**The local half, now landed.** An earlier draft of this entry declined to widen the test "toward prose" and named no local treatment at all — which would have left it above appetite with only someone else's action as its discharge. That is functionally accepted while labelled Mitigate, and [R027](R027-deferred-integration-accumulates-unpriced-risk.active.md) refuses exactly that shape in as many words: the register should not present an entry as locally unfixable while a local half is available.

The distinction the earlier draft missed is that the defect is not prose — it is **arithmetic that happens to live in prose**. `N of the M sit above appetite` is computable from the same score cells the README-row check already parses. So the partition check computes the appetite partition from the entries and asserts that any document under `docs/` claiming it agrees. Exact, structural, and no wider in scan root than it needs to be. It is mutation-proven on the instance that prompted it: reverting the count to "Ten of the 16" fails and names the file.

Still deliberately **not** treated by a general prose checker. That reasoning stands — an inexact governance test gets its failures waived, which costs more than the drift it catches. The partition check is exact; a prose checker would not be.

## Monitoring

- **Trigger to re-assess**: a Phase 2b drain scaffolds a new entry (the build will say so), or a scored action reports a missing catalog baseline. Deliberately **not** "a new pipeline hint with this slug" — that fires on scorer activity rather than on the hazard, and it is why the register slept through three cutovers (P083).
- **Discharge condition**: `wr-risk-scorer` ships a curate/update skill, at which point the inflow/outflow asymmetry itself is gone and this entry can retire rather than being carried indefinitely.
- **Metrics**: invariant-test failures per month, and the count of active entries carrying the sentinel at any time (expected: zero, enforced).

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: [P083](../problems/open/083-risk-register-is-an-index-of-hints-not-a-register-24-of-25-entries-uncurated.md) — the drain that surfaced both drift directions. This entry is the class P083 leaves behind after closing the instance.
- [P079](../problems/open/079-rollback-exercised-is-not-a-gate-on-warm-standby-decommission.md) — carries the "route via `create-risk`" instruction that is unsatisfiable for edits.
- [R027](R027-deferred-integration-accumulates-unpriced-risk.active.md) — adjacent, not overlapping: R027 is about how an _action_ is priced, this is about how the _register_ decays between actions.
- Precedent for the control: [R018](R018-adr-links-problem-ticket-committed-before-ticket-exists.active.md) — same move (structural invariant asserted in test, enumerating every offender in one failure) against the documentation-link class.
- Personas affected: [addressr-maintainer](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md)

## Change Log

- 2026-08-05: Created and curated at the close of the P083 drain, on the risk scorer's finding that the drain closed the instance and left the class. Landed with the invariants test as its evidenced control.
- 2026-08-05: **Fourth consecutive instance recorded rather than quietly fixed**, per standing direction. Re-scoring this entry from 2 to 6 moved the register's above-appetite partition from ten-of-16 to eleven-of-16, and P083's close-out kept asserting ten — in the exact surface the "What the control does not cover" section had just named as uncovered, in the batch landing this entry's own control. The scorer caught it by recomputing from the files rather than accepting the assertion. Treatment updated in the same pass: the partition check now computes it and asserts any document claiming it agrees, so this specific class is closed and the entry is no longer locally unfixable.
- 2026-08-05: **Residual corrected 2 → 6, from within appetite to above it, before the entry was ever committed.** The draft named free prose as uncovered and then scored as though it were not. The correction has its own evidence: the batch that applied nine remediations for "counts asserted rather than computed" itself shipped a wrong count — P083 asserted 15 active entries in two sentences while the same file's arithmetic, its Progress table and the filesystem all said 16. That is the third consecutive batch in which careful hand-maintenance produced the defect it was correcting, and it is why Likelihood 3 rather than 1.
