# Problem 007: Search scoring ranks exact address below sub-unit variants

## REOPENED 2026-07-31 — the fix was verified on instances, not on the property

Closed on the strength of ADR-025 (symmetric `ssla` indexing) plus the SSLA-14 baseline and Cucumber scenarios. Those gates all still pass. **The defect is nonetheless still live for about half of the affected addresses.**

Measured against live production (`addressr5`) on 2026-07-31: 145 street-level addresses that also have sub-units, each queried exactly as written with no sub-unit token, checking whether the street-level record ranks first per ADR-025 Decision Driver 1.

**73 of 145 = 50.3% return a sub-unit first.**

Confirmed through the public RapidAPI endpoint, not only the backend. `8 WATERS RD, NEUTRAL BAY NSW 2089` returns eight UNIT records and never the street-level address, every one scoring an identical `53.560207`. The bare street-level document exists in the index and does not appear on the first page.

**Why the closure held despite this.** The gates pin _instances_ that happen to work — `278 ROSS RIVER RD`, `19 MURRAY RD`, `16 GAZE RD` — rather than the _property_ ADR-025 Decision Driver 1 actually states. A green baseline was read as a fixed defect.

**Why nobody noticed since.** The failure concentrates in dense metro addresses with many sub-units. Small corpora give a false clean bill of health: measured **0%** violations on both the OT fixture (5,186 docs) and a full TAS load (375,613 docs). Any local or fixture-scale reproduction will look healthy.

Surfaced while measuring the blast radius of P073, which was itself opened on the mistaken premise that ADR-041 had introduced this. It had not — the ADR-041 index measures 71/145 (49.0%) on the identical sample, marginally better than production.

Investigation, remediation and the fix decision are tracked on **P074**, which carries the full measurement and the open tasks. This ticket is reopened so the closure record does not stand as evidence that the defect is resolved.

**Root cause confirmed 2026-08-06 — and it is not the one recorded below.** The "Confirmed Root Cause" section of this ticket (per-field `bool_prefix` summation asymmetry) was real and _was_ fixed by ADR-025; symmetric `ssla` indexing is verified present in the production index and the `bool_prefix` clause now scores the street-level document higher, as designed. The live defect has a **different cause in the sibling `phrase_prefix` clause**: BM25 sums the idf of every term in a per-shard prefix-expansion set, so two documents matching the identical phrase score differently based on which unrelated rare terms happen to share the query's last-token prefix on their own shard. That is the mechanism recorded in **P078**. Full `_explain` evidence, the measured 62.7% violation rate, and the candidate-fix comparison are on **P074**; the mechanism is on **P078**. Read the Root Cause Analysis below as historical.

