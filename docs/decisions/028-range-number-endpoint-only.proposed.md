---
human-oversight: confirmed
oversight-date: 2026-07-18
status: 'proposed'
date: 2026-04-19
decision-makers: [Tom Howard]
consulted: []
informed: []
supersedes: [026-range-number-address-expansion]
reassessment-date: 2026-10-29
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
- Good: **(withdrawn 2026-08-08 by ADR 043 — that clause no longer exists)** preserves the `phrase_prefix` match path for endpoint queries (e.g. `"225 DRUMMOND ST CARLTON"` phrase-matches alias[0] = `"225 DRUMMOND ST, CARLTON VIC 3053"` cleanly, overcoming the `TRAVEL INN HOTEL` prefix that blocks phrase matching against `sla` directly).
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

Primary driver: **J3 correctness** — returning false positives for mid-range queries was the core defect in ADR 026. Endpoint-only eliminates the false positives while preserving the endpoint-recall and endpoint-ranking wins that `sla_range_expanded` was introduced for. **(Amended 2026-08-08 by ADR 043 — see Amendments: the recall half survives, carried by the whitecomma tokenizer split; the RANKING half is withdrawn.)**

**Interaction with ADR 025 — explicit non-triggering**: ADR 025's reassessment criterion 2 (changes to `multi_match type: 'bool_prefix'` that break summation symmetry) is not triggered. The `bool_prefix` field list `['sla', 'ssla']` is unchanged. `sla_range_expanded` is not in the `bool_prefix` clause. (Amended 2026-08-08 by ADR 043: it was confined to the `phrase_prefix` clause, which no longer exists; the field now has no query-side carrier at all. The non-triggering conclusion is unchanged and strengthened.)

**Interaction with ADR 027 — complementary**: ADR 027 ships in the same release (v2.4.0) as this ADR. ADR 027 tunes fuzziness to prevent adjacent-number tf-inflation on `bool_prefix`; ADR 028 prevents mid-range false positives by never emitting a mid-range alias (originally via the `phrase_prefix` clause; since the 2026-08-08 ADR 043 amendment the property holds a fortiori, the field having no query-side carrier). Combined, a query like `"106 GAZE RD CHRISTMAS ISLAND"` returns only the non-range `106 GAZE RD` record (if it exists) and excludes both fuzzy-adjacent ranges (ADR 027) and the 103-107 range (ADR 028).

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
- **Unit test** in `test/js/__tests__/address-service.test.mjs`: the `sla_range_expanded` **attachment** tests (`mapAddressDetails`) are untouched, remain source-pattern, and remain valid — index-side Option A is retained in full. The **query-side clause-wiring** assertions have been re-pointed twice, both times **re-pointed, not deleted**, so Reassessment Criterion 5 has never fired.
  - _Amended 2026-08-07 (instrument)_: from source-pattern regexes over `service/address-service.js` to behavioural assertions against `buildAddressSearchBody` (`src/build-search-body.js`).
  - _Amended 2026-08-08 (clause), per the ADR 043 amendment below_: "field placement and clause structure are unchanged from v2.3.0" **no longer holds**. The assertions now pin ADR 043's clause shape — `bool_prefix` fields remain exactly `['sla','ssla']`, the `dis_max` targets exactly `sla.raw` and `ssla.raw`, and the `dis_max` declares no explicit `tie_breaker`. The `tie_breaker=0.0` pin survives the move; its **original rationale does not**. The `max(sla, ssla, sla_range_expanded)` absent-field-contributes-0 argument depended on `sla_range_expanded` being absent on non-range docs, and that field is no longer in any clause. The pin is now load-bearing for ADR 025 Decision Driver 4 (no tuning parameters), and the assertion message must say so or the suite states a false rationale.
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
- The `tie_breaker` pin on the query's max-combination clause (`dis_max` since the 2026-08-08 ADR 043 amendment; `phrase_prefix` best_fields before it) is deleted, skipped, or given a non-zero value. It is no longer load-bearing for the absent-field-contributes-0 argument, which the amendment voids; it is load-bearing for ADR 025 Decision Driver 4 (no tuning parameters), and a non-zero value would be a magic number requiring its own justification.

## Amendments

### 2026-08-08 — amended by ADR 043 (keyword-prefix anchor for street-level-first ranking)

[ADR 043 — Keyword-prefix anchor for street-level-first ranking](043-keyword-prefix-anchor-for-street-level-first-ranking.accepted.md) replaces the `phrase_prefix` clause with a `dis_max` over `prefix` queries on the `sla.raw` / `ssla.raw` keyword subfields. `sla_range_expanded` has no `.raw` subfield, and this ADR keeps it out of the `bool_prefix` clause to protect ADR 025's summation symmetry, so it loses its only query-side carrier. (Corrected 2026-08-08: an earlier wording said it was "barred" from `bool_prefix`, which reads as an external constraint. It is this project's own rule, it is specific to `bool_prefix`'s summation, and ADR 043 line 121 retracts the stronger phrasing — a `dis_max` maxes rather than sums, so the rule does not transfer to it.)

