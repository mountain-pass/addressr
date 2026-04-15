# Problem 007: Search scoring ranks exact address below sub-unit variants

**Status**: Known Error
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

### Confirmed Root Cause

The query builder in `service/address-service.js:950-1003` (`searchForAddress`) constructs a `bool.should` with two `multi_match` clauses over the fields `['sla', 'ssla']`:

```js
multi_match: {
  fields: ['sla', 'ssla'],
  query: searchString,
  type: 'bool_prefix',  // combines per-field scores like most_fields (SUM)
  // ...
}
```

**Index state** (per `client/elasticsearch.js:86-104` and the mapping in `service/address-service.js:779-784`):

- Every address document has a `sla` field (the full Street Level Address, including any flat/unit prefix).
- Sub-unit documents (those with a `FLAT_NUMBER`) _also_ populate a second `ssla` field — the Short SLA — which is the same address _with the flat/unit stripped_. E.g. for `GAOT_717882967` (UNIT 1, 19 MURRAY RD): `sla = "UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND OT 6798"`, `ssla = "1/19 MURRAY RD, CHRISTMAS ISLAND OT 6798"`.
- Street-level documents (no flat) have `ssla` unset.

**Scoring pathology**:

Elasticsearch/OpenSearch `multi_match` with `type: "bool_prefix"` combines per-field scores by **summation** (most-fields semantics), not by taking the maximum (best-fields semantics). Consequently:

- A sub-unit document matches both `sla` (partially — the unit tokens are noise) AND `ssla` (cleanly — the stripped form matches the query phrase). Score = `score(sla) + score(ssla)`.
- An exact street-level document matches only `sla`. Score = `score(sla)`.

The sub-unit documents receive roughly **double** the score contribution, which matches the observed `95.32` vs `70.18` ratio for the `278 Ross River Rd` query. The score ties across SHOP 1/5/6 at the same address are also explained: the shared `ssla` (`278 Ross River Rd, ...`) dominates, and the differentiating `SHOP N` tokens live in `sla` where they are query-irrelevant noise.

### Evidence

- Query builder: [`service/address-service.js:950-1003`](../../service/address-service.js) — `searchForAddress`.
- Mapping: [`client/elasticsearch.js:86-104`](../../client/elasticsearch.js) — both `sla` and `ssla` use the same analyzer with no `boost` differentiation.
- Short-SLA construction: [`service/address-service.js:779-784`](../../service/address-service.js) — `ssla` only set when `structured.flat != undefined`.
- Reproduction case in the CI fixture (OT / Christmas Island): `19 MURRAY RD, CHRISTMAS ISLAND OT 6798` (pid `GAOT_717321355`) coexists with `UNIT 1/2/3, 19 MURRAY RD` (pids `GAOT_717882967/9/71`) on street locality `OT677711`. The failing Cucumber scenario `P007 Exact street address ranks first over sub-unit variants` in `test/resources/features/addressv2.feature` encodes this repro and is currently tagged `@not-rest2 @not-cli2` until the fix lands.
- Elasticsearch documentation for `multi_match` confirms `bool_prefix` uses most-fields (sum) combination: the last term is translated to a `prefix` query and scores across fields are summed, unlike `best_fields` which takes the dis_max.

### Investigation Tasks

- [x] Locate the ES/OpenSearch query builder used by `/addresses` search (`service/address-service.js:950`)
- [x] Capture the exact query structure sent to OpenSearch for the repro case
- [x] Identify the field layout that causes sub-unit docs to double-score (`sla` + `ssla` both populated)
- [x] Create a failing reproduction test (Cucumber scenario in `addressv2.feature`, skipped via tags)
- [x] Identify fix strategy (see below)

## Fix Strategy

Change per-field score combination from summation to maximum so a clean match on `ssla` no longer stacks on top of a noisy match on `sla`.

**Preferred implementation**: wrap each field subquery in a `dis_max` (or switch `type` to `best_fields` with a small `tie_breaker`), e.g.:

```js
{
  dis_max: {
    tie_breaker: 0.1,
    queries: [
      { match_bool_prefix: { sla:  { query: searchString, fuzziness: 'AUTO', operator: 'AND' } } },
      { match_bool_prefix: { ssla: { query: searchString, fuzziness: 'AUTO', operator: 'AND' } } },
    ],
  },
}
```

Apply the same treatment to the `phrase_prefix` clause.

**Alternative** (smaller diff): change `type: 'bool_prefix'` to `type: 'best_fields'` — but `best_fields` changes prefix-matching semantics for the last term, which may regress autocomplete-style queries. `dis_max` keeps the `bool_prefix` semantics while fixing the score combination.

**Verification**:

1. Unskip the Cucumber scenario (remove `@not-rest2 @not-cli2` tags) — it should go green.
2. Re-run the manual repro against the fixture and confirm `19 MURRAY RD` outranks `UNIT 1/2/3, 19 MURRAY RD`.
3. Manually verify against the production RapidAPI endpoint with `278 ROSS RIVER RD AITKENVALE QLD 4814` post-deploy.
4. Regression-check the existing `Search` / `Search and next` scenarios still pass (they search for `MURRAY RD, CHRISTMAS ISLAND ISLAND`, a looser query where the current ordering is acceptable).

## Workaround

Until the fix is released, API consumers who query a street-level address and want the non-sub-unit result can filter locally: ignore hits where the `sla` contains a `FLAT`/`UNIT`/`SHOP`/`LEVEL` token if the query did not contain one. This is client-side work but unblocks the wrong-"best-match" symptom.

## Related

- [ADR 025 — Symmetric `ssla` indexing for search ranking](../decisions/025-search-ranking-symmetric-ssla.proposed.md) — records the fix decision. Note: the implementation chose **Option B (symmetric `ssla` indexing)** rather than the `dis_max` approach originally recommended in the Fix Strategy section above. See ADR 025 for the full options comparison and rationale (primary driver: engine-agnosticism per ADR 021).
- GitHub issue [#375](https://github.com/tompahoward/addressr/issues/375) — original report
- GitHub issue [#365](https://github.com/tompahoward/addressr/issues/365) — partial search returning incorrect results (likely same query-builder code path; consider investigating together)
