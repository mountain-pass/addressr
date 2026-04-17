---
status: 'accepted'
date: 2026-04-16
accepted-date: 2026-04-17
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-07-16
---

# ADR 025: Symmetric `ssla` Indexing for Search Ranking

## Context and Problem Statement

Problem [P007](../problems/007-search-scoring-exact-address-ranked-below-subunits.known-error.md) (GitHub issue [#375](https://github.com/tompahoward/addressr/issues/375)) documents a ranking bug visible to every RapidAPI consumer: when a user queries a street address that also has sub-unit variants indexed (SHOP, UNIT, FLAT, LEVEL), the exact street-level match ranks **below** every sub-unit at that address. Observed in production: `278 ROSS RIVER RD AITKENVALE QLD 4814` returns `SHOP 1/5/6, 278 ROSS RIVER RD` at the top with scores ~95, and the plain `278 ROSS RIVER RD` at the bottom with score ~70. The API consumer is handed the wrong "best match".

**Root cause** (see P007 Root Cause Analysis): the query builder in `service/address-service.js:searchForAddress` uses OpenSearch `multi_match` with `type: 'bool_prefix'` over fields `['sla', 'ssla']`. `bool_prefix` combines per-field scores by **summation** (most-fields semantics). Indexing populates both `sla` and `ssla` for sub-unit documents (full form and unit-stripped short form respectively) but only `sla` for street-level documents. Sub-unit documents therefore receive roughly double the per-field score contribution.

We need to restore correct ranking without regressing the existing `ssla` affordance (queries like `1/19 MURRAY RD` match `UNIT 1, 19 MURRAY RD` by hitting the `ssla` short form).

## Decision Drivers

- **Correctness**: the exact street-level match must rank first for queries that contain no sub-unit token.
- **Preserve existing behaviour**: slash-form sub-unit queries (e.g. `1/19 MURRAY RD`) must continue to match the corresponding sub-unit record.
- **Engine-agnostic**: aligned with [ADR 021](021-retain-opensearch-plan-multi-backend.proposed.md) which plans for a future alternative backend (Typesense, SQLite FTS5, MongoDB Atlas Search). Ranking correctness should not depend on OpenSearch-specific DSL quirks.
- **No tuning parameters**: avoid introducing magic numbers (`tie_breaker`, per-field boosts) whose values have no principled justification.
- **Zero additional deploy cost**: the fix should land without extra operational steps; addressr already re-indexes G-NAF on every deploy.
- **Minimal diff / small regression surface**: the bug is a High-severity known error on a revenue-generating API; the fix should be surgical.

## Considered Options

### Option A — `dis_max` query wrapper

Replace the existing `multi_match type: 'bool_prefix'` with a `dis_max` over per-field `match_bool_prefix` / `match_phrase_prefix` subqueries. This changes per-field score combination from summation (most-fields) to max-plus-tie-breaker (best-fields).

- Pros: no indexing change, no re-index required to activate, surgical ~15-line query-builder diff, was the originally-documented fix strategy in the P007 known-error doc.
- Cons: couples to OpenSearch-specific DSL (`dis_max`, `tie_breaker`), conflicting with ADR 021's engine-agnostic direction. Introduces a `tie_breaker` tuning parameter whose value (0.1? 0.2? 0.5?) has no principled basis — reviewers would ask "why that number?".

### Option B — Symmetric `ssla` (chosen)

In `service/address-service.js:mapAddressDetails`, always populate `ssla`: set it equal to `sla` when the address has no sub-unit. The query builder stays unchanged. Because every document now matches the query across both `sla` and `ssla` symmetrically, the summation no longer privileges sub-unit documents: the exact street-level match scores `clean(sla) + clean(ssla)` while a sub-unit scores `noisy(sla) + clean(ssla)`. Since `clean > noisy` (BM25 penalises the extra tokens and longer field length of the sub-unit `sla`), the exact match wins.

- Pros:
  - **Engine-agnostic**: the fix is encoded in the data shape, so it survives a backend swap to any BM25/Lucene-family engine (Typesense, SQLite FTS5, MongoDB Atlas Search).
  - **Preserves slash-form matching**: sub-unit documents still have the distinct `ssla` short form; queries like `1/19 MURRAY RD` continue to match them.
  - **No tuning parameters**.
  - **Zero operational cost**: re-index runs on every deploy.
  - **One-line code change** (an `else` branch) with a small follow-on fixture update in `addresses.feature` and `addresses-structured.feature` to reflect the now-present `ssla` field on mapped non-sub-unit addresses.
- Cons:
  - Requires a re-index to take effect (acceptable — deploy pipeline re-indexes automatically).
  - Index storage grows modestly (`ssla` now populated on every document; text field only, negligible delta on OT fixture measurements).
  - Changes `ssla.raw` sort semantics for non-sub-unit docs (previously missing → sorted `_last`; now tied with `sla.raw`). This is an improvement for tie-break stability, not a regression.
  - Mapping test fixtures (`addresses.feature` "will map to" scenarios and `addresses-structured.feature` response scenarios) need to include `ssla` on the expected payload.
  - Fix works _because_ `bool_prefix` sums per-field scores — it is a compensating data shape rather than a scoring-model fix. If a future change switches the query to `best_fields`, the effect disappears. Acknowledged and flagged in Reassessment Criteria.

### Option C — Remove `ssla` entirely

Drop `ssla` from mapping, indexing, query, sort, and highlight. Query only against `sla`. Exact-match wins trivially because there is only one field.

- Pros: simplest data model; fully engine-agnostic; reduces index size.
- Cons: **regresses the original `ssla` purpose** — queries like `1/19 MURRAY RD` would no longer match the corresponding sub-unit record because the canonical `sla` contains `UNIT 1, 19 MURRAY RD` (different tokens from the slash-form). Git archaeology confirms `ssla` was added deliberately for this affordance. Rejected.

### Option D — Field boosts (`sla^1`, `ssla^0.5`)

Dampen but don't eliminate the summation asymmetry with per-field boosts.

- Pros: one-line diff.
- Cons: doesn't fix the root cause, only attenuates it. Magic numbers with no principled basis. Rejected.

### Option E — Function-score penalty on sub-unit mismatch

Detect at query time whether the query contains a flat/unit token; if not, down-boost documents whose `structured.flat` is present.

- Pros: directly encodes the intent.
- Cons: requires query-side tokenisation of the input ("does this contain UNIT/SHOP/FLAT/LEVEL/U./slash-form?"), which is fragile to variants. Materially more code than A or B. Engine-specific. Rejected.

### Option F — `copy_to` combined field

Add `copy_to: combined` on both `sla` and `ssla`; query only `combined`.

- Pros: collapses the multi-field scoring problem to single-field; engine-agnostic DSL (`match`).
- Cons: **does not fix the asymmetry** — the sub-unit doc's `combined` field contains _both_ forms, so term frequencies still skew toward it relative to a non-sub-unit doc (whose `combined` contains only `sla`). Rejected.

## Decision Outcome

**Option B — symmetric `ssla`.**

The decision is driven primarily by **engine-agnosticism** (ADR 021 alignment): encoding the ranking fix in data rather than in Lucene-specific DSL means the correctness property survives a backend migration. Secondary drivers: no tuning parameters, preserves the slash-form affordance (unlike Option C), minimal diff.

Option A remains a clean fallback if Option B ever regresses — e.g., if a subsequent change switches the query away from `bool_prefix` summation. The P007 known-error document retains the original Option A strategy notes, annotated with a pointer to this ADR.

**Release bump level**: `minor`. This fix changes the top result of `/addresses?q=<street-address>` for every query whose address has indexed sub-units, and every BM25 `score` numeric value in API responses shifts (because `ssla` is now populated on every document, shifting field-level IDF). Per semver, consumer-visible behavioural changes warrant a minor bump. The P009 gateway-auth-enforcement change shipped under `patch` (see `.changeset` history); that precedent is explicitly not followed — shipping this fix under `patch` risks surprising auto-updating consumers.

## Consequences

### Good

- Exact street-level matches rank first for no-sub-unit queries — resolves P007 / issue #375.
- Scoring correctness is encoded in data, not DSL. The fix is portable to any BM25/Lucene-family backend under ADR 021.
- Query builder simplifies conceptually (no per-field asymmetry to reason about).
- Slash-form sub-unit matches preserved.
- Sub-unit search behaviour (query `UNIT 1, 19 MURRAY RD` returns the UNIT 1 doc first) is preserved by construction — sub-unit docs still score on both fields; the only difference is that non-sub-unit docs now also score symmetrically.

### Bad / neutral

- Index storage grows modestly (`ssla` field populated on every document instead of only sub-unit documents).
- Cucumber mapping-test fixtures need one-time update to include `ssla` in expected payloads (`addresses.feature` "will map to" scenarios × 2; `addresses-structured.feature` response scenarios × 2).
- `ssla.raw` sort clause now treats non-sub-unit documents symmetrically with `sla.raw` — behaviour equivalent or better.
- Fix requires a reindex to take effect — acceptable since deploys always reindex.
- The fix exploits the current `bool_prefix` summation behaviour. If a future change switches the query `type` away from `bool_prefix` (e.g. to `best_fields`), Option B's effect would vanish and the ranking asymmetry could re-emerge. See Reassessment Criteria.

## Confirmation

- Unit test at `service/address-service.test.js` asserts `mapAddressDetails` populates `ssla === sla` for street-level addresses and a distinct short form for sub-unit addresses.
- Un-skipped Cucumber scenario `P007 Exact street address ranks first over sub-unit variants` in `test/resources/features/addressv2.feature` asserts that the first returned item for `19 MURRAY RD, CHRISTMAS ISLAND` is `GAOT_717321355` (the street-level record) against the OT fixture.
- Manual regression probes: query `UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND` returns `GAOT_717882967` first; query `1/19 MURRAY RD` returns the UNIT 1 record (slash-form affordance preserved).
- Post-deploy smoke: query `278 ROSS RIVER RD AITKENVALE QLD 4814` against the hosted RapidAPI listing returns `278 ROSS RIVER RD, AITKENVALE QLD 4814` (no SHOP/UNIT prefix) as the top hit.

## Reassessment Criteria

Re-visit this decision if any of the following occur:

- ADR 021's multi-backend abstraction ships and a non-Lucene backend is adopted whose scoring does not sum per-field across `multi_match`. In that case, Option B's correctness property may not transfer; switch to Option A (`dis_max`-equivalent) or Option C (single-field) as appropriate to the new backend.
- The query in `searchForAddress` is changed away from `multi_match type: 'bool_prefix'`. The summation behaviour this ADR relies on must be preserved or the decision re-evaluated.
- A user reports a regression in sub-unit or slash-form matching.

## Related

- [ADR 002 — OpenSearch as search engine](002-opensearch-as-search-engine.accepted.md)
- [ADR 021 — Retain OpenSearch with future multi-backend support](021-retain-opensearch-plan-multi-backend.proposed.md)
- [ADR 009 — Cucumber BDD testing](009-cucumber-bdd-testing.accepted.md)
- [Problem 007 — Search scoring exact address ranked below sub-units](../problems/007-search-scoring-exact-address-ranked-below-subunits.known-error.md)
- GitHub issue [#375](https://github.com/tompahoward/addressr/issues/375) — original report
- GitHub issue [#365](https://github.com/tompahoward/addressr/issues/365) — partial search returning incorrect results (likely same query-builder code path; worth revisiting after this fix ships)
