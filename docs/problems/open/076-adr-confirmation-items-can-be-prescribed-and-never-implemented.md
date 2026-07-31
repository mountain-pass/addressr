# Problem 076: An ADR Confirmation item can be prescribed and never implemented, with nothing detecting the drift

**Status**: Open
**Reported**: 2026-07-31
**Priority**: 8 (Medium) — Impact: Significant (4) × Likelihood: Unlikely (2). Impact 4: a Confirmation section is the mechanism by which a decision is verifiable at all, so an unimplemented item means a decision is recorded as gated when it is not — and the corpus currently offers no way to tell which items are real. Likelihood 2: one confirmed instance out of three items on one ADR, but nothing prevents recurrence and nothing would surface it.
**Origin**: internal — surfaced 2026-07-31 while re-verifying ADR-027's confirmation scenarios against the green domain during the ADR-041 blue/green soak.
**Effort**: M — the detection shape needs thought (see Investigation Tasks); the audit of existing ADRs is mechanical but wide.
**WSJF**: 4.0 — (8 × 1.0) / 2
**JTBD**: JTBD-001
**Persona**: addressr-maintainer

## Description

ADR-027's `## Confirmation` section prescribes three new Cucumber scenarios. **Two exist. One was never written, and nothing noticed.**

The missing one, at `docs/decisions/027-fuzziness-auto-5-8.proposed.md` line 120:

> **New Cucumber scenario — P026 case 3 first result** in `addressv2.feature`: query `"138 Whitehorse Rd"` against OT fixture equivalent … use the OT equivalent `"108 GAZE RD CHRISTMAS ISLAND"` … Assert top result is `GAOT_718446689`.

A repo-wide grep across `*.feature` for `108 GAZE`, `718446689` and `96-108` returns nothing. The two sibling scenarios prescribed at lines 121-122 — `19 Muray Rd` five-character typo preservation, and `16 Gazz Rd` four-character intentional-loss documentation — are both present in `test/resources/features/addressv2.feature`.

So one of three was silently dropped. The ADR reads as though all three gate the decision.

## Symptoms

An ADR's `## Confirmation` section lists criteria that do not exist in the test suite. Nothing fails, nothing warns, and a reader auditing the decision has no way to distinguish a prescribed-and-implemented criterion from a prescribed-and-forgotten one short of manually grepping each item.

## Workaround

Manual grep per Confirmation item, as done here. Does not scale across 37 in-force ADRs.

## Impact Assessment

- **Who is affected**: any maintainer relying on a Confirmation section to know whether a decision is actually gated — and, downstream, anyone trusting a pre-cutover gate review.
- **Frequency**: one confirmed instance. The corpus has not been audited, so the true rate is unknown.
- **Severity**: Significant on the governance axis, none on the runtime axis. No wrong output reaches production from this defect alone; it removes a check that would otherwise be load-bearing.

## Root Cause Analysis

### Hypothesis

Confirmation items are prose. There is no linkage between an item and the artefact that satisfies it, and no gate asserts that one exists. The architect edit-gate reviews _changes_ against decisions; it does not audit whether a decision's own criteria were ever built. The drift is therefore silent by construction rather than by oversight.

### Important correction — this is NOT the counterfactual for P075

The obvious framing is "the missing scenario would have caught the ADR-041 exact-vs-range inversion." **That is wrong, and the ticket should not inherit the stronger claim.**

ADR-027 line 120 prescribes the scenario _"against OT fixture equivalent"_. The OT fixture is 5,186 documents. BM25 IDF is corpus-relative, and the score-ratio compression that produces the P075 inversion does not occur at that scale — P073 and P074 both independently measured **0% violations on OT at 5,186 docs**. Had this scenario been implemented exactly as prescribed, it would have **passed** on the green domain and gated nothing.

That makes this a genuine governance defect on its own terms, and it also makes it a sharper one: the prescribed criterion was not merely unimplemented, it was **unfit as specified**. Both halves are worth fixing, and neither is fixed by writing the scenario as ADR-027 describes it.

### Investigation Tasks

- [ ] Decide the detection shape. Candidates: require each Confirmation item to cite the artefact that satisfies it (test path, hook, command) and add a gate that resolves those citations; or a periodic audit skill that reports unresolvable items; or accept prose and gate only on new ADRs going forward.
- [ ] Audit the existing corpus. 37 in-force ADRs; the question is how many Confirmation items name an artefact that does not exist.
- [ ] Address the second half — a Confirmation item can be implemented and still gate nothing if it is specified at the wrong scale. Any detection mechanism that only checks existence would mark ADR-027 line 120 green once someone writes the fixture-scale scenario.
- [ ] Feed the corpus-scale lesson back: this is the third independent instance (P074, P075, and this) of small-fixture gates being unable to see a corpus-scale property.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P075 (surfaced this; the ranking finding), P074 (instance-based gates pin instances rather than properties — the sibling failure where the gate exists and passes).

## Related

- **ADR-027** — the instance. Line 120 prescribes the missing scenario; lines 121-122 prescribe the two that exist.
- **P075** — the ADR-041 exact-vs-range inversion whose investigation surfaced this. Note the correction above: this ticket is not the counterfactual for that one.
- **P074** — the adjacent failure mode: gates that exist and pass while the property they claim to protect is half-violated. Together these bracket the problem — a gate can be absent, or present and unfit.
- Hang-off arbitration 2026-07-31 returned PROCEED_NEW and specifically advised splitting this from P075: filed inside a ranking ticket it would be read as a footnote and closed with the ranking fix, whereas it generalises beyond ADR-027 to a class defect.
