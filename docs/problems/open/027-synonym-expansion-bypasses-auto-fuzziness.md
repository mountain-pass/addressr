# Problem 027: Synonym expansion on short-form street type bypasses AUTO:5,8 fuzziness

**Status**: Open
**Reported**: 2026-04-21
**Priority**: 12 (High) — Impact: Moderate (3) x Likelihood: Likely (4)

## Description

[ADR 027](../decisions/027-fuzziness-auto-5-8.proposed.md) set `fuzziness: 'AUTO:5,8'` on the `searchForAddress` `bool_prefix` `multi_match` clause so that 3-4 digit numeric tokens (street numbers, postcodes) require exact match. Post-deploy smoke against v2.4.0 shows the fuzziness tune **does not apply** when the query contains a short-form street type (e.g., `Rd`, `St`, `Ave`) in a non-last position AND includes additional locality tokens — specifically, the classic "number + street + street-type + locality" query shape that users type most often.

**Symptom query**: `"138 Whitehorse Rd Blackburn"` against production v2.4.0.

Expected under ADR 027:

- `138` (3-char, 0 edits under AUTO:5,8) matches only exact `138`.
- `135-137 WHITEHORSE RD` and `128-132 WHITEHORSE RD` neighbours should be excluded (don't contain token `138`).

Actual:

- `135-137 WHITEHORSE RD` ranks **first** at score 37.03 (tf=2 via fuzzy `138`→`135` and `138`→`137`).
- `128-132 WHITEHORSE RD` ranks **second** at 37.03 (tf=2 via fuzzy `138`→`128` and `138`→`132`).
- **`138-144 WHITEHORSE RD` (target) ranks third** at 32.10 — exact `138` token, tf=1.

These scores are nearly identical to the v2.3.0 baseline (35.76, 36.76, 32.10). The tf-2 inflation on adjacent ranges is consistent with **default `AUTO` (= AUTO:3,6)** being applied, not `AUTO:5,8`.

Reproduction evidence (2026-04-20 smoke against production v2.4.0):

| Query                                                        | Result                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `138 Whitehorse Rd Blackburn`                                | Fuzzy noise present: 135-137 / 128-132 fuzzy-match 138 and rank above target. |
| `138 WHITEHORSE ROAD BLACKBURN` (full `ROAD`)                | Clean — only exact 138 docs returned. Target first.                           |
| `138 Whitehorse Blackburn` (no `Rd`)                         | Clean — only target returned.                                                 |
| `138 Rd Blackburn` (Rd is last → prefix match)               | Clean — only exact 138 docs.                                                  |
| `138 Whitehorse Rd` (no BLACKBURN)                           | Clean — only exact 138 docs.                                                  |
| `104 GAZE RD CHRISTMAS ISLAND` (OT fixture)                  | Clean — only exact 104. AUTO:5,8 works.                                       |
| `16 Gazz Rd Christmas Island` (4-char typo for Gaze)         | Empty — `Gazz` gets 0 edits under AUTO:5,8. Works.                            |
| `139 Whitehorse Rd Blackburn` (same shape, different number) | Clean — only exact 139. AUTO:5,8 works.                                       |

The failure is specific to the combination of: short-form street-type token (`Rd`) in non-last position + full-query shape containing a numeric token that has fuzzy-adjacent neighbours. Not a generic fuzziness failure — the parameter IS honoured for most queries.

Reported during post-deploy smoke of [v2.4.0](../../CHANGELOG.md) (2026-04-20).

## Symptoms

- Exact numeric matches rank below fuzzy-adjacent docs for `number + street + Rd + locality`-shape queries.
- Replacing the short-form street type with the long form (e.g., `Rd` → `ROAD`) restores correct ranking.
- Removing the locality token from the query also restores correct ranking.
- Queries against the OT fixture (`CHRISTMAS ISLAND` locality) appear unaffected — the #367 case 3 failure is specific to VIC/NSW/QLD data (possibly a data-volume threshold where OpenSearch's query planner takes a different path).

## Workaround

- **Consumer workaround**: type the long form of the street type (`Road` instead of `Rd`).
- **API-side workaround** (none implemented): could normalise query tokens before sending to OpenSearch (strip or expand abbreviations client-side so the synonym filter isn't triggered on the query analyser).

Neither is acceptable as a long-term fix — users typing `Rd` is the dominant input form in Australian usage and autocomplete flows.

## Impact Assessment

- **Who is affected**: All RapidAPI consumers using the dominant query shape `<number> <street> <short-street-type> <locality>` — this is the vast majority of real-world address searches.
- **Frequency**: High — the default way Australians type addresses uses the short-form street type (`Rd`, `St`, `Ave`, `Hwy`).
- **Severity**: Moderate — the target address is still findable (often top-3), but is ranked below adjacent-number docs. Reopens the user-visible defect that ADR 027 was meant to close for #367 case 3 (`hirani89`'s 2022 "it comes up, but down the list" complaint).
- **Analytics**: N/A — no per-query telemetry from RapidAPI.

## Root Cause Analysis

### Hypothesis

OpenSearch 1.3.20's `match_bool_prefix` query builder, when encountering a synonym-expanded token in a non-last position, generates the internal bool query through a code path that does not propagate the outer `fuzziness: 'AUTO:5,8'` parameter to the constituent term queries. The fallback is default `AUTO` (= `AUTO:3,6`) with 1-edit tolerance on 3-char tokens.

### Evidence for the hypothesis

1. **Synonym filter present in the `my_analyzer`** (see [`client/elasticsearch.js:41-67`](../../client/elasticsearch.js)): `my_synonym_filter` expands street-type abbreviations bidirectionally (`RD ↔ ROAD`, `ST ↔ STREET`, `AVE ↔ AVENUE`, etc.). Loaded from G-NAF street type codes via `service/address-service.js:1312`.
2. **Position matters** — `Rd` as the LAST token is treated as a prefix query (`match_prefix` for `Rd*`) and does not go through the synonym expansion code path. Queries with `Rd` last (e.g., `138 Blackburn Rd` or `138 Rd Blackburn` [wait, Rd isn't last here]) — only `138 Whitehorse Rd` applies: clean. Queries with `Rd` in the middle fail.
3. **Long form bypasses the problem** — `138 WHITEHORSE ROAD BLACKBURN` with `ROAD` triggers synonym filter too (expanding back to `RD`), but the behaviour is different. Needs more investigation — possibly OpenSearch's synonym filter handles the "original token" path differently from the "expanded synonym" path.
4. **The fuzziness IS parsed correctly by OpenSearch 1.3** — OpenSearch 1.3.20 `Fuzziness.java` parses `AUTO:5,8` into `lowLimit=5, highLimit=8` (verified by reading upstream source).
5. **The fuzziness IS applied for other queries** — the OT fixture queries, the 139-prefix-query, the no-Rd query, and the no-BLACKBURN query all apply AUTO:5,8 correctly. The failure is specific to the synonym-expansion + middle-position + multi-token shape.

### Alternate hypotheses (less likely)

- Mixed-deploy / rolling EB slots — ruled out by consistent behaviour on retry.
- Index caching / stale data — ruled out by immediate reproducibility and consistent scoring.
- RapidAPI gateway response caching — possible but unlikely to persist so consistently across a fresh test hour.

### Investigation Tasks

- [ ] Add request-body logging to `service/address-service.js:searchForAddress` (DEBUG=es) and capture the exact OpenSearch query DSL generated for `138 Whitehorse Rd Blackburn` vs `138 WHITEHORSE ROAD BLACKBURN`. Compare the `fuzziness` parameter placement in the two bodies.
- [ ] Capture the OpenSearch `_search?explain=true` output for the same query to see which clause matched 135-137 and what edit distance was applied to `138`.
- [ ] Reproduce against a minimal OpenSearch 1.3.20 local instance with a hand-written query to confirm the synonym-in-middle + fuzziness:AUTO:m,n interaction.
- [ ] Search the OpenSearch and Elasticsearch issue trackers for known bugs matching this pattern (AUTO:m,n + synonyms + match_bool_prefix).
- [ ] Decide on fix approach — see Fix Strategy below.
- [ ] Create a reproduction Cucumber scenario (skipped until fix lands).
- [ ] Update ADR 027 Reassessment Criteria to reference this problem.

## Fix Strategy (proposed — not chosen yet)

Options ordered roughly by complexity:

1. **Client-side query normalisation** — pre-expand abbreviations before sending to OpenSearch. E.g., `Rd → Road` in the query string. Avoids the synonym filter entirely. One-line query-builder change but brittle (list of abbreviations must stay in sync with the synonym filter config).
2. **Disable synonym filter at query time** — use a separate `my_query_analyzer` that excludes `my_synonym_filter`. Indexing still applies synonyms (so `138 WHITEHORSE RD` is indexed as `[138, WHITEHORSE, RD, ROAD, BLACKBURN, ...]`), but query tokens stay literal. Requires a new analyser and per-field `search_analyzer` config in the mapping. Cleaner than (1) but requires reindex.
3. **Upgrade OpenSearch** — 1.3.20 is old. 2.x may have fixed this synonym + AUTO:m,n interaction. Significant operational change; may fix other latent issues.
4. **Use a numeric keyword field for numbers** — re-consider ADR 026 Option A (`sla_numbers` numeric keyword array) for number tokens. Bypass the text analyser/fuzziness interaction entirely for numeric tokens. Rejected in ADR 028 for complexity; revisit only if simpler options fail.
5. **Boost `phrase_prefix` clause** — increase the weight of `phrase_prefix` so `138-144`'s exact phrase match on `sla_range_expanded[0]` dominates over fuzzy-adjacent bool_prefix noise. Doesn't address the root cause.

Investigation (above) will narrow the choice. Option 2 (query-analyser split) looks most promising structurally but needs the diagnostic tasks completed first.

## Related

- [ADR 027 — `fuzziness: 'AUTO:5,8'` on bool_prefix](../decisions/027-fuzziness-auto-5-8.proposed.md) — this problem is a partial regression of ADR 027's correctness claim for the dominant query shape. Reassessment criterion #4 is triggered.
- [ADR 028 — Range-number endpoint-only expansion](../decisions/028-range-number-endpoint-only.proposed.md) — independent, not directly affected. Mid-range recall still correct under ADR 028 even with P027's fuzziness leak.
- [Problem P026 — Numeric fuzziness inflates ranking](./026-numeric-fuzziness-inflates-ranking.open.md) — the parent problem ADR 027 addressed. P027 is the edge case ADR 027 missed.
- [Problem P015 — Range-number addresses not findable by base number](./015-range-number-addresses-not-searchable-by-base-number.open.md) — originating problem for the whole thread.
- [GitHub issue #367](https://github.com/mountain-pass/addressr/issues/367) — reporter `hirani89`'s original 2022 case 3 ("`138-144 WHITEHORSE RD BLACKBURN` comes up, but down the list") that this problem re-opens.
- [Baseline capture (v2.3.0)](./026-baseline-v2.3.0.md) — 14-query pre-change snapshot; post-deploy diff confirmed this edge case.
- [`client/elasticsearch.js:41-67`](../../client/elasticsearch.js) — `my_analyzer` with `my_synonym_filter`.
- [`service/address-service.js:984-997`](../../service/address-service.js) — `searchForAddress` `bool_prefix` clause with `fuzziness: 'AUTO:5,8'`.
- [`service/address-service.js:1312-1319`](../../service/address-service.js) — synonym list construction.
- OpenSearch 1.3 `Fuzziness.java` — confirmed parses `AUTO:m,n` format correctly; the failure is further downstream in `match_bool_prefix` query generation.
