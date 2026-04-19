# Problem 026: Numeric fuzziness in bool_prefix inflates ranking of adjacent docs over exact number matches

**Status**: Open
**Reported**: 2026-04-19
**Priority**: 12 (High) — Impact: Significant (4) x Likelihood: Possible (3)

## Description

The `searchForAddress` query builder at `service/address-service.js:984` applies `fuzziness: 'AUTO'` to the `bool_prefix` `multi_match` clause. AUTO allows a 1-character edit distance for 3-char tokens — which is ideal for typo tolerance on street and locality names but **harmful when the token is a street number**. Under the current query shape, a doc whose sla contains multiple numbers that each fuzzy-match the query number wins BM25 tf-inflation against a doc with the exact number but fewer fuzzy-adjacent numbers.

Reported in post-deploy smoke of v2.3.0 (2026-04-19). The ADR 026 fix addressed the recall gap in [issue #367](https://github.com/mountain-pass/addressr/issues/367) (cases 2, 3, 4) — the target range addresses now appear in the result list. But the ranking problem reporter `hirani89` originally described for case 3 ("comes up, but down the list") is still present, and a new observation on case 4 shows it too.

This is the **underlying problem** that [P015](./015-range-number-addresses-not-searchable-by-base-number.open.md) only partially addressed. P015 was scoped as recall ("addresses not findable by base number"), which is true for cases 2 and 4 but insufficient for case 3. The real user-facing job is: "my exact street number should be the first hit, not buried behind fuzzy-similar numbers."

## Symptoms

Measured against production `@mountainpass/addressr@2.3.0` on 2026-04-19:

**Case 3 of #367** — query `"138 Whitehorse Rd Blackburn"`:

| Rank | sla                                                      | Query `138` tf | Why                                                  |
| ---- | -------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| 1    | `135-137 WHITEHORSE RD, BLACKBURN VIC 3130`              | 2 (fuzzy)      | `135` and `137` both fuzzy-match `138` (1 edit each) |
| 2    | `128-132 WHITEHORSE RD, BLACKBURN VIC 3130`              | 2 (fuzzy)      | `132` and `128` — same fuzziness double-hit          |
| 3    | **`138-144 WHITEHORSE RD, BLACKBURN VIC 3130`** (target) | 1 (exact)      | `138` exact; `144` is 3 edits away — no fuzz         |

The fuzzy-adjacent ranges doubled their tf via two fuzzy hits each; the target range is stuck at tf=1. BM25 promotes the fuzzy matches above the exact one.

**Case 4 of #367** — query `"225 drummond st carlton"`:

| Rank | sla                                                                    | Notes                                                                                   |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1    | `CARSPACE 225, 255 DRUMMOND ST, CARLTON VIC 3053`                      | `225` exact + `255` fuzzy — tf=2                                                        |
| 6    | **`TRAVEL INN HOTEL, 225-245 DRUMMOND ST, CARLTON VIC 3053`** (target) | `225` exact + `245` fuzzy — tf=2, but longer field suffers length-normalisation penalty |

Both docs have tf=2 on `225` under current numeric fuzziness. The carspace-unit record wins because its sla has fewer tokens (BM25 length normalisation).

## Workaround

None. Consumers either teach end-users to type the full hyphenated range form (impractical for autocomplete) or accept that the "right" result may not be first. The documented first-result invariant in ADR 026 ("non-range exact match outranks range doc expanded match") is upheld — the bug is that **fuzzy-adjacent doc outranks exact target doc**, which ADR 026 did not specify as an invariant.

## Impact Assessment

- **Who is affected**: All RapidAPI consumers using `/addresses?q=<number> <street> <locality>` for autocomplete, validation, or routing. Same population as ADR 026.
- **Frequency**: Any query where the user supplies a specific street number AND adjacent numbers on the same street exist in G-NAF. Common in urban streets with dense numbering.
- **Severity**: Significant — the user-visible behaviour looks wrong. A consumer searching for their own address may see a nearby neighbour ranked above it. Resolves reporter `hirani89`'s 2022 follow-up on case 3 and the 2026 observation on case 4.
- **Analytics**: N/A (no per-query telemetry).

## Root Cause Analysis

### Current query shape (`service/address-service.js:982-1005`)

```js
should: [
  { multi_match: { fields: ['sla', 'ssla'], query: searchString, fuzziness: 'AUTO', type: 'bool_prefix', operator: 'AND' } },
  { multi_match: { fields: ['sla', 'ssla', 'sla_range_expanded'], query: searchString, type: 'phrase_prefix', operator: 'AND' } },
],
```

The `fuzziness: 'AUTO'` applies uniformly to every query token. Elasticsearch/OpenSearch's AUTO maps to max edit distance of 0 (short terms), 1 (3-5 chars), or 2 (6+ chars). Street numbers are almost always 2-5 digits → 1-char edit tolerated → adjacent numbers fuzzy-match.

### Why fuzziness on numbers is wrong

- Street numbers are not typos of each other. `138` and `137` are **different addresses**, not different spellings of the same address. Numeric fuzziness has no semantic basis.
- Typo tolerance on street/locality names (e.g., `Gorge` → `George`, `Canbera` → `Canberra`) is legitimate and wanted. Fuzziness serves this purpose well.
- The current query applies fuzziness to both, with no way to separate them — all query tokens use the same fuzziness setting.

### Why the tf-inflation dominates ranking

For query `"138 Whitehorse Rd Blackburn"` (4 tokens) against the two candidate docs:

| Doc         | Per-token tf                                       | Sum across [sla, ssla] (bool_prefix sums) |
| ----------- | -------------------------------------------------- | ----------------------------------------- |
| `135-137 …` | `138:2, Whitehorse:1, Rd:1, Blackburn:1` per field | 2+1+1+1 = 5 × 2 fields = 10               |
| `138-144 …` | `138:1, Whitehorse:1, Rd:1, Blackburn:1` per field | 1+1+1+1 = 4 × 2 fields = 8                |

The fuzzy-hit doc has 25% higher summed tf. BM25's field-length normalisation doesn't offset this because both docs have near-identical sla lengths. Phrase_prefix via ADR 026's `sla_range_expanded` boosts the target doc by some amount but not enough to overcome the 25% bool_prefix gap.

### Investigation Tasks

- [x] Confirm numeric fuzziness is the cause — smoke run against v2.3.0 on 2026-04-19 shows the exact pattern described above.
- [x] Confirm this is pre-existing (not an ADR 026 regression) — ADR 026 only added `sla_range_expanded` to the `phrase_prefix` clause; the `bool_prefix` fuzziness behaviour is unchanged from pre-v2.3.0 (and from pre-v2.0.0).
- [x] Confirm ADR 025 and ADR 026 ranking invariants still hold — they do. P007 sub-unit ranking unchanged; ADR 026 non-range-outranks-range still holds (there's no non-range 138 or 225-street-number record in these cases).
- [ ] Decide fix strategy — see Fix Strategy below.

## Fix Strategy (proposed)

**Split the query by token type and apply fuzziness selectively.**

Pre-process `searchString` in `searchForAddress`: tokenise using the same split rule as `whitecomma` (`/[\W,]+/`), classify each token as `numeric` (pure digits) or `non-numeric`, and build two `bool_prefix` clauses:

- Non-numeric tokens → `multi_match` with `fuzziness: 'AUTO'` (keeps typo tolerance for `Gorge` → `George` etc.)
- Numeric tokens → `multi_match` WITHOUT fuzziness (exact match only; `138` only matches `138`)

Restructure the outer bool clause from `should` to `must` for the recall clauses (both non-numeric AND numeric must match for the doc to be a hit), keeping `phrase_prefix` in `should` as the scoring boost.

This preserves:

- Typo tolerance for string tokens (street/locality names).
- Exact matching for numeric tokens — no more fuzzy-adjacent inflation.
- ADR 025's `bool_prefix` summation semantics — we're not touching the field list or fields' combination rules.
- ADR 026's `phrase_prefix` clause with `sla_range_expanded` and `tie_breaker=0.0` invariants — untouched.

Alternative options considered:

- **Boost `phrase_prefix` clause** — one-line change but arbitrary boost factor; may shift other rankings unpredictably. Rejected because it papers over the root cause.
- **Remove fuzziness entirely** — loses legitimate typo tolerance. Rejected.
- **Symmetric `sla_range_expanded` + `bool_prefix`** — +40-60% index growth and still doesn't fix the non-range case (carspace vs range). Rejected.

The chosen fix warrants a new ADR (ADR 027) because it changes the outer query shape (`should` → `must`) and introduces query-time token classification.

## Related

- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — reporter `hirani89`'s original 2022 report, specifically:
  - Case 3 comment [#1165031892](https://github.com/mountain-pass/addressr/issues/367#issuecomment-1165031892): "138-144 WHITEHORSE RD … does come up. Although it is down the list." This is the ranking problem, not the recall problem.
  - Case 4 comment [#1179803885](https://github.com/mountain-pass/addressr/issues/367#issuecomment-1179803885): "TRAVEL INN HOTEL, 225-245 … When you search for '225 drummond st, carlton', the address above does not show." Recall fixed in ADR 026 but ranking target (first result) not met.
- [P015 — Range-number addresses not findable by base number](./015-range-number-addresses-not-searchable-by-base-number.open.md) — originally captured the recall dimension. Closed by ADR 026 for cases 2 and 4 recall. This ticket captures the ranking dimension that P015's framing missed.
- [ADR 026](../decisions/026-range-number-address-expansion.proposed.md) — the recall fix. Ranking invariants documented there remain satisfied; this problem is orthogonal.
- [ADR 025](../decisions/025-search-ranking-symmetric-ssla.accepted.md) — `ssla` symmetric-population precedent; the `bool_prefix` summation-symmetry property from ADR 025 is preserved by the proposed fix (field list unchanged).
- [`service/address-service.js:982-1005`](../../service/address-service.js) — `searchForAddress` query-builder location.
