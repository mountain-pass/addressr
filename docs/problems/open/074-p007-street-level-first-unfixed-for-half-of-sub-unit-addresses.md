# Problem 074: P007 street-level-first is unfixed for ~50% of addresses with sub-units

**Status**: Open
**Reported**: 2026-07-31
**Origin**: internal — surfaced 2026-07-31 while measuring the blast radius of P073.
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Almost certain (4). Impact 4 per RISK-POLICY § Impact: paid and free RapidAPI consumers are handed the wrong "best match" on the revenue-generating `/addresses?q=` endpoint. This is the defect issue [#375](https://github.com/tompahoward/addressr/issues/375) reported and that ADR-025 was written to fix. Likelihood 4: measured at 50.3% of a 145-address sample against live production, and deterministic per address.
**Effort**: L — a scoring/ranking fix on the search-relevance path, needing a corpus-scale before/after measurement rather than a spot check, and very likely an ADR-025 amendment.
**WSJF**: 4.0 — (16 × 1.0) / 4
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

ADR-025 (Symmetric `ssla` Indexing for Search Ranking) was accepted to fix P007: for a query carrying no sub-unit token, the exact street-level match must rank first, above sub-units at that address. Its Decision Driver 1 states this as a correctness requirement.

**It is unfixed for about half of the affected addresses.** Measured 2026-07-31 against live production (`addressr5`): 145 street-level addresses that also have sub-units, each queried exactly as written, checking whether the street-level record ranks first.

**73 of 145 = 50.3% return a sub-unit first.**

Confirmed end to end through the live RapidAPI endpoint, not just against the backend. `8 WATERS RD, NEUTRAL BAY NSW 2089`:

| #   | result                                     | score     |
| --- | ------------------------------------------ | --------- |
| 1   | UNIT 1, 8 WATERS RD, NEUTRAL BAY NSW 2089  | 53.560207 |
| 2   | UNIT 1, 8 WATERS RD, NEUTRAL BAY NSW 2089  | 53.560207 |
| 3   | UNIT 11, 8 WATERS RD, NEUTRAL BAY NSW 2089 | 53.560207 |
| 4   | UNIT 19, 8 WATERS RD, NEUTRAL BAY NSW 2089 | 53.560207 |
| …   | … all eight results are UNIT records       | 53.560207 |

The bare `8 WATERS RD, NEUTRAL BAY NSW 2089` document **exists in the index** and is not returned at all in the first page.

## Symptoms

Querying a street address that has sub-units returns the sub-units and not the street-level address. Consumers are handed the wrong best match. This is precisely the complaint in issue #375.

## Workaround

None for consumers.

## Impact Assessment

- **Who is affected**: RapidAPI consumers querying any street address with sub-units — concentrated in dense metro addresses, which is where consumer traffic concentrates. Both paid and free tier.
- **Frequency**: 50.3% of a 145-address sample. Deterministic per address.
- **Severity**: Significant — wrong best-match on the primary product surface, on a previously-reported customer-visible defect believed fixed.

## Root Cause Analysis

### Preliminary observation — not yet a confirmed root cause

Every returned sub-unit in the `8 WATERS RD` case carries an **identical score** (`53.560207`). That is the diagnostic signal: the sub-units are tying, so the `sort` tie-break (`_score`, `confidence` desc, `ssla.raw` asc, `sla.raw` asc) determines the order, and the street-level document is not scoring competitively at all.

This is a **different failure from P073**. P073 is a narrow margin inversion (55.66 vs 59.02) driven by length-norm compression. Here the street-level document appears not to be in contention.

Hypothesis to test: ADR-025's mechanism scores a street-level doc as `clean(sla) + clean(ssla)` and a sub-unit as `noisy(sla) + clean(ssla)`, relying on `clean > noisy`. When the query is the _full_ street address including locality, state and postcode, the sub-unit's `ssla` short form (`1/8 WATERS RD, NEUTRAL BAY NSW 2089`) may match the query nearly as well as the street-level form while the extra `UNIT n` tokens cost less than assumed — collapsing the margin the ADR depends on.

### Why this was invisible

The SSLA-14 baseline and the Cucumber P007 scenarios sample addresses where the invariant **does** hold (`278 ROSS RIVER RD`, `19 MURRAY RD`, `16 GAZE RD`). Both gates pass while half the corpus violates the property. The gates pin _instances_, not the _property_.

Small states do not exhibit it at all: measured **0%** violations on both OT (5,186 docs) and TAS (375,613 docs). The failure concentrates in dense metro addresses with many sub-units. Any local or fixture-scale reproduction will therefore show a false clean bill of health.

### Investigation Tasks

- [x] Measure the violation rate at corpus scale against live production — 73/145 = 50.3%.
- [x] Confirm through the public API rather than only the backend — done, `8 WATERS RD`.
- [x] Confirm it is not a regression from ADR-041 — ADR-041 measures 71/145 = 49.0% on the identical sample, marginally better.
- [x] Check whether smaller corpora reproduce it — they do not; OT and TAS both 0%.
- [ ] Determine why the street-level document is not competitive, using `_explain` on a violating pair.
- [ ] Widen the sample and characterise which addresses violate (sub-unit count? locality density? presence of a range?).
- [ ] Decide the fix and whether it amends ADR-025.
- [ ] Replace the instance-based P007 gates with a **property** assertion: for a street address with sub-units, the street-level record ranks above all of them.

## Dependencies

- **Blocks**: (none) — this is pre-existing production behaviour, not a migration blocker.
- **Blocked by**: (none)
- **Composes with**: P007 (the original defect, believed fixed by ADR-025), P073 (a narrower instance of the same invariant failing, on an address where it previously held).

## Related

- **ADR-025** — the decision whose Decision Driver 1 this violates, and whose mechanism needs re-examining.
- **P007** / issue [#375](https://github.com/tompahoward/addressr/issues/375) — the original customer report.
- **P073** — surfaced this; its blast-radius measurement is what exposed the 50%.
- `docs/problems/026-baseline-v2.3.0.md` — the SSLA-14 baseline that passes while the property is half-violated.
