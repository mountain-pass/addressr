# Problem 007: Search scoring ranks exact address below sub-unit variants

**Status**: Open
**Reported**: 2026-04-15
**Priority**: 16 (High) — Impact: Significant (4) x Likelihood: Likely (4)

## Description

When searching for a street address that also has sub-unit variants indexed (shops, flats, units), the exact street-level match scores lower than — and sorts below — every sub-unit variant at the same address.

Reported in GitHub issue [#375](https://github.com/tompahoward/addressr/issues/375).

**Example:** Query `278 Ross River Rd Aitkenvale QLD 4814` returns:

| Rank | SLA                                          | Score     |
| ---- | -------------------------------------------- | --------- |
| 1    | SHOP 5, 278 ROSS RIVER RD, AITKENVALE QLD... | 95.32193  |
| 2    | SHOP 6, 278 ROSS RIVER RD, AITKENVALE QLD... | 95.32193  |
| 3    | SHOP 1, 278 ROSS RIVER RD, AITKENVALE QLD... | 95.30868  |
| ...  | ...                                          | ...       |
| last | 278 ROSS RIVER RD, AITKENVALE QLD 4814       | 70.179115 |

The final result — the exact match for the query — should rank first, not last.

Observed against the hosted `https://addressr.p.rapidapi.com/addresses` endpoint (v1).

## Symptoms

- Exact street-level address appears at the bottom of results when sub-unit variants exist at the same address.
- Sub-unit results (SHOP N, UNIT N, etc.) score noticeably higher than the street-level address despite the query containing no sub-unit token.
- Multiple sub-unit entries tie on score, suggesting score is dominated by shared tokens rather than query-specific matching.
- Affects RapidAPI consumers relying on first result as the "best match".

## Workaround

None identified yet. Consumers can post-process by preferring results without a flat/level/unit component when the query has none, but this is client-side work that should not be required.

## Impact Assessment

- **Who is affected**: All RapidAPI consumers (paid and free-tier) using `/addresses` search for addresses that have sub-units in G-NAF. Affects autocomplete and validation flows where the top result is assumed to be the best match.
- **Frequency**: Every query against a street address with indexed sub-units — common for commercial strips, apartment buildings, and shopping centres.
- **Severity**: Significant — API consumers receive incorrect ordering and, if taking the top result, the wrong address.
- **Analytics**: N/A — no query-quality telemetry currently captured.

## Root Cause Analysis

### Preliminary Hypothesis

Likely an Elasticsearch/OpenSearch query composition or field-weighting issue:

- Sub-unit records may contain all the query tokens plus extra tokens (SHOP, number) that inflate `tf`/`bm25` scoring, or boost longer documents via field norms.
- The query may not apply a phrase/exact-match boost for the street-level form, or may lack a penalty for documents with additional sub-unit tokens the query did not reference.
- Score ties across sub-units suggest the differentiating tokens (SHOP 5 vs SHOP 6) are not contributing, meaning the score is driven by shared fields.

### Investigation Tasks

- [ ] Locate the ES/OpenSearch query builder used by `/addresses` search (likely in `src/server/` or equivalent)
- [ ] Capture the exact query JSON sent to OpenSearch for the repro case
- [ ] Run the repro against a local index to confirm behaviour matches production
- [ ] Inspect `explain: true` output to identify which clauses/fields drive the sub-unit boost
- [ ] Create a failing reproduction test (cucumber or unit) that asserts exact-match ranks first
- [ ] Identify fix strategy — candidates: boost exact SLA match, penalise documents with extra sub-unit tokens not in query, field-weight adjustments

## Related

- GitHub issue [#375](https://github.com/tompahoward/addressr/issues/375) — original report
- GitHub issue [#365](https://github.com/tompahoward/addressr/issues/365) — partial search returning incorrect results (likely same query-builder code path; consider investigating together)
