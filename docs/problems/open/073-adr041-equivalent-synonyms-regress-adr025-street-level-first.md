# Problem 073: ADR-041 equivalent synonyms regress the ADR-025 street-level-first invariant

**Status**: Open
**Reported**: 2026-07-31
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Likely (3). Impact 4 per RISK-POLICY § Impact: this is P007 re-emerging on the revenue-generating `/addresses?q=` endpoint — the exact street-level match ranked below its own sub-units, which is the defect a RapidAPI consumer reported as issue #375 and which ADR-025 was written to fix. Likelihood 3: it does not reproduce on every address, only where the co-positioned token shifts the field-length norm enough to close a narrow gap, but it is deterministic on the addresses where it does.
**Origin**: internal — caught by the ADR-041 pre-cutover relevance gate on 2026-07-31, before any cutover.
**Effort**: M — the mechanism is understood; the fix is a scoring adjustment that must then survive a re-run of the full SSLA-14 gate, and any index-time fix costs another ~9.5-hour reload.
**WSJF**: 6.0 — (12 × 1.0) / 2
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

The ADR-041 analyzer change (equivalent synonyms plus a synonym-free search analyzer, shipped to fix P069) alters term statistics enough to flip the ADR-025 street-level-first invariant on some addresses.

**ADR-025 Decision Driver 1** states it plainly: _"the exact street-level match must rank first for queries that contain no sub-unit token."_

Measured on the ADR-041 green domain (`addressr6`) against the live domain (`addressr5`) as control, both carrying identical data at exact doc parity (16,905,824):

Query `16 Gaze Rd Christmas Island` — contains **no** sub-unit token:

| #   | addressr5 (old analyzer)    | addressr6 (ADR-041 analyzer) |
| --- | --------------------------- | ---------------------------- |
| 1   | **16 GAZE RD** — 314.07     | UNIT 1, 16 GAZE RD — 59.02   |
| 2   | UNIT 3, 16 GAZE RD — 267.70 | UNIT 2, 16 GAZE RD — 59.02   |
| 3   | UNIT 1, 16 GAZE RD — 251.56 | UNIT 6, 16 GAZE RD — 59.02   |
| 4   | UNIT 2, 16 GAZE RD — 251.56 | **16 GAZE RD** — 55.66       |
| 5   | UNIT 6, 16 GAZE RD — 251.56 | UNIT 3, 16 GAZE RD — 51.88   |

The street-level match drops from #1 to #4, behind three of its own units. That is the P007 shape.

**This was predicted.** ADR-041's own Consequences (Bad) says: _"Alters term statistics. Two tokens sharing a position changes IDF and field-length norms, so relevance must be re-verified rather than assumed. ADR-025's and ADR-028's confirmation scenarios are at risk."_ They were at risk, and one broke. The gate did its job.

## Symptoms

On affected addresses, a query naming the street address without any unit token returns the unit records above the street-level record. Consumers are handed the wrong "best match" — precisely the complaint in issue #375.

## Scope — 13 of 14 SSLA-14 baseline queries still hold

Only one baseline query regressed. The following all match the old domain's top result on the new index:

- `278 ROSS RIVER RD AITKENVALE` — the **canonical ADR-025 P007 case** — still street-level first
- `19 Murray Rd Christmas Island` — ADR-025 P007 invariant — holds
- `104 GAZE RD CHRISTMAS ISLAND` — ADR-026 ranking invariant — holds
- `103-107 GAZE RD` canonical range, `495 Maroondah Hwy`, `138 Whitehorse Rd`, `225 drummond st carlton`, `1/19 Murray Rd`, `UNIT 1, 19 MURRAY RD`, `19 Muray Rd` (ADR-027 typo), `3053`, `TRAVEL INN HOTEL`, `Carlton VIC` — all hold

Two further notes on the gate run, recorded so a later reader does not re-chase them:

- `225 drummond st carlton` was initially reported as a failure. That was a **defect in the gate script**, not the index: it pinned expected-top to position 1 while the P026 baseline allows "position 1 or 2", and old and new are byte-identical there. Not a regression.
- `MURRAY RD CHRISTMAS ISLAND` (no-number query) returns a different equal-scoring doc at #1 on each domain. A tie-break shuffle among ties, not a ranking change.

## Workaround

