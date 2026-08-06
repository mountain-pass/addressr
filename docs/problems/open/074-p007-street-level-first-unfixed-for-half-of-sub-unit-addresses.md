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

### Confirmed root cause 2026-08-06 — this is P078's mechanism

Confirmed by `_explain` against live production (`addressr6`) on 2026-08-06. **The cause is the per-shard `phrase_prefix` expansion-IDF mechanism recorded in P078**, not a failure of ADR-025's symmetric `ssla` indexing.

ADR-025's mechanism is verified **present and working**. The street-level document `GANSW718868682` carries `ssla = "8 WATERS RD, NEUTRAL BAY NSW 2089"`, identical to its `sla` — symmetric indexing is in the index as designed, and the `bool_prefix` clause scores the street-level document **higher** than the sub-unit, exactly as ADR-025 intended:

| clause                       | street-level `GANSW718868682` | sub-unit `GANSW718868613` |
| ---------------------------- | ----------------------------- | ------------------------- |
| `bool_prefix` on `sla`       | 12.4359                       | 11.3948                   |
| `bool_prefix` on `ssla`      | 12.2632                       | 11.7201                   |
| **`phrase_prefix` (max of)** | **22.0088**                   | **34.2438**               |
| total                        | 46.7079                       | 57.3587                   |

The entire 10.65-point deficit is the `phrase_prefix` clause, and its cause is visible in the matched terms:

```
sub-unit    ssla:"8 WATERS RD NEUTRAL BAY NSW (2089 2089E 2089S 2089A)"   idf sum 74.66
street-level ssla:"8 WATERS RD NEUTRAL BAY NSW (2089 2089A)"              idf sum 44.77
```

The final query token is rewritten into a MultiPhraseQuery whose last position holds the prefix-expansion set, and **BM25 sums the idf of every alternative at that position** — including alternatives the matching document does not contain. The sub-unit's shard happens to hold three extra terms beginning `2089` that each occur exactly once (`n=1`, idf 14.6287 apiece, ~43.9 points of pure noise). The street-level document's shard holds one such term (`n=2`, idf 14.1177). `tf` is near-identical and in fact slightly **favours** the street-level document (0.483 vs 0.459).

So the two documents are scored against different expansion sets purely because they landed on different shards. Nothing about either document or the quality of its match to the query is involved.

**`search_type=dfs_query_then_fetch` does not fix it** — re-tested here, byte-identical ranking. DFS globalises term statistics but the expansion set is rewritten per-shard before DFS gathers stats. This matches P078's finding exactly.

### This supersedes the preliminary observation

The earlier note below is **wrong** and is retained only for provenance:

> Every returned sub-unit carries an identical score (`53.560207`) … the street-level document is not scoring competitively at all. This is a **different failure from P073**.

The identical sub-unit scores are a consequence, not a cause: all eight sub-units share a shard and therefore share an expansion set, so they tie exactly. The street-level document _is_ in contention — it loses by ~10 points on one clause. **P078's Related section records P074 as "a different failure shape"; that is now falsified.** This measurement discharges P078 investigation task 3 affirmatively for P074.

### Why this was invisible

The SSLA-14 baseline and the Cucumber P007 scenarios sample addresses where the invariant **does** hold (`278 ROSS RIVER RD`, `19 MURRAY RD`, `16 GAZE RD`). Both gates pass while half the corpus violates the property. The gates pin _instances_, not the _property_.

Small states do not exhibit it at all: measured **0%** violations on both OT (5,186 docs) and TAS (375,613 docs). The failure concentrates in dense metro addresses with many sub-units. Any local or fixture-scale reproduction will therefore show a false clean bill of health.

### Candidate fixes, measured 2026-08-06

Measured against a fresh 150-address sample drawn randomly from sub-unit-bearing addresses nationally (harness rebuilt this session; the 2026-07-31 sample was not retained). Property under test is ADR-025 Decision Driver 1: querying the street-level address verbatim must return that street-level record at position 1. All candidates are **query-time only — no mapping change, no re-index.**

