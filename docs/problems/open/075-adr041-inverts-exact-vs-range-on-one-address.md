# Problem 075: ADR-041 inverts exact-vs-range ranking on at least one address

**Status**: Open
**Reported**: 2026-07-31
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3). Impact 3: a consumer-visible wrong best-match on the revenue-generating `/addresses?q=` endpoint, but measured at a low rate rather than systemic. Likelihood 3: deterministic for the affected address, and the mechanism is general even though the sampled rate is near zero.
**Origin**: internal — surfaced 2026-07-31 re-verifying ADR-027's confirmation scenarios against the green domain during the ADR-041 blue/green soak, before cutover.
**Effort**: M — needs a corpus-scale exact-vs-range property check and a decision on whether the score-ratio compression itself is worth treating, which likely touches ADR-041 or ADR-028.
**WSJF**: 3.0 — (9 × 1.0) / 3
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

Querying `108 GAZE RD CHRISTMAS ISLAND` through the real API against both domains, on identical data, 2026-07-31:

| domain                          | 1st                          | 2nd                       |
| ------------------------------- | ---------------------------- | ------------------------- |
| BLUE `addressr5` (current prod) | `108 GAZE RD` — **317.08**   | `96-108 GAZE RD` — 260.81 |
| GREEN `addressr6` (ADR-041)     | `96-108 GAZE RD` — **63.30** | `108 GAZE RD` — 58.87     |

The exact-number address is outranked by the range address that contains it. Typing a complete exact address and getting the range record first is a wrong best-match on the primary product surface.

## Symptoms

An exact street address whose number is an endpoint of a range record on the same street returns the range record first.

## Workaround

None for consumers.

## Impact Assessment

- **Who is affected**: RapidAPI consumers querying an exact address that coincides with a range endpoint. Both paid and free tier.
- **Frequency**: one confirmed instance. A 120-probe sample found no others (see Blast radius) — so the realised rate is low, but the mechanism is general.
- **Severity**: Moderate — wrong best-match, on a narrow and so-far-unquantified slice.

## Root Cause Analysis

### Mechanism — score-ratio compression, the same one P073 documents

The absolute scores collapse from 317 to 59. Co-positioning `ROAD` alongside `RD` (and every other authority pair) roughly halves those terms' IDF, so each constant additive contribution compresses the **ratio** between competing documents. Blue has the exact winning by 21.6%; green compresses that to the range winning by 7.5%.

This is a **sibling of P073, not a duplicate**. Same mechanism, different invariant and different competitor document:

- P073 flips street-level-vs-sub-unit, where the competitor wins via the `phrase_prefix` clause against a sub-unit's `ssla` short form. That is ADR-025's surface.
- This flips exact-vs-range, where the competitor wins via ADR-028's `sla_range_expanded` last-endpoint alias — `96-108` emits an exact `108 GAZE RD` alias. That is ADR-028's surface.

Range documents have no `ssla` and reach the query through a different field, so a fix for one does not automatically address the other. Both are instances of a common parent — _ADR-041 co-positioning compresses BM25 ratios and flips narrow margins_ — which neither ticket is. Clustering them is a `/wr-itil:review-problems` job.

ADR-041 predicted this class in its own text: _"Puts ADR-025 (symmetric ssla) and ADR-028 (range-number expansion) confirmation scenarios at risk; both must be re-verified pre-cutover, not assumed."_ This is that re-verification finding it.

### Blast radius — measured, and small

120 range/exact probes sampled from real range documents across states, each queried through the real API against **both** domains:

| verdict      | blue | green |
| ------------ | ---- | ----- |
| exact-first  | 33   | 33    |
| range-first  | 1    | 1     |
| exact-absent | 76   | 75    |
| neither      | 6    | 7     |
| exact-only   | 4    | 4     |

**Zero cases where blue was exact-first and green was range-first.** So this is not systemic, and on this sample green is aggregate-neutral to blue — the same shape as P073. The `GAZE RD` case is a genuine individual flip that the random sample did not happen to include, which is itself worth noting: a 120-probe sample missed a known-real instance, so the sample bounds the rate loosely rather than proving near-zero.

### The other two ADR-027 scenarios pass

Verified green-vs-blue on the same run:

- `19 Muray Rd Christmas Island` → `GAOT_717321355` first on **both**. Five-character typo tolerance survives co-positioned tokens.
- `16 Gazz Rd Christmas Island` → no results on **both**. The documented four-character intentional loss holds.

### Investigation Tasks

- [x] Confirm the inversion against both domains on identical data through the real API.
- [x] Measure blast radius across a range/exact probe sample — 0/120 regressions.
- [ ] Characterise which exact-vs-range pairs are at risk. The 120-probe sample missed the one known instance, so the sampling frame needs re-designing around margin size rather than random selection.
- [ ] Decide whether the compression is worth treating at all, or whether per-case inversions inside an aggregate-neutral change are acceptable. This is the same disposition question P073 settled as "not a regression"; it should be settled once for the parent class, not three times.
- [ ] Build a **corpus-scale** exact-vs-range property check. A fixture-scale assertion cannot work — see P076.

## Dependencies

- **Blocks**: (none) — aggregate-neutral on the measured sample, so not a cutover blocker on its own evidence.
- **Blocked by**: (none)
- **Composes with**: P073 (same mechanism, ADR-025 surface), P074 (same corpus-scale gate-blindness lesson), P076 (the missing ADR-027 gate).

## Related

- **ADR-041** — the decision that introduces the co-positioning, and which predicted this class.
- **ADR-028** — owns `sla_range_expanded`; the endpoint alias is how the range document competes.
- **ADR-027** — the confirmation re-verification that surfaced this.
- **P073** / **P074** — siblings. Hang-off arbitration on 2026-07-31 returned PROCEED_NEW against all three of P073, P074 and P007: P073 is scoped end-to-end to ADR-025's invariant with an incompatible 145-address sample and a now-retracted opening premise; P074's remaining work is a property assertion for gates that exist and pass; P007 is a reopened record-keeping anchor that explicitly delegates to P074.