None needed yet — **this was caught pre-cutover**. Production still serves `addressr5` on the old analyzer, so no consumer is affected. The workaround is simply not to cut over, which is the current state.

## Impact Assessment

- **Who is affected**: nobody today. If ADR-041 were cut over as-is, every RapidAPI consumer querying an affected street address would get the wrong best match.
- **Frequency**: deterministic per affected address; affects addresses with sub-units where the score gap between street-level and unit records was narrow enough for the norm shift to close it.
- **Severity**: Significant — wrong best-match on the primary product surface, and a regression of a previously-reported customer-visible bug.

## Root Cause Analysis

### Hypothesis

ADR-025's mechanism is a score-margin argument: with `ssla` populated symmetrically, a street-level doc scores `clean(sla) + clean(ssla)` and a sub-unit doc scores `noisy(sla) + clean(ssla)`, where `clean > noisy` because BM25 penalises the sub-unit's extra tokens and longer field length. The invariant holds only while that margin stays positive.

ADR-041 adds a co-positioned token (`RD` **and** `ROAD`) to every doc containing a street type. Field-length normalisation is roughly `1/sqrt(len)`, so adding one token to a **short** street-level doc costs proportionally more than adding one to a **longer** sub-unit doc. The margin narrows. Where it was already narrow, it inverts.

Consistent with the evidence: the invariant holds on `278 ROSS RIVER RD` and `19 MURRAY RD` (wide margins — note the old-domain gap of 314 vs 267 on GAZE RD was itself narrower in relative terms once rescaled) and breaks on `16 GAZE RD`.

The absolute score collapse (314 → 56) is a separate and expected consequence of the search analyzer no longer expanding synonyms; it is not itself the defect. The defect is the **order inversion**.

### Investigation Tasks

- [x] Reproduce against real production-scale data on both domains with identical content — done, exact doc parity 16,905,824.
- [x] Confirm which ADR invariant is violated and quote it — ADR-025 Decision Driver 1.
- [x] Establish the blast radius across the SSLA-14 baseline — 1 of 14 regressed, canonical P007 case unaffected.
- [ ] Confirm the field-length-norm hypothesis with `_explain` on both docs for the failing query, rather than reasoning from BM25 first principles.
- [ ] Quantify how many addresses are affected — sample street addresses that have sub-units and compare street-level rank across the two domains at scale, rather than extrapolating from one case.
- [ ] Decide the fix (see Candidate fixes) and re-run the full SSLA-14 gate against it.

## Candidate fixes

Not yet decided; recorded so the options are not re-derived.

1. **Boost street-level docs explicitly** — a query-side function-score or a `constant_score` bump for docs whose `sla` equals `ssla`. Query-side only, so no reindex, and it makes the ADR-025 invariant explicit rather than emergent from BM25 margins. ADR-025 considered and rejected a function-score approach (Option E) for a different reason; that rejection needs re-reading before reusing the shape.
2. **Normalise the synonym expansion out of the length norm** — e.g. index the synonym form into a separate field rather than co-positioned in `sla`/`ssla`. Removes the norm perturbation but changes the P069 fix's own mechanism and needs a reload to test.
3. **Accept and re-pin** — decide the new ordering is acceptable and amend ADR-025. Recorded for completeness; hard to justify given issue #375 is exactly this complaint from a real consumer.

## Dependencies

- **Blocks**: P069 cutover. The ADR-041 blue/green migration is halted at the relevance gate; the green domain is loaded, green, and verified for P069 itself, but must not take traffic until this is resolved.
- **Blocked by**: (none)
- **Composes with**: P007 (the original street-level-below-sub-units defect this re-opens).

## Related

- **ADR-025** — the invariant violated; its Decision Driver 1 is the pinned criterion.
- **ADR-041** — the change that caused it; its Consequences predicted exactly this risk and its Confirmation made the relevance gate mandatory pre-cutover, which is why this was caught.
- **P069** — the defect ADR-041 fixes. Note P069 itself is **confirmed fixed** on the green domain: `55 Pyrmont Bri` and `55 Harris S` both go from 0 hits to finding the target.
- **P007** / issue [#375](https://github.com/tompahoward/addressr/issues/375) — the original customer-reported form of this ranking bug.
- `docs/problems/026-baseline-v2.3.0.md` — the SSLA-14 baseline used as the gate.
- `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` — gate discipline: nothing proceeds until the prior step verifies.
