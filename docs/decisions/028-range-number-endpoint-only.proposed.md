---
status: 'proposed'
date: 2026-04-19
decision-makers: [Tom Howard]
consulted: []
informed: []
supersedes: [026-range-number-address-expansion]
reassessment-date: 2026-07-19
---

# ADR 028: Range-Number Address Expansion — Endpoint-Only

## Context and Problem Statement

[ADR 026](026-range-number-address-expansion.superseded.md) shipped in v2.3.0 with a `sla_range_expanded` field populated by **full interpolation**: for a G-NAF range like `103-107 GAZE RD`, the field contained five aliases (one per number 103, 104, 105, 106, 107). Post-deploy smoke of v2.3.0 revealed that interpolation produces **false positives**: a query for `"104 GAZE RD"` returned the `103-107` range document as a match, but under Australian addressing convention `104` is typically on the **opposite side of the street** — not part of the 103-107 property. Similarly, a query for `"105 GAZE RD"` returned the range doc, but `105` could equally represent:

- A separate property the range record absorbed when lots were consolidated, or
- A single contiguous frontage where only the endpoints (103 and 107) are the actual addresses of the property.

G-NAF's `NUMBER_FIRST` / `NUMBER_LAST` fields do not distinguish these cases. Returning the range doc for a mid-range query assumes facts we cannot verify, and in the common "opposite-side-of-street" case it is simply wrong.

The correct semantic: `NUMBER_FIRST` and `NUMBER_LAST` are **the two actual addresses associated with the property**, not interpolation keys for a numeric range.

