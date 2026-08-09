---
human-oversight: confirmed
oversight-date: 2026-07-18
status: 'accepted'
date: 2026-04-16
accepted-date: 2026-04-17
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-11-07
---

# ADR 025: Symmetric `ssla` Indexing for Search Ranking

> **Oversight provenance.** `oversight-date: 2026-07-18` predates the amendments dated 2026-08-07 in this file — the falsified Consequences bullet, the root-cause annotation, the added reassessment criterion, and the ADR-042 cross-reference. What the maintainer ratified is the **decision**: Option B, symmetric `ssla` population. The 2026-08-07 edits correct factual claims the decision made about its own outcome; they do not change the decision, so no new ratification is owed. Recorded explicitly per the resolution R024 required for this shape, rather than left implicit.

## Context and Problem Statement

Problem [P007](../problems/closed/007-search-scoring-exact-address-ranked-below-subunits.md) (GitHub issue [#375](https://github.com/mountain-pass/addressr/issues/375)) documents a ranking bug visible to every RapidAPI consumer: when a user queries a street address that also has sub-unit variants indexed (SHOP, UNIT, FLAT, LEVEL), the exact street-level match ranks **below** every sub-unit at that address. Observed in production: `278 ROSS RIVER RD AITKENVALE QLD 4814` returns `SHOP 1/5/6, 278 ROSS RIVER RD` at the top with scores ~95, and the plain `278 ROSS RIVER RD` at the bottom with score ~70. The API consumer is handed the wrong "best match".

**Root cause** — as understood in April 2026, and **incomplete**. Annotated 2026-08-07: the summation asymmetry described below was real and this ADR did fix it, but it is not the cause of the live defect. That is per-shard `phrase_prefix` expansion IDF, recorded in [P078](../problems/open/078-phrase-prefix-scores-depend-on-shard-local-expansion-set.md) and confirmed by `_explain` on production. The text below is retained as the record of what was understood at decision time.

(see P007 Root Cause Analysis): the query builder in `service/address-service.js:searchForAddress` uses OpenSearch `multi_match` with `type: 'bool_prefix'` over fields `['sla', 'ssla']`. `bool_prefix` combines per-field scores by **summation** (most-fields semantics). Indexing populates both `sla` and `ssla` for sub-unit documents (full form and unit-stripped short form respectively) but only `sla` for street-level documents. Sub-unit documents therefore receive roughly double the per-field score contribution.

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

- ~~Exact street-level matches rank first for no-sub-unit queries — resolves P007 / issue #375.~~ **FALSIFIED 2026-08-07.** Measured against production: **62.7%** of a random national sample of sub-unit-bearing addresses still return a sub-unit first ([P074](../problems/closed/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md)). The mechanism this ADR chose is present and working — the `bool_prefix` clause does score the street-level document higher — but it is not sufficient, because the sibling `phrase_prefix` clause decides the outcome. Issue #375 remains closed on this claim and is scheduled for correction when the fix ships; see P074 Fix Strategy prerequisite 14.
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

- **This criterion is NOT HELD by an executing instrument.** The unit test at `service/address-service.test.js` does assert that `mapAddressDetails` populates `ssla === sla` for street-level addresses and a distinct short form for sub-unit addresses — but no runner globs `service/*.test.js`. `package.json` declares four `node --test` scripts — `test:js` (`test/js/__tests__/*.test.mjs`), `test:precommit`, `test:mcp:smoke` and `test:integration:search` — and this file is reached by none of them, so those assertions have never executed. (Corrected 2026-08-09: this criterion first said nothing globs outside `test/js/__tests__/`, which is false — three other globs exist. The conclusion is unchanged; the stated mechanism was wrong.) Recorded 2026-08-09 rather than left implicit, because the compendium renders this bullet first and it read as satisfied. The BEHAVIOUR is still covered — by the un-skipped P007 Cucumber scenario below and by ADR 027's pins in `test/js/__tests__/address-service.test.mjs`, both of which do run — so the decision is not unpinned; the named instrument is. Tracked as one of five orphaned test files.
- Un-skipped Cucumber scenario `P007 Exact street address ranks first over sub-unit variants` in `test/resources/features/addressv2.feature` asserts that the first returned item for `19 MURRAY RD, CHRISTMAS ISLAND` is `GAOT_717321355` (the street-level record) against the OT fixture.
- Manual regression probes: query `UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND` returns `GAOT_717882967` first; query `1/19 MURRAY RD` returns the UNIT 1 record (slash-form affordance preserved).
- Post-deploy smoke: query `278 ROSS RIVER RD AITKENVALE QLD 4814` against the hosted RapidAPI listing returns `278 ROSS RIVER RD, AITKENVALE QLD 4814` (no SHOP/UNIT prefix) as the top hit.

## Reassessment Criteria

Re-visit this decision if any of the following occur:

- ADR 021's multi-backend abstraction ships and a non-Lucene backend is adopted whose scoring does not sum per-field across `multi_match`. In that case, Option B's correctness property may not transfer; switch to Option A (`dis_max`-equivalent) or Option C (single-field) as appropriate to the new backend.
- The query in `searchForAddress` is changed away from `multi_match type: 'bool_prefix'`. The summation behaviour this ADR relies on must be preserved or the decision re-evaluated.
- A user reports a regression in sub-unit or slash-form matching.
- **The street-level-first property is measured at corpus scale and found violated, whether or not a user reports it.** Added 2026-08-07. The `reassessment-date` above is set to the ADR-042 production-verification milestone rather than a rolling quarter, because that is when this ADR's outcome can next be honestly re-evaluated. The three criteria above did not fire on the defect this ADR was written to fix: [P074 P007 street-level-first is unfixed for ~50% of addresses with sub-units](../problems/closed/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md) measured **62.7%** of a random national sample violating Decision Driver 1, while every recorded gate stayed green, because the gates pin sampled _instances_ rather than the _property_. Fixture-scale corpora cannot detect it: OT (5,186 docs) and a full TAS load (375,613 docs) both measure 0%.

**Note on the Decision Outcome's engine-agnosticism rationale — challenged, and upheld.** [ADR-042](042-anchored-span-phrase-clause-for-street-level-first-ranking.superseded.md) was ratified on 2026-08-07 with an explicit override of Driver 3, on the grounds that a Lucene-only `span_first` clause was worth the lock-in. It was superseded the same day by [ADR-043 Keyword-prefix anchor for street-level-first ranking](043-keyword-prefix-anchor-for-street-level-first-ranking.accepted.md), which reaches the same measured outcome using a `prefix` query on a keyword field — expressible in every backend ADR-021 contemplates.

**The override is therefore withdrawn, not merely superseded.** Driver 3 survived a live challenge on its merits: an engine-specific mechanism was adopted, then dropped when a portable one measured better on latency, round trips and failure modes. This ADR's own mechanism, symmetric `ssla` population, is retained unchanged throughout and remains load-bearing for slash-form notation tolerance.

## Related

- [ADR 002 — OpenSearch as search engine](002-opensearch-as-search-engine.accepted.md)
- [ADR 021 — Retain OpenSearch with future multi-backend support](021-retain-opensearch-plan-multi-backend.proposed.md)
- [ADR 042 — Anchored span phrase clause for street-level-first ranking](042-anchored-span-phrase-clause-for-street-level-first-ranking.superseded.md) — partially overrides this ADR's engine-agnosticism rationale. Ratified 2026-08-07; `status: proposed` until production-verified. See the note under Reassessment Criteria.
- [Problem 074 — P007 street-level-first is unfixed for ~50% of addresses with sub-units](../problems/closed/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md) — measured this ADR's Decision Driver 1 violated at 62.7% while every recorded gate stayed green
- [ADR 009 — Cucumber BDD testing](009-cucumber-bdd-testing.accepted.md)
- [Problem 007 — Search scoring exact address ranked below sub-units](../problems/closed/007-search-scoring-exact-address-ranked-below-subunits.md)
- GitHub issue [#375](https://github.com/mountain-pass/addressr/issues/375) — original report
- GitHub issue [#365](https://github.com/mountain-pass/addressr/issues/365) — partial search returning incorrect results (likely same query-builder code path; worth revisiting after this fix ships)
