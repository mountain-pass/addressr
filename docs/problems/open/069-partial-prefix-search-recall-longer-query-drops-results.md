# Problem 069: Partial-prefix search drops results a shorter query returns

**Status**: Open
**Reported**: 2026-07-29
**Origin**: inbound-reported (#365)
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4) — derived at capture. Impact 4 per RISK-POLICY § Impact: live RapidAPI search/autocomplete returns missing results for a valid, more-specific query, so paid and free-tier consumers get degraded results. Likelihood 4: reproduced by an external reporter and confirmed still present by the maintainer on 2026-07-29 (ADR-076 inbound-report evidence — honest field risk).
**Effort**: L — derived at capture: search-relevance / query-construction tuning in the `/addresses?q=` path (bool_prefix + fuzziness interaction), needs a live reproduction, a query-shape fix, and a behavioural regression test. Non-trivial relevance work — cf. P007 (search-scoring), P026 (numeric ranking).
**WSJF**: 4.0 — (16 × 1.0) / 4
**JTBD**: JTBD-202
**Persona**: web-app-developer

## Description

Reported at [mountain-pass/addressr#365](https://github.com/mountain-pass/addressr/issues/365): a longer, more specific partial query returns **fewer** results than a shorter one. The reporter's case: `55 Pyrmont` includes "55 Pyrmont Bridge Road…" in the results, but `55 Pyrmont Bri` does not.

Confirmed still reproducing on 2026-07-29 (maintainer). A prior review comment incorrectly implied the v2.3.0 search-quality work (auto-fuzziness, range-number expansion, numeric-token ranking) covered this; it does not — those addressed range-number recall (P015) and numeric ranking (P026), not the street-name-prefix recall path. The #365 comment was corrected to retract that claim.

## Symptoms

Adding more characters to a valid prefix query removes correct results that the shorter prefix returned. Affects the live `/addresses?q=` autocomplete/search endpoint.

## Reproduction (confirmed against prod 2026-07-29)

Live queries via the RapidAPI gateway:

| query               | result count | includes `55 PYRMONT BRIDGE RD`? |
| ------------------- | -----------: | -------------------------------- |
| `55 Pyrmont`        |            8 | yes (score 12.51, 2nd result)    |
| `55 Pyrmont Bri`    |        **0** | no — empty result set            |
| `55 Pyrmont Bridge` |            4 | yes                              |

The trailing **partial** token `Bri` zeroes the whole result set, while the shorter query (8 results) and the full-word query `Bridge` (4 results) both return the target. So the defect is specific to an incomplete final token.

## Workaround

None for consumers. A shorter query returns the target; typing the full street name prefix drops it.

## Impact Assessment

- **Who is affected**: RapidAPI consumers using autocomplete/partial search (the primary product use case); both paid and free tier.
- **Frequency**: reproducible on the specific query class (street-name prefix following a number); likely a broader class of prefix queries.
- **Severity**: Significant — degraded search results on the revenue-generating endpoint.

## Root Cause Analysis

### Hypothesis (sharpened by the 2026-07-29 reproduction)

The reproduction narrows it: `55 Pyrmont Bridge` (full word) returns 4 results but `55 Pyrmont Bri` (partial) returns 0. So the **final, incomplete token is not being prefix-matched** — it is matched as a complete term, finds no `Bri` token in the index, and because it is a required (AND) clause the whole query zeroes out. A correct `match_bool_prefix` treats the last token as a prefix, so `Bri` should match `Bridge`. Likely causes to check: the query is built with `match` / `multi_match` (not `match_bool_prefix` / `bool_prefix` on the last term), or `minimum_should_match` forces the partial term as required. Confirm against the actual OpenSearch query the `/addresses?q=` handler builds and the field analyzer/mapping.

### Investigation Tasks

- [ ] Reproduce against live/prod search: `q=55 Pyrmont` vs `q=55 Pyrmont Bri`, capture both result sets and the underlying OpenSearch query. (Requires a working query path — RapidAPI subscription or the gateway auth header; see [[reference_addressr_secrets]].)
- [ ] Determine why the extra prefix token excludes rather than ranks the target — analyzer, `minimum_should_match`, or bool_prefix field mapping.
- [ ] Fix the query construction so a longer valid prefix never drops a result the shorter prefix returned.
- [ ] Add a behavioural regression test covering the #365 case and the general "longer prefix ⊇ shorter prefix" property.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P007 (search-scoring / ranking), P026 (numeric ranking, closed) — same search-relevance subsystem.

## Related

- Origin: [mountain-pass/addressr#365](https://github.com/mountain-pass/addressr/issues/365) (external reporter; comment corrected 2026-07-29).
- Distinct from P015 (range-number recall, closed) and P026 (numeric ranking, closed) — those did not cover street-name-prefix recall.

## Reported Upstream

- **Origin issue**: https://github.com/mountain-pass/addressr/issues/365
- **Acknowledged**: 2026-07-29 — corrected the earlier over-claim; confirmed still open (comment `5109833126`).