This ADR supersedes ADR 026 and amends the indexing-half of P015 / [#367](https://github.com/mountain-pass/addressr/issues/367) accordingly.

### JTBD impact

- **J1 (Search and autocomplete)** — Web/App Developer, AI Assistant User: false-positive matches for mid-range numbers degrade "correct address appears in first page of results for reasonable queries" — the returned address is not the address the user typed.
- **J3 (Validate against G-NAF)** — Data Quality Analyst: "invalid addresses return empty results (not false positives)" is violated by the v2.3.0 behaviour. A batch validator asking "is 104 Gaze Rd a real address?" gets back a range doc that does not semantically contain 104.
- **AI Assistant User trust**: the persona is "frustrated by AI hallucinating addresses that don't exist"; addressr returning `103-107` for `104` query effectively participates in hallucination-shaped failures. The fix is a trust correctness improvement.

## Decision Drivers

- **Semantic correctness**: match only the addresses G-NAF actually records for the property — no inferred interpolation.
- **False-positive elimination** (J3): mid-range queries must not return the range doc when the mid-range number is not a documented endpoint.
- **Recall preservation on endpoints**: first- and last-endpoint queries (the reporter's `495`, `138`, `225`, `103` cases) must continue to resolve to the range doc.
- **Storage reduction**: fewer aliases per range doc → smaller index footprint than ADR 026 (Self-Hosted Operator persona RAM budget).
- **Engine-agnostic** (ADR 021): stays in data shape, portable.
- **Minimal disruption**: ADR 025 and ADR 027 invariants unchanged.

## Considered Options

### Option A — Endpoint-only (chosen)

Emit exactly two aliases per range doc: `[first-alias, last-alias]` for records where `first !== last` and both are positive integers. For 103-107 GAZE RD:

```json
"sla_range_expanded": [
  "103 GAZE RD, CHRISTMAS ISLAND OT 6798",
  "107 GAZE RD, CHRISTMAS ISLAND OT 6798"
]
```

Mid-range numbers (104, 105, 106) do not resolve to the range doc via `sla_range_expanded`.

- Good: semantically correct under Australian addressing convention.
- Good: zero false positives from interpolation.
- Good: storage footprint shrinks materially vs ADR 026 (2 aliases always vs up to 20).
- Good: `SPAN_CAP` becomes irrelevant — the outlier concern from ADR 026 (NSW max span 111,014) produces 2 aliases regardless.
- Good: preserves the `phrase_prefix` match path for endpoint queries (e.g. `"225 DRUMMOND ST CARLTON"` phrase-matches alias[0] = `"225 DRUMMOND ST, CARLTON VIC 3053"` cleanly, overcoming the `TRAVEL INN HOTEL` prefix that blocks phrase matching against `sla` directly).
- Bad: a consumer who built against v2.3.0 over the brief window it shipped and relied on mid-range interpolation returning the range doc will see those queries return fewer (correct) results in v2.4.0. Acceptable because v2.3.0's behaviour was defective; the "reliance" was on a false positive.

### Option B — Full interpolation (ADR 026, superseded)

Emit one alias per number in `[first, last]`. Span-capped to prevent outlier explosion.

- Good: sla_range_expanded matches mid-range numbers via phrase_prefix.
- Bad: **false positives** for every mid-range number. Fails J1 correctness and J3's "invalid addresses return empty results" outcome.
- Bad: larger storage footprint; requires SPAN_CAP to manage outliers.
- Rejected: correctness over recall-of-unverifiable-matches.

### Option C — Same-side interpolation (odd-only or even-only based on NUMBER_FIRST parity)

For a 103-107 range, emit [103, 105, 107] (odd-only because 103 and 107 are both odd). For 104-106 (hypothetical), emit [104, 106].

- Good: matches Australian convention that 103-107 = three properties on one side.
- Bad: still makes an assumption (105 _could_ be a property, but G-NAF doesn't prove it is). Fails the "no inferred matches" test.
- Bad: parity logic is brittle for mixed-parity ranges (103-106, which exists in G-NAF data as data-quality anomalies).
- Rejected per user guidance 2026-04-19: "105 should not even match - it requires too much assumption".

### Option D — No expansion at all

Drop `sla_range_expanded` entirely. Rely on whitecomma tokeniser splitting `"103-107"` into sla tokens `[103, 107]` so bool_prefix already matches endpoints.

- Good: simplest data shape.
- Bad: phrase_prefix fails for endpoint queries against range docs that have a building-name prefix. Example: query `"225 DRUMMOND ST CARLTON"` against `"TRAVEL INN HOTEL, 225-245 DRUMMOND ST, CARLTON VIC 3053"` — sla tokens have `225` but phrase `225 DRUMMOND ST CARLTON` requires `DRUMMOND` consecutive after `225`, which fails because `245` sits between them. Without `sla_range_expanded`, the range doc loses the phrase_prefix score boost that tips it above competing docs (the P026 CARSPACE vs range ranking issue).
- Rejected: loses the endpoint-query ranking win that Option A preserves.

## Decision Outcome

**Option A — endpoint-only.**

Primary driver: **J3 correctness** — returning false positives for mid-range queries was the core defect in ADR 026. Endpoint-only eliminates the false positives while preserving the endpoint-recall and endpoint-ranking wins that `sla_range_expanded` was introduced for.

**Interaction with ADR 025 — explicit non-triggering**: ADR 025's reassessment criterion 2 (changes to `multi_match type: 'bool_prefix'` that break summation symmetry) is not triggered. The `bool_prefix` field list `['sla', 'ssla']` is unchanged. `sla_range_expanded` remains confined to the `phrase_prefix` clause.

**Interaction with ADR 027 — complementary**: ADR 027 ships in the same release (v2.4.0) as this ADR. ADR 027 tunes fuzziness to prevent adjacent-number tf-inflation on `bool_prefix`; ADR 028 prevents mid-range false positives on `phrase_prefix`. Combined, a query like `"106 GAZE RD CHRISTMAS ISLAND"` returns only the non-range `106 GAZE RD` record (if it exists) and excludes both fuzzy-adjacent ranges (ADR 027) and the 103-107 range (ADR 028).

**Release bump level**: `minor`. Consistent with ADR 025 / ADR 026 / ADR 027 precedent — any consumer-visible ranking or result-set change on the RapidAPI listing warrants a minor bump. The combined v2.4.0 changeset covers both ADRs.

**Supersession framing**: this is a CORRECTION of v2.3.0's defective behaviour, not a regression of v2.2.0. v2.3.0 (2026-04-19) shipped ADR 026 with interpolation; within hours of ship, post-deploy smoke revealed the false-positive problem and this ADR replaces the decision. The brief window means consumer reliance on the interpolation behaviour is minimal.

## Consequences

### Good

- **J1 and J3 correctness restored**: mid-range queries return zero false positives. A consumer's `"104 Gaze Rd"` validation returns the actual non-range `104 Gaze Rd` record (if present in G-NAF) rather than a misleading range-doc match.
- **Endpoint recall preserved** (J1): `103`, `107`, `225`, `245`, `138`, `144`, `495`, `503` queries all continue to resolve to their respective range docs via endpoint aliases.
- **Index storage shrinks vs v2.3.0**: from up to 20 aliases per range doc down to 2. Self-Hosted Operator RAM budget improves compared to v2.3.0 baseline.
- **`SPAN_CAP` retired**: data-quality outliers (NSW 111k-span, VIC 9k-span) produce 2 aliases regardless. No magic number remains.
- **ADR 025, ADR 027, ADR 021 invariants preserved**.

### Neutral

- Reindex required on deploy to reshape existing `sla_range_expanded` entries. This is the existing ADR 006 loader pipeline — no new operational step.
- Storage drops relative to v2.3.0 but still marginally above v2.2.0 baseline (2 extra strings per range doc).

### Bad

- A consumer relying on mid-range interpolation from v2.3.0 loses those matches. Documented as a correctness fix, not a regression. Brief v2.3.0 exposure window limits impact.

## Confirmation

Implementation compliance is verified by:

- **Unit test** in `test/js/__tests__/range-expansion.test.mjs`: `expandRangeAliases(103, 107, ...)` returns exactly `["103 GAZE RD, ...", "107 GAZE RD, ..."]` (2 elements). Explicitly asserts mid-range numbers (104, 105, 106) are absent from the returned array.
- **Unit test** (same file): `expandRangeAliases(1, 111015, ...)` returns 2 elements (outlier-safe; no SPAN_CAP needed).
- **Unit test** in `test/js/__tests__/address-service.test.mjs`: existing source-pattern tests for `sla_range_expanded` attachment and `phrase_prefix` clause wiring remain valid — field placement and clause structure are unchanged from v2.3.0. Load-bearing `tie_breaker=0.0` assertion (carried over from ADR 026) is **still load-bearing under ADR 028** — the `phrase_prefix` best_fields combination still relies on absent-field contributing 0, and the `max(sla, ssla, sla_range_expanded)` semantic argument is unchanged.
- **Cucumber scenario — first-endpoint recall** in `addressv2.feature`: query `"103 GAZE RD CHRISTMAS ISLAND"` returns GAOT_717321171 in list.
- **Cucumber scenario — last-endpoint recall** in `addressv2.feature`: query `"107 GAZE RD CHRISTMAS ISLAND"` returns GAOT_717321171 in list.
- **Cucumber scenario — mid-range NOT a false positive** in `addressv2.feature`: query `"106 GAZE RD CHRISTMAS ISLAND"` does NOT return GAOT_717321171. This is the key correctness invariant ADR 028 delivers.
- **Cucumber scenario — canonical range form still ranks first** in `addressv2.feature`: query `"103-107 GAZE RD CHRISTMAS ISLAND"` returns GAOT_717321171 as top hit (non-regression).
- **Cucumber scenario — v1 first-endpoint recall** in `addresses.feature`: query `"103 GAZE RD CHRISTMAS ISLAND"` returns GAOT_717321171 in list across nodejs/rest/cli profiles.
- **Post-deploy diff against `docs/problems/026-baseline-v2.3.0.md`** 14-query baseline: queries 2, 3, 4 (`495 Maroondah Hwy`, `138 Whitehorse Rd`, `225 drummond st`) show target doc ranked first. Other queries (4, 5, 6, 7, 9, 10, 11, 13, 14) unchanged or narrower (fuzzy noise suppressed). Rank shifts must be bounded by the expectations enumerated in the baseline document.

## Pros and Cons of the Options

### Option A — Endpoint-only (chosen)

- Good: semantically correct. Zero false positives. Minimal storage. SPAN_CAP retired.
- Good: preserves endpoint recall and ranking wins from ADR 026.
- Bad: narrow reliance window on v2.3.0 interpolation loses those matches. Acceptable.

### Option B — Full interpolation (ADR 026 superseded)

- Good: matches mid-range queries.
- Bad: false positives. Fails J1/J3 correctness. Larger storage. SPAN_CAP required.

### Option C — Same-side interpolation

- Good: matches same-side convention.
- Bad: still assumes 105 is part of the property. Brittle on mixed-parity ranges.

### Option D — No expansion

- Good: simplest.
- Bad: phrase_prefix loss for building-name-prefixed range docs (TRAVEL INN HOTEL case). Endpoint ranking regresses.

## Reassessment Criteria

Re-visit this decision if any of the following occur:

- A G-NAF schema change introduces an explicit "properties-in-range" list field that disambiguates which mid-range numbers are actual property addresses. At that point, interpolation from authoritative data becomes viable.
- A user reports a legitimate case where mid-range numbers SHOULD have matched a range doc and endpoint-only produces a false negative (e.g., a subdivided block that retained one G-NAF record). Expect zero or very rare such reports; treat each individually.
- Backend migration under ADR 021 to an engine whose phrase-match semantics differ materially from OpenSearch's — re-evaluate whether two aliases still bind the endpoint-query ranking.
- `expandRangeAliases` test (endpoint-only assertion) is deleted or skipped without an ADR update — accepted invariant becomes unattributed.
- The `tie_breaker=0.0` unit-test assertion (carried over from ADR 026's load-bearing tests) is deleted or skipped. Under ADR 028 it remains load-bearing because the `phrase_prefix` best_fields-max combination still relies on absent-field-contributes-0.

## Related

- [Problem P015 — Range-number addresses not findable by base number](../problems/015-range-number-addresses-not-searchable-by-base-number.open.md) — the originating problem.
- [Problem P026 — Numeric fuzziness in bool_prefix inflates ranking of adjacent docs](../problems/026-numeric-fuzziness-inflates-ranking.open.md) — the sibling ranking problem addressed by ADR 027.
- [Baseline capture (v2.3.0)](../problems/026-baseline-v2.3.0.md) — pre-change smoke for post-deploy diff.
- [ADR 026 — Range-number address expansion (SUPERSEDED)](026-range-number-address-expansion.superseded.md) — the interpolation decision this supersedes.
- [ADR 027 — `fuzziness: 'AUTO:5,8'`](027-fuzziness-auto-5-8.proposed.md) — ships in the same release. Complementary fix.
- [ADR 025 — Symmetric `ssla` indexing](025-search-ranking-symmetric-ssla.accepted.md) — bool_prefix summation symmetry, explicit non-triggering.
- [ADR 021 — Retain OpenSearch, multi-backend plan](021-retain-opensearch-plan-multi-backend.proposed.md) — engine-agnosticism driver.
- [ADR 006 — G-NAF data source](006-gnaf-data-source.accepted.md) — `NUMBER_FIRST` / `NUMBER_LAST` semantics context.
- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — reporter `hirani89`'s 2022 cases and the semantic clarification applied here.
