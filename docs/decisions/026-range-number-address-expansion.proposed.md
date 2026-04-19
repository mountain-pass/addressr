---
status: 'proposed'
date: 2026-04-19
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-19
---

# ADR 026: Range-Number Address Expansion via Multi-Valued Text Alias Field

## Context and Problem Statement

Problem [P015](../problems/015-range-number-addresses-not-searchable-by-base-number.open.md) (GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367)) documents a ranking and recall defect visible to every RapidAPI consumer: G-NAF assigns a single address record to range-numbered properties (e.g., `225-245 DRUMMOND ST, CARLTON VIC 3053`) and addressr indexes only the hyphenated canonical form. Consumers typically know only one number in the range — the one on the sign, the one their customer provided, the one listed in a legacy CRM — and expect it to resolve. Today it does not.

**Jobs-to-be-done impact**: this is a direct J1 ("Search and autocomplete addresses from partial input") and J3 ("Validate addresses against G-NAF") regression. A valid G-NAF address returns zero results for a reasonable query. Personas affected: Web/App Developer, AI Assistant User, Data Quality Analyst.

**Root cause** (see P015 Root Cause Analysis): `mapToMla` (`service/address-service.js:557-571`) stringifies any range as `"<first>-<last>"`, which `mapToSla` then joins into the canonical `sla`/`ssla` strings. The `whitecomma` analyser (`client/elasticsearch.js:58-76`) tokenises on whitespace and commas only, so `"103-107"` remains a single token. A query of `"104 GAZE RD"` tokenises to `[104, GAZE, RD]` and finds zero match against `[103-107, GAZE, RD, ...]`. Every mid-range number in the Australian G-NAF dataset is effectively hidden from search unless the consumer types the exact hyphenated form.

**Scale** (measured 2026-04-19 against the local G-NAF Feb 2026 cache):

| State | Total addrs | Range addrs | %     | Avg span | Max span |
| ----- | ----------- | ----------- | ----- | -------- | -------- |
| NSW   | 5.2M        | 0.60M       | 11.6% | 6.4      | 111,014  |
| VIC   | 4.4M        | 0.27M       | 6.2%  | 7.3      | 9,364    |
| QLD   | 3.4M        | 0.28M       | 8.3%  | 8.1      | 2,940    |
| TAS   | 0.37M       | 0.014M      | 3.7%  | 4.6      | 2,000    |
| ACT   | 0.28M       | 0.004M      | 1.3%  | 6.3      | 116      |
| NT    | 0.12M       | 0.002M      | 2.0%  | 3.0      | 48       |
| OT    | 4.3k        | 54          | 1.2%  | 7.0      | 24       |

Roughly 7.5% of all Australian addresses are range-numbered. In dense urban states (NSW, QLD, VIC) the figure approaches 10%. Extreme spans in NSW/VIC/TAS are data-quality outliers that must not trigger unbounded expansion — both because of index size and because the Self-Hosted Operator persona explicitly cares about RAM footprint.

We need every number in each documented range to be searchable, without inflating result ranking for range documents over exact non-range matches when both are present, and without reintroducing the P007 / [ADR 025](025-search-ranking-symmetric-ssla.accepted.md) summation asymmetry in the `bool_prefix` clause.

## Decision Drivers

- **Recall correctness** (J1, J3): searching any number `n` where `first ≤ n ≤ last` must return the range document. Resolves P015 / issue #367.
- **Ranking correctness** (J1): an exact non-range match for the same number must rank at or above the range document (the non-range is the more specific hit).
- **ADR 025 non-triggering**: the change must not alter the `bool_prefix` clause whose summation behaviour ADR 025 depends on. Any new field in that clause would reintroduce P007-shaped field-count asymmetry.
- **Engine-agnostic** (ADR 021): the fix should survive a backend swap to another BM25/Lucene-family engine.
- **Bounded storage** (Self-Hosted Operator persona RAM budget, ADR 021 multi-backend readiness): range expansion must not produce pathological documents from data-quality outliers (NSW 111k-span, VIC 9k-span, TAS 2k-span).
- **Reindex cost**: the fix ships on the existing deploy pipeline without additional operational steps. Deploys already reindex (ADR 006).
- **No tuning parameters**: avoid magic numbers with no principled justification; the one constant introduced (span cap) is empirically grounded in measured data.

## Considered Options

### Option A — `sla_numbers` numeric keyword array + compound query

Add a numeric keyword array per range doc: `sla_numbers: [103, 104, 105, 106, 107]`. Query becomes a compound `bool` clause requiring BOTH a `terms` match on `sla_numbers` AND a phrase match on `sla` / `ssla` for the street/locality/state/postcode tokens.