**Query-side, this ADR's outcome becomes Option D.** The endpoint-query _ranking_ win — recorded at Option A's "preserves the `phrase_prefix` match path for endpoint queries" bullet, at the Decision Outcome's "endpoint-recall and endpoint-ranking wins" sentence, at Option D's rejection line, and at their duplicates in Pros and Cons of the Options — is withdrawn. ADR 043's four endpoint probes measured Option A delivering no ranking advantage over baseline. Endpoint _recall_ is unaffected and is now carried entirely by the `whitecomma` tokenizer splitting `103-107` into `103` and `107` for the `bool_prefix` clause, which is the exact mechanism Option D described. This ADR's five Cucumber endpoint scenarios, the mid-range false-positive scenario, and the canonical-range-first scenario are therefore promoted from non-regression to **load-bearing**: they are now the only instrument standing between this decision and a silent recall loss.

**Correction, 2026-08-08 — the index-side mechanism has never executed.** Established against production the same day this amendment was written: `sla_range_expanded` is populated on **0 of 16,905,824** documents, against 349,540 range-form addresses that should carry it. The aliases are generated correctly and then indexed one level too deep — at `_source.structured.sla_range_expanded`, while this ADR's mapping declares the top level. So the endpoint-query ranking win recorded throughout this ADR has never been delivered, and it could not have been lost by ADR 043. [P015](../problems/closed/015-range-number-addresses-not-searchable-by-base-number.md) was closed on it; range addresses are findable by base number via the whitecomma tokenizer split, not via these aliases. Tracked on [P091](../problems/open/091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md). The paragraph below was written before that was known and describes the option as it will stand once P091's fix lands.

**Index-side, Option A is retained, and the ranking win is suspended rather than surrendered.** `mapAddressDetails` continues to attach exactly two aliases per range doc and the mapping continues to carry `sla_range_expanded` with both analyzers. This is **not** storage held for no current benefit: measured 2026-08-08, giving the aliases a `.raw` keyword subfield and adding them to ADR 043's `dis_max` restores this ADR's endpoint-ranking win outright — the range doc moves from #2 to #1 on this ADR's own `TRAVEL INN HOTEL, 225-245 DRUMMOND ST` case, the CARSPACE-versus-range inversion from P026.

The `bool_prefix` summation objection that kept the field out of that clause does **not** apply to a `dis_max`, which maxes rather than sums: a document lacking the field measured exactly the same score with and without it in the query. So the aliases are retained because they are what the follow-up anchors on. The only prerequisite is a re-index to populate the subfield, and a required re-index is sequencing, not a reason to settle — ADR 029's blue/green machinery exists to make it routine. ADR 043 ships first only because the two changes are independent and it fixes a live customer-visible defect today.

**Reassessment Criterion 5 is amended, not discharged.** Its trigger — deletion or skipping of the `tie_breaker=0.0` pin — did not fire: the pin is re-pointed from the `phrase_prefix` clause to ADR 043's `dis_max`, following the same re-point-not-delete precedent set in this ADR's Confirmation on 2026-08-07. But its _rationale_ is void. The absent-field-contributes-0 argument depended on `sla_range_expanded` being absent on non-range docs; the `dis_max` targets `sla.raw` and `ssla.raw`, both populated on every document (`sla` unconditionally, `ssla` unconditionally per ADR 025's symmetric population), so no field is absent and a raised `tie_breaker` cannot act as a malus. The criterion is rewritten above. The pin survives on ADR 025 Decision Driver 4 (no tuning parameters), not on the P007 asymmetry.

**ADR 027 interaction.** [ADR 027 — `fuzziness: 'AUTO:5,8'`](027-fuzziness-auto-5-8.proposed.md) Reassessment Criterion 3 names "`sla_range_expanded` symmetric population per ADR 026 Option C" as one of its two prescribed remedies should a new ranking inversion emerge. That remedy is no longer reachable without re-introducing a query-side carrier. A future reader hitting Criterion 3 must treat the numeric-exactness filter as the only live option, or re-open this amendment first.

This is an amendment, not a supersession: endpoint-only expansion stands, and the false-positive correctness property this ADR exists to deliver is untouched.

## Related

- [Problem P015 — Range-number addresses not findable by base number](../problems/closed/015-range-number-addresses-not-searchable-by-base-number.md) — the originating problem.
- [Problem P026 — Numeric fuzziness in bool_prefix inflates ranking of adjacent docs](../problems/closed/026-numeric-fuzziness-inflates-ranking.md) — the sibling ranking problem addressed by ADR 027.
- [Baseline capture (v2.3.0)](../problems/026-baseline-v2.3.0.md) — pre-change smoke for post-deploy diff.
- [ADR 026 — Range-number address expansion (SUPERSEDED)](026-range-number-address-expansion.superseded.md) — the interpolation decision this supersedes.
- [ADR 027 — `fuzziness: 'AUTO:5,8'`](027-fuzziness-auto-5-8.proposed.md) — ships in the same release. Complementary fix.
- [ADR 025 — Symmetric `ssla` indexing](025-search-ranking-symmetric-ssla.accepted.md) — bool_prefix summation symmetry, explicit non-triggering.
- [ADR 021 — Retain OpenSearch, multi-backend plan](021-retain-opensearch-plan-multi-backend.proposed.md) — engine-agnosticism driver.
- [ADR 006 — G-NAF data source](006-gnaf-data-source.accepted.md) — `NUMBER_FIRST` / `NUMBER_LAST` semantics context.
- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — reporter `hirani89`'s 2022 cases and the semantic clarification applied here.