| Candidate                          | street-level-first violations | partial-prefix recall (per P078's 361-probe ladder) |
| ---------------------------------- | ----------------------------- | --------------------------------------------------- |
| baseline (production today)        | 94/150 = **62.7%**            | reference                                           |
| `max_expansions: 10`               | 87/150 = 58.0%                | not measured                                        |
| `max_expansions: 5`                | 67/150 = 44.7%                | not measured                                        |
| `max_expansions: 2`                | 28/150 = 18.7%                | not measured                                        |
| `max_expansions: 1`                | 1/150 = **0.7%**              | **loses 4 of 361** — rejected by P078               |
| `constant_score` wrapper, boost 20 | 3/150 = **2.0%**              | **neutral** — 128/361 vs baseline 129               |

The violation rate is monotone in the expansion count, which is itself confirmation of the mechanism.

**`constant_score` (P078 Option B) dominates.** It comes within 2 addresses of `max_expansions: 1` on this property (3 vs 1 of 150) while being recall-neutral where `max_expansions: 1` breaks ADR-041's superset property on the exact mid-typing shape P069 / issue #365 was closed on. It also fixes 8 exact-vs-range flips against `max_expansions: 1`'s 3 (P078's frame), and improves blue as well as green. It removes the idf sum from the clause entirely rather than truncating it, so it addresses the mechanism rather than its symptom.

Caveat on the recall column: the recall numbers are P078's, not re-measured here. A ladder built this session proved an invalid instrument — it counted results falling out of a fixed result window as recall losses, conflating re-ranking with matching. **Rebuilding a valid corpus-scale recall ladder is a prerequisite for landing any of these** (P078 investigation task 1, still open).

### Investigation Tasks

- [x] Measure the violation rate at corpus scale against live production — 73/145 = 50.3%.
- [x] Confirm through the public API rather than only the backend — done, `8 WATERS RD`.
- [x] Confirm it is not a regression from ADR-041 — ADR-041 measures 71/145 = 49.0% on the identical sample, marginally better.
- [x] Check whether smaller corpora reproduce it — they do not; OT and TAS both 0%.
- [x] Determine why the street-level document is not competitive, using `_explain` on a violating pair — done 2026-08-06; it is P078's per-shard expansion-IDF mechanism, and the street-level document _is_ in contention.
- [x] Decide the fix — `constant_score` wrapper on the `phrase_prefix` clause (P078 Option B), on the measurements above. Still requires a new ADR plus an ADR-025 amendment before it lands (see Fix Strategy).
- [ ] Build the corpus-scale partial-prefix recall ladder that gates the change (shared with P078 task 1) and re-verify `constant_score` against it.
- [ ] Widen the sample and characterise which addresses violate (sub-unit count? locality density? presence of a range?).
- [ ] Replace the instance-based P007 gates with a **property** assertion: for a street address with sub-units, the street-level record ranks above all of them.

## Fix Strategy

Wrap the `phrase_prefix` clause in `service/address-service.js:967-984` in a `constant_score` filter, removing its idf contribution so expansion-set composition can no longer influence the score. Intra-clause ranking falls to the `bool_prefix` clause, which is unaffected by the mechanism.

Blocking prerequisites, per the architecture review of 2026-08-06:

1. **A new ADR is required.** This is the fourth query-shape change on the revenue endpoint in the ADR-025 → ADR-027 → ADR-028 → ADR-041 lineage; precedent settles the grain. It must argue past ADR-025 Decision Driver 4 ("no tuning parameters"), which is a real obstacle for a `boost: 20` magic number.
2. **ADR-025 needs an amendment regardless.** Its recorded root cause is incomplete, its Consequences claim resolution of P007 that is falsified at 62.7%, and its Confirmation pins instances rather than the property. Add a reassessment criterion: _the Driver 1 property is measured at corpus scale and found violated, whether or not a user reports it._
3. **`test/integration/search-analysis.test.mjs:97-103` builds its own copy of the query body** rather than importing from the service. Changing the service without it leaves ADR-041's property test green while production diverges — the gate P069 was closed on is not load-bearing for this change until that copy is fixed.
4. **Re-run ADR-028's five endpoint-recall scenarios**; `sla_range_expanded` lives in this clause only, so range-endpoint recall runs entirely through the clause being modified.
5. **Sequence against P069**, which is in Verification Pending on this same clause with an open "re-check relevance scoring" task. Do not perturb the clause while its verification property is being altered underneath it.
6. Correct the stale `ADR 026` citations at `service/address-service.js:969-975` (ADR-026 was superseded by ADR-028).

## Dependencies

- **Blocks**: (none) — this is pre-existing production behaviour, not a migration blocker.
- **Blocked by**: (none)
- **Composes with**: P007 (the original defect, believed fixed by ADR-025), P073 (a narrower instance of the same invariant failing, on an address where it previously held).

## Related

- **ADR-025** — the decision whose Decision Driver 1 this violates, and whose mechanism needs re-examining.
- **P007** / issue [#375](https://github.com/tompahoward/addressr/issues/375) — the original customer report.
- **P073** — surfaced this; its blast-radius measurement is what exposed the 50%.
- `docs/problems/026-baseline-v2.3.0.md` — the SSLA-14 baseline that passes while the property is half-violated.