- Good: lowest storage cost (~30 MB across AU for 8.4M expanded numeric values).
- Good: exact semantic match — numeric field for numeric match.
- Bad: requires a meaningful rewrite of `searchForAddress` to construct the compound clause. The query must parse the user's input to identify the number token before building the terms clause.
- Bad: brittle input parsing — `"Unit 4, 104 GAZE RD"` has two number tokens; which is the street number?
- Bad: does not integrate with the existing `bool_prefix` / `phrase_prefix` matching approach — ranking model forks into two shapes.

### Option B — Multi-valued text alias field, asymmetric population (chosen)

Add `sla_range_expanded` as a multi-valued text field (same `my_analyzer` as `sla`/`ssla`). For each range document, populate with one fully-expanded address string per in-range number up to a **span cap of 20**. For non-range documents, the field is absent. Query includes `sla_range_expanded` **only in the `phrase_prefix` clause** (best_fields, max combination) — deliberately excluded from the `bool_prefix` clause.

Example for `GAOT_717321171` (103-107 GAZE RD, CHRISTMAS ISLAND):

```json
{
  "sla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
  "ssla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
  "sla_range_expanded": [
    "103 GAZE RD, CHRISTMAS ISLAND OT 6798",
    "104 GAZE RD, CHRISTMAS ISLAND OT 6798",
    "105 GAZE RD, CHRISTMAS ISLAND OT 6798",
    "106 GAZE RD, CHRISTMAS ISLAND OT 6798",
    "107 GAZE RD, CHRISTMAS ISLAND OT 6798"
  ]
}
```

- Good: integrates cleanly with the existing query shape. One array added to the `phrase_prefix` `fields` list. No parsing of user input.
- Good: **ADR 025 reassessment not triggered** — the `bool_prefix` clause is untouched. The new field participates only in the sibling `phrase_prefix` clause, whose best_fields combination is separate from the summation behaviour ADR 025 depends on.
- Good: **no P007 asymmetry at the current query configuration** — `phrase_prefix` uses best_fields (max); an absent field contributes 0; `max(a, b, 0) == max(a, b)`. Non-range docs are unaffected.
- Good: **field-length normalisation keeps ranking correct** — a range doc's expanded field has N aliases concatenated (with `position_increment_gap`). A phrase query matches at most one alias, and the score is BM25-length-penalised by the longer field. Exact non-range match on the shorter canonical `sla` outranks a mid-range phrase match on `sla_range_expanded`.
- Good: **engine-agnostic** — the fix is in the data shape, not the DSL. Survives backend migration (ADR 021) to any analyser-aware text backend.
- Good: bounded storage — asymmetric population skips ~92% of the index; span cap bounds pathological cases to protect the Self-Hosted Operator RAM budget.
- Bad: **depends on `phrase_prefix` tie_breaker remaining 0.0**. If a future tune raises it, absent fields would effectively become a malus and non-range docs would rank below range docs for mid-range queries. Mitigated by a regression invariant test (see Confirmation).
- Bad: reindex required to add the field — acceptable since deploys always reindex.
- Neutral: index storage grows by ~15-25% (~1-2 GB on a ~5 GB baseline index).

### Option C — Multi-valued text alias field, symmetric population

As Option B, but populate `sla_range_expanded: [sla]` for every non-range document as well, following the [ADR 025](025-search-ranking-symmetric-ssla.accepted.md) "always populate" precedent.

- Good: defensive by construction — `tie_breaker` could be tuned later without reintroducing P007-shaped asymmetry.
- Good: simpler mapping logic (no branching).
- Bad: **index storage grows by ~40-60%** (~2-5 GB on a ~5 GB baseline) — ~14.7M extra `_source` and inverted-index entries that duplicate existing `sla` content. Non-trivial impact on EB disk footprint, OpenSearch heap pressure (FST + doc values), snapshot/restore time, and directly conflicts with the Self-Hosted Operator persona's "predictable resource requirements" desired outcome.
- Bad: duplication buys no additional correctness under the current query configuration — the only benefit is future-proofing against a query tune that is not planned.

### Option D — Do nothing

Leave P015 open; document the exact-hyphenated-form workaround.

- Good: zero engineering cost.
- Bad: ~7.5% of AU addresses remain effectively hidden from search. Every autocomplete/validation consumer handling commercial strips, shopping centres, and multi-tenanted buildings experiences false "address not found" results. Direct J1 and J3 failure for Web/App Developer and AI Assistant User personas. Revenue-impacting for RapidAPI paid tier.
- Rejected.

## Decision Outcome

**Option B — multi-valued text alias field with asymmetric population, query split to isolate from `bool_prefix` summation, span cap 20.**

Primary drivers: engine-agnosticism (ADR 021 alignment), correct ranking by construction under BM25 field-length normalisation, bounded storage (Self-Hosted Operator persona RAM budget), minimal operational cost, and explicit non-triggering of ADR 025's reassessment criterion.