**Status**: Known Error — REOPENED 2026-07-31
**Reported**: 2026-04-15
**Origin**: inbound-reported (#375)
**Priority**: 16 (High) — Impact: Significant (4) x Likelihood: Likely (4)

> **DISCHARGED 2026-08-08. The reporter has been told.** [Comment 5223522329](https://github.com/mountain-pass/addressr/issues/375#issuecomment-5223522329) on issue [#375](https://github.com/mountain-pass/addressr/issues/375) retracts the April claim, names the real cause, and records what shipped in 3.0.8. The note below is retained because its diagnosis of _why_ nothing fired outbound is still live for other tickets.
>
> The original state: issue #375 was CLOSED, carrying a comment headed "Fix deployed — verified in production" dated 2026-04-16. That comment was accurate about what it verified and wrong about what it generalised to: it checked a single address, and the property failed for 62.7% of sub-unit-bearing addresses. This ticket was reopened 2026-07-31 and nothing fired outbound.
>
> The reason is mechanical, and it is why the `**Origin**` field above was added on 2026-08-07: the ADR-024 lifecycle-update path keys on `**Origin**: inbound-reported (#NN)`, and this ticket did not carry it. Its sibling [P069](../verifying/069-partial-prefix-search-recall-longer-query-drops-results.md) did, and its reporter got both a mid-course correction and a close notice on issue #365. Same session, same maintainer, opposite outcome, decided entirely by a missing field.
>
> Maintainer direction 2026-08-07 was **do not correct #375 until the fix actually ships.** The condition was satisfied on 2026-08-08 when 3.0.8 released, and the correction was posted the same day. **Both release-gated guards below are therefore spent, and this is the dangerous moment for them**: a guard whose condition is met reads as permission, so the sentences are rewritten rather than left to be re-read as a green light.
>
> **The reason the `/wr-itil:update-upstream 007` guard mattered has been removed at its source.** That guard existed because this ticket's `## Fix Released` section carried the falsified April text, and the ADR-024 lifecycle dispatch reads that section verbatim under a no-invention rule. With the release condition met, the dispatch would have sourced a second "verified in production" claim from falsified prose and posted it to the reporter hours after the retraction. The section has now been replaced with the real 3.0.8 record, so the hazard is gone rather than merely fenced. The structural note stands for other tickets: this one carries no `## Upstream Lifecycle Updates` log, so the skill's Step 3 table resolves `(none) + .known-error.md` to a fresh Open → Known Error and would read an April transition as current.

## Description

When searching for a street address that also has sub-unit variants indexed (shops, flats, units), the exact street-level match scores lower than — and sorts below — every sub-unit variant at the same address.

Reported in GitHub issue [#375](https://github.com/mountain-pass/addressr/issues/375).

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

- Query builder: [`service/address-service.js:950-1003`](../../../service/address-service.js) — `searchForAddress`.
- Mapping: [`client/elasticsearch.js:86-104`](../../../client/elasticsearch.js) — both `sla` and `ssla` use the same analyzer with no `boost` differentiation.
- Short-SLA construction: [`service/address-service.js:779-784`](../../../service/address-service.js) — `ssla` only set when `structured.flat != undefined`.
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

## Fix Released

Released in **3.0.8** on 2026-08-08. The reporter has been told: [issue #375 comment 5223522329](https://github.com/mountain-pass/addressr/issues/375#issuecomment-5223522329) retracts the April claim and records what actually shipped.

The v2.2.0 fix was real but was not the deciding clause. `bool_prefix` summation was fixed and has ranked correctly since; the sibling `match_phrase_prefix` clause was overriding it, and that clause matched a phrase anywhere in a field rather than from the start, so a sub-unit's address contained its parent's whole token sequence and no scoring adjustment to it was well-posed. [ADR-043 — Keyword-prefix anchor for street-level-first ranking](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.proposed.md) replaces it with a keyword-prefix anchor on `sla.raw` / `ssla.raw`.

Confirmed on the live public API after deploy, not against the index: `8 WATERS RD, NEUTRAL BAY NSW 2089` returns that address first; `14/2 Parkes St` and `Unit 14, 2 Parkes St` both return the same sub-unit record. Pre-release, the street-level record failed to rank first in **0 of 150** addresses on a freshly drawn national sample, against 60.0% of a 120-address baseline draw.

Awaiting maintainer verification before this ticket closes. Tracked on [P074](../verifying/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md).

### The April claim, retained for provenance

Superseded by the section above and by the posted retraction. It verified a single address; the property it was taken to establish failed for 62.7% of sub-unit-bearing addresses when re-measured on 2026-08-06.

> Deployed in v2.2.0 (released 2026-04-16, PR #451). Verified in production 2026-04-17.
>
> Verification: query `278 ROSS RIVER RD AITKENVALE QLD 4814` against the live RapidAPI endpoint — first result is now `278 ROSS RIVER RD, AITKENVALE QLD 4814` (no SHOP/UNIT prefix). Confirmed by user.

## Related

- [ADR 025 — Symmetric `ssla` indexing for search ranking](../../decisions/025-search-ranking-symmetric-ssla.accepted.md) — records the fix decision. Note: the implementation chose **Option B (symmetric `ssla` indexing)** rather than the `dis_max` approach originally recommended in the Fix Strategy section above. See ADR 025 for the full options comparison and rationale (primary driver: engine-agnosticism per ADR 021).
- GitHub issue [#375](https://github.com/mountain-pass/addressr/issues/375) — original report
- GitHub issue [#365](https://github.com/mountain-pass/addressr/issues/365) — partial search returning incorrect results (likely same query-builder code path; consider investigating together)