**Interaction with ADR 025 — explicit non-triggering**: ADR 025's reassessment criterion flags any change to the `multi_match type: 'bool_prefix'` clause whose summation behaviour ADR 025 relies on. This decision does **not** modify the `bool_prefix` clause. The new `sla_range_expanded` field is added only to the sibling `phrase_prefix` clause (best_fields, max combination). ADR 025's symmetry argument continues to hold for `sla`/`ssla` in the `bool_prefix` clause unchanged; this ADR's asymmetry argument applies only to `sla_range_expanded` in the separate `phrase_prefix` clause. The two decisions address different fields in different clauses and coexist without conflict.

**P007-regression risk is real but mitigated** by a dedicated invariant test that pins `tie_breaker=0.0` and asserts the non-range-outranks-range property — the test serves as a living contract over the query configuration. Option C (symmetric) is the fallback if either (a) the project later adopts `tie_breaker > 0` for other search-quality reasons, or (b) the regression test becomes unreliable. The cost of switching B → C is a one-off reindex.

**Span cap of 20** is chosen because:

- It covers >99% of legitimate ranges (avg span across states is 3.0-8.1; max legitimate span observed is ACT 116, but the 99th percentile is well under 20).
- It excludes all measured data-quality outliers without judgement calls (NSW 111,014 → 5,555× the cap; TAS 2,000 → 100× the cap; VIC 9,364 → 468× the cap).
- It keeps worst-case per-doc storage bounded (20 aliases × ~60 bytes ≈ 1.2 KB `_source` overhead per capped doc), protecting the Self-Hosted Operator persona's RAM and disk footprint.
- Addresses beyond the cap remain findable via the hyphenated form, matching today's behaviour for those records — a residual failure class scoped to <0.2% of range documents.

**Release bump level**: `minor`. This fix changes the result set returned by `/addresses?q=<mid-range-number>` for every query that previously returned zero results against a range document. Consumer-visible behavioural change → minor per semver. Mirrors the ADR 025 precedent; the P009 gateway-auth-enforcement patch-bump precedent (see `.changeset` history) is explicitly not followed.

## Consequences

### Good

- Every number in a documented range becomes searchable (span ≤ 20). Resolves P015 / issue #367. Directly restores J1 and J3 for ~7.5% of AU addresses.
- Non-range exact matches continue to rank at or above range documents for the same number — ranking correctness preserved.
- Slash-form, sub-unit, and existing symmetric-`ssla` matching (ADR 025) behaviours all unaffected — the new field participates only in the `phrase_prefix` clause and only matches when the query phrase-matches an alias.
- Fix is engine-agnostic; survives a future backend migration under ADR 021.
- Pipeline, smoke, and license-check plumbing unchanged.

### Neutral

- Index storage grows by ~15-25% (~1-2 GB on the ~5 GB baseline). Within the Self-Hosted Operator RAM budget given the span cap.
- `mapToMla` gains a pure helper `expandRangeAliases(first, last, streetPart, localityPart)` — additional ~30 lines of code with unit tests.
- Reindex required to activate — acceptable since deploys always reindex (ADR 006 loader pipeline).
- The span cap is a magic number (20). Its value is empirically justified by the measured range-distribution stats documented in the problem ticket; the cap is documented as a constant with a comment pointing at P015.

### Bad

- **P007-regression risk if `tie_breaker` is tuned above 0.0**. Mitigated by a regression invariant test that fails on any non-zero value and any query-clause change that would reintroduce field-count asymmetry. If the test is deleted or skipped, the risk is un-mitigated — reviewers must treat that test as load-bearing.
- **Residual failure class**: addresses with `span > 20` remain findable only via the hyphenated form — no improvement over today for those records. Count: based on measured stats, < 0.2% of range docs across AU. The Data Quality Analyst persona must accept this as a known recall gap; the authoritative data-quality-outlier reporting belongs upstream in G-NAF, not in addressr.
- Non-numeric "ranges" (e.g., `1A-5B`, prefix/suffix number ranges) are not expanded — out of scope for this ADR. Documented in P015 as future work.

## Confirmation

Implementation compliance is verified by:

- **Unit test** in `test/js/__tests__/range-expansion.test.mjs` (new, behavioural test of the pure helper `service/range-expansion.js`): `expandRangeAliases` produces one alias per in-range number up to `SPAN_CAP=20`; returns an empty array for `span > 20`; preserves street/locality/state/postcode tokens verbatim; rejects reverse ranges, non-positive numbers, and non-integer inputs. The helper is a sibling module (following the `service/set-link-options.js` precedent) so it can be invoked directly without importing the OpenSearch-dependent `address-service.js`.
- **Unit test** in `test/js/__tests__/address-service.test.mjs` (source-pattern, P012 / P014 style): `mapToMla` attaches `sla_range_expanded` only when `s.number.last` is set and `(last - first) <= SPAN_CAP`.
- **Index-mapping test**: OT-fixture reindex produces documents with `sla_range_expanded` populated for `GAOT_717321171` (5 aliases) and absent for non-range OT records.
- **Cucumber scenario — J1 recall** in `test/resources/features/addresses.feature`: `"104 GAZE RD CHRISTMAS ISLAND"` returns `GAOT_717321171` in the result list with `sla: "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798"`.
- **Cucumber scenario — ranking invariant**: for a street with both a non-range doc and a range doc that includes the same number, the non-range doc ranks first. Pins `tie_breaker === 0.0` via an assertion on the query builder's output.
- **Cucumber scenario — ADR 025 non-regression**: existing P007 scenario for sub-unit ranking (`19 MURRAY RD, CHRISTMAS ISLAND` returns `GAOT_717321355` first) continues to pass — the `bool_prefix` clause is unchanged.
- **Post-deploy smoke**: query `"495 Maroondah Hwy Ringwood"` against the hosted RapidAPI listing returns `495-503 MAROONDAH HWY, RINGWOOD VIC 3134` in the first page of results.

## Pros and Cons of the Options

### Option A — `sla_numbers` numeric keyword array + compound query

- Good: lowest storage cost.
- Good: exact numeric semantic.
- Bad: requires user-input parsing to identify the number token.
- Bad: ranking model forks into two shapes.
- Bad: rewrite of `searchForAddress` larger than Option B's one-array addition.

### Option B — Multi-valued text alias, asymmetric (chosen)

- Good: integrates with existing query shape.
- Good: ADR 025 reassessment not triggered.
- Good: no P007 asymmetry under current query config.
- Good: engine-agnostic.
- Good: bounded storage — respects Self-Hosted Operator RAM budget.
- Bad: depends on `tie_breaker=0.0` invariant — mitigated by test.

### Option C — Multi-valued text alias, symmetric

- Good: defensive against `tie_breaker` tune.
- Bad: +40-60% index size for no current-config correctness gain — conflicts with Self-Hosted Operator persona constraint.

### Option D — Do nothing

- Good: zero cost.
- Bad: ~7.5% of AU addresses hidden from search; direct J1/J3 failure.

## Reassessment Criteria

Re-visit this decision if any of the following occur:

- `tie_breaker` on the `phrase_prefix` clause is tuned above 0.0 for any other search-quality reason. Switch to Option C (symmetric population) before merging that change.
- The `bool_prefix` clause is modified in a way that causes the asymmetric population rule to re-skew scores (the P007 risk pattern). Re-evaluate in coordination with ADR 025's reassessment criteria.
- ADR 021's multi-backend abstraction ships and the new backend does not use best_fields-max-with-tie_breaker-0 semantics for phrase matching. Re-evaluate whether the data shape transfers.
- A user reports a ranking regression where a range document outranks a more-specific non-range match for the same number.
- Measured index size exceeds the EB instance disk budget or Self-Hosted Operator RAM budget — consider capping span lower (e.g., 10) or switching to Option A.
- G-NAF data-quality improvements eliminate the extreme-span outliers (NSW 111k, VIC 9k, TAS 2k). If the observed max-span distribution becomes uniformly under 50, consider raising the cap to 50 to restore recall for the long-tail shopping-centre strip case reported in P015.
- The ranking invariant test is deleted or skipped for more than one CI cycle — the decision must either be re-ratified or migrated to Option C.

## Related

- [ADR 006 — G-NAF as data source](006-gnaf-data-source.accepted.md) — origin of `NUMBER_FIRST` / `NUMBER_LAST` fields and the data-quality outliers that drive the span cap.
- [ADR 021 — Retain OpenSearch with future multi-backend support](021-retain-opensearch-plan-multi-backend.proposed.md) — engine-agnosticism driver.
- [ADR 025 — Symmetric `ssla` indexing for search ranking](025-search-ranking-symmetric-ssla.accepted.md) — prior art for the "symmetric vs asymmetric population" trade-off. This ADR explicitly diverges from 025's symmetric-population rule on storage-cost grounds, justified by query-clause isolation and mitigated by an invariant test rather than data-level symmetry.
- [ADR 002 — OpenSearch as search engine](002-opensearch-as-search-engine.accepted.md)
- [ADR 009 — Cucumber BDD testing](009-cucumber-bdd-testing.accepted.md)
- [Problem 015 — Range-number addresses not findable by base number](../problems/015-range-number-addresses-not-searchable-by-base-number.open.md)
- [Problem 007 — Search scoring exact address ranked below sub-units](../problems/007-search-scoring-exact-address-ranked-below-subunits.closed.md) — ranking-asymmetry precedent
- GitHub issue [#367](https://github.com/mountain-pass/addressr/issues/367) — original report
