---
status: 'superseded'
date: 2026-08-07
superseded-date: 2026-08-07
superseded-by: [043-keyword-prefix-anchor-for-street-level-first-ranking]
human-oversight: confirmed
oversight-date: 2026-08-07
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-11-07
---

# Anchored span phrase clause for street-level-first ranking

> **SUPERSEDED 2026-08-07 by [ADR-043 Keyword-prefix anchor for street-level-first ranking](043-keyword-prefix-anchor-for-street-level-first-ranking.proposed.md), the same day it was ratified and before it shipped. Do not implement from this document.**
>
> **The diagnosis below is correct and is carried forward unchanged.** Read the Context section: it is the best statement of why the parent/child discriminator is absent from the text under "contains" semantics and present under "starts with". Nothing in ADR-043 disputes it.
>
> What was wrong was the mechanism. `span_first` needs the analysed tokens, because span queries match terms rather than text — verified: `span_term` with raw text returns 0 hits. That means an `_analyze` call before every search, a second sequential round trip on the revenue endpoint, measured at p50 342 ms against a 160 ms baseline. A `prefix` query on the `sla.raw` keyword subfield, which already existed, reaches the same 0.0% violation rate at baseline latency, in one round trip, with no re-index, and portably — so the ADR-025 Driver 3 override recorded below is withdrawn rather than merely superseded.
>
> Retained in full because the reasoning has value: the option comparison, the measurements, and the record of a decision ratified and replaced within the hour.

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context.
>
> **Human-ratified 2026-08-07** — the maintainer reviewed the substance and approved it, so `human-oversight: confirmed`. **`status` remains `proposed` until the fix is verified in production**, per DECISION-MANAGEMENT.md: `accepted` asserts demonstrated production use, and nothing anchored has shipped. The two axes are orthogonal; a ratified `proposed` decision is in force as recorded direction for the next query-shape change. ADR-041 is the in-family precedent — ratified 2026-07-29 while `proposed`, promoted only on 2026-08-02 once its cutover landed.
>
> An earlier edit on 2026-08-07 briefly promoted this to `accepted` on the strength of the approval alone. That conflated substance ratification with production validation and was reverted the same hour.

## Context and Problem Statement

Querying a street address that also has sub-units returns the sub-units instead of the street-level record. Measured 2026-08-06 against production `addressr6`: **94 of 150 (62.7%)** of a random national sample of sub-unit-bearing addresses return a sub-unit first. This is the defect [issue #375](https://github.com/mountain-pass/addressr/issues/375) reported and that [ADR-025 Symmetric ssla Indexing for Search Ranking](025-search-ranking-symmetric-ssla.accepted.md) was written to fix, tracked on [P074 P007 street-level-first is unfixed for ~50% of addresses with sub-units](../problems/verifying/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md).

ADR-025's mechanism is present and working. `_explain` on `8 WATERS RD, NEUTRAL BAY NSW 2089` shows the `bool_prefix` clause scoring the street-level document **higher** on both fields, exactly as ADR-025 intended. The entire 10.65-point deficit is the sibling `phrase_prefix` clause.

The root cause is a semantic mismatch, not a scoring one. `match_phrase_prefix` matches the phrase **anywhere in the field**; only the final _term_ is treated as a prefix. A sub-unit's `sla` (`UNIT 1, 8 WATERS RD, NEUTRAL BAY NSW 2089`) and its `ssla` (`1/8 WATERS RD, ...`, which tokenises to `1@0 8@1 WATERS@2 ...`) both **contain the parent's complete token sequence**. That containment is inherent to sub-unit addressing and to the slash-notation affordance ADR-025 exists to provide: any correct implementation has it.

So under "contains" semantics the discriminator between parent and child is **absent from the text by construction**, and no scoring adjustment is well-posed. BM25 leaves the parent only a small length-normalisation edge, which the per-shard prefix-expansion noise recorded in [P078 phrase_prefix scores depend on shard-local expansion set](../problems/open/078-phrase-prefix-scores-depend-on-shard-local-expansion-set.md) routinely exceeds. That is why three successive scoring candidates all failed to make it reliable.

Under "starts with" semantics the discriminator is present and exact, because both accepted notations put the sub-unit marker at the **head** of the string.

## Decision Drivers

- The defect is customer-visible on the revenue-generating `/addresses?q=` endpoint, affects paid and free tier alike, and was previously believed fixed.
- Fixture-scale reproduction is worthless here: OT (5,186 docs) and a full TAS load (375,613 docs) both measure **0%** violations. Only corpus scale exposes it.
- Notation tolerance must survive. `14/2 Parkes` and `Unit 14, 2 Parkes` must both find the same sub-unit; ADR-025 rejected its Option C for breaking exactly this.
- Partial-prefix recall must not regress. It is the property [ADR-041 Equivalent Synonyms with a Synonym-Free Search Analyzer](041-equivalent-synonyms-with-synonym-free-search-analyzer.accepted.md) delivers and that P069 / [issue #365](https://github.com/mountain-pass/addressr/issues/365) was closed on.
- ADR-025 Decision Driver 4 forbids tuning parameters whose values have no principled justification.
- The maintainer rejected score-tuning outright: _"I don't want a hack solution."_

## Considered Options

1. **Anchored span phrase clause (chosen)** — replace `match_phrase_prefix` with `span_first(span_near([...], slop=0, in_order=true), end=N)` per field, so the clause means "this field starts with what was typed". The final position stays a prefix via `span_multi`.
2. **`max_expansions: 1` on the existing clause** — bound the prefix expansion so the idf noise cannot accumulate.
3. **`constant_score` wrapper on the existing clause** — remove the clause's idf contribution entirely.
4. **Drop `ssla` from the phrase clause only** — remove the child's parent-containing field from the noisy clause.
5. **Model the hierarchy in the index** — add a family key and specificity level to every document, then exclude sub-units whose parent exists when the query carries no sub-unit token.
6. **Index-time start-of-field sentinel token** — prepend a marker token, then query a plain `match_phrase_prefix` for `MARKER <query>`. Portable equivalent of the chosen option.
7. **Do nothing** — leave the 62.7% violation rate in production.

## Decision Outcome

Chosen option: **"Anchored span phrase clause"**, because it is the only candidate that fixes the property completely (**0 of 150** violations) while improving partial-prefix recall rather than trading it away, and it does so without a re-index. It also fixes P078's named exact-vs-range inversion as a side effect, with no range-specific handling: `96-108 GAZE RD` does not _start with_ `108`, so it is excluded by construction.

Measured against production `addressr6`, 2026-08-06/07:

| Candidate                         | street-level-first violations | partial-prefix recall (268 probes) |
| --------------------------------- | ----------------------------- | ---------------------------------- |
| baseline                          | 94/150 = **62.7%**            | 42/268                             |
| `max_expansions: 1`               | 1/150 = 0.7%                  | 27/268, **lost 20**                |
| `constant_score` wrapper          | 3/150 = 2.0%                  | 43/268, lost 10 gained 11          |
| `ssla` dropped from phrase clause | 91/150 = 60.7%                | not measured                       |
| **anchored span clause**          | **0/150 = 0.0%**              | **45/268, lost 6 gained 9**        |

Latency improves: p90 81 ms against baseline 99 ms over 40 queries, because anchoring prunes candidates before scoring.

All three notations verified: `8 WATERS RD…` returns the parent first; `UNIT 1, 8 WATERS RD…` returns that unit; `1/8 WATERS RD…` returns that unit.

**This partially overrides ADR-025's Decision Outcome rationale, deliberately.** ADR-025 chose symmetric indexing "driven **primarily** by engine-agnosticism (ADR 021 alignment): encoding the ranking fix in data rather than in Lucene-specific DSL", and rejected its Option A (`dis_max`) on that ground. `span_first` is _more_ Lucene-specific than what ADR-025 turned down. Option 6 above is a genuinely portable equivalent and was costed. The maintainer directed on 2026-08-07: _"use span_first, don't worry about portability."_ The trade was seen and taken, not missed. [ADR-021 Retain OpenSearch with Future Multi-Backend Support](021-retain-opensearch-plan-multi-backend.proposed.md) imposes no query-DSL constraint of its own and is not in conflict; its multi-backend reassessment axis stays open and now carries this lock-in increment.

## Consequences

### Good

- The street-level-first property holds at corpus scale, closing a defect that has been live since at least 2026-04 and was twice believed fixed.
- Partial-prefix recall improves rather than regresses, so P069's property is not traded away.
- P078's exact-vs-range inversion is addressed by the same change, for the same structural reason.
- No re-index and no mapping change, so no ADR-029 blue/green cutover is incurred.
- The fix is structural: it makes the clause mean what a user typing an address means, rather than compensating for a scoring artefact. Future analysis-chain changes cannot silently re-break it the way ADR-041's score compression re-exposed the ADR-025 margin.
- Latency is slightly better, not worse.

### Neutral

- `ssla` and ADR-025's symmetric population are retained unchanged; this composes with ADR-025 rather than superseding it.
- The `bool_prefix` clause is untouched, so ADR-027's `AUTO:5,8` calibration and its clause placement are undisturbed.

### Bad

- **Engine lock-in increases.** `span_first` has no equivalent in Typesense, Meilisearch or SQLite FTS5. A future backend migration must redesign the ranking, where the portable Option 6 would have carried over. Accepted per maintainer direction.
- **`top_terms_128` is a bounded rewrite on the final position, and it retains per-term idf scoring** — P078's mechanism survives inside the new clause at reduced amplitude. Anchoring dominates it empirically, but it is not eliminated.
- **A new availability failure mode.** Without a bounded rewrite, `span_multi` enumerates matching terms and exceeds `maxClauseCount` (1024): the query `86 NORTH` expands the synonym `N`, and `N*` fails **all shards**. `indices.query.bool.max_clause_count` is cluster configuration, so a self-hosted operator running a lowered value gets total request failure rather than degraded ranking. `match_phrase_prefix` had an implicit bound and no such mode.
- Six probes still drop off the first page relative to baseline. Diagnosed as displacement rather than loss (they remain in the result set) and attributed to the instrument rather than the query, but not fully explained.
- The clause is materially harder to read than `match_phrase_prefix`, and is constructed programmatically from the analyzed query rather than declared.

## Confirmation

1. **Corpus-scale property gate.** Street-level-first violation rate over a **randomly redrawn** national sample of sub-unit-bearing addresses, with the sample size, draw method and threshold pinned. Redraw per run: a frozen sample degenerates into the instance-pinning that hid this defect for months.
2. **Corpus-scale recall gate.** Target-in-top-`PAGE_SIZE` over mid-word partial probes, with the instrument definition recorded in this ADR. A ladder built 2026-08-06 was invalid because it counted results leaving a fixed window as recall losses; a second frame was vacuous because its cuts landed on word boundaries. The frame must cut mid-token, and must carry a sensitivity gate asserting it reproduces P078's four recorded `max_expansions: 1` losses.
3. **An explicit statement that fixture-scale Cucumber cannot discharge criteria 1 and 2**, and is retained as non-regression only. Without this sentence the next reviewer reads a green Cucumber run as sufficient, which is exactly how this hid.
4. **`top_terms_N` invariance** across 64/128/512 on both properties, plus the N at which it breaks, so 128 is justified as headroom rather than a magic number.
5. **A `maxClauseCount` regression probe** on the `86 NORTH` shape asserting no shard failure.
6. **All five ADR-028 endpoint-recall scenarios** plus the mid-range false-positive scenario re-run.
7. **ADR-027's 14-query v2.3.0 baseline** re-run post-deploy.
8. **Latency non-regression** at p50/p90 against the measured 46.5 / 81 ms.
9. Query-body single source: both the service and the ADR-041 integration test build from `src/build-search-body.js`. **Holding as of 2026-08-07 (3.0.7); standing invariant, re-checked at each query-shape change** — never dischargeable, since a "must remain" obligation can only hold at a point in time.

Criteria 1 and 2 are **not** discharged by the harness landing in 3.0.7. What shipped is the instrument, not a measurement of a deployed change, and the reproduction cited replays a frozen frame the code itself labels non-discharging.

## Pros and Cons of the Options

### Anchored span phrase clause

- Good, because it is the only candidate measuring 0/150 on the property.
- Good, because recall improves (net +3) rather than regressing.
- Good, because it needs no re-index.
- Good, because it fixes the exact-vs-range surface at the same time.
- Bad, because `span_first` is Lucene-only.
- Bad, because it introduces a `maxClauseCount` shard-failure mode requiring a bounded rewrite.

### `max_expansions: 1`

- Good, because it is a one-parameter change measuring 0.7%.
- Bad, because it loses 20 of 268 recall probes, breaking ADR-041's superset property on the mid-typing shape P069 was closed on.
- Bad, because it converts the per-shard nondeterminism from a scoring artefact into a matching one.

### `constant_score` wrapper

- Good, because it removes the idf sum entirely and measures 2.0%.
- Good, because it is portable in concept.
- Bad, because `boost: 20` is the magic number ADR-025 Driver 4 forbids.
- Bad, because it still leaves 3 of 150 wrong, and it compensates for the mechanism rather than addressing it.

### Drop `ssla` from the phrase clause

- Good, because it is a one-line change.
- Bad, because it barely moves the property (60.7%): the containment holds for `sla` too, so there is no field to remove.

### Model the hierarchy in the index

- Good, because it expresses the parent/child relation directly, as a per-document filter with no tuning parameter.
- Good, because it is engine-agnostic.
- Bad, because it requires a full re-index of 16.9M documents and a blue/green cutover.
- Bad, because it needs a query-side sub-unit-token classifier, which ADR-025 rejected as fragile, and which must work mid-keystroke.
- Bad, because `structured` is mapped `enabled: false`, so the hierarchy is present in `_source` but not queryable without that re-index.

### Index-time start-of-field sentinel token

- Good, because it gives identical semantics with zero engine-specific DSL.
- Good, because it honours ADR-025's engine-agnosticism driver rather than arguing past it.
- Bad, because it requires the same 16.9M-document re-index and cutover.
- Bad, because it delays a live customer-visible fix behind infrastructure work.

### Do nothing

- Good, because it carries no implementation risk.
- Bad, because 62.7% of affected queries stay wrong on the revenue endpoint, on a defect a customer already reported.

## Reassessment Criteria

1. A backend migration off OpenSearch is seriously contemplated: the lock-in accepted here becomes due, and Option 6 is the recorded migration path.
2. The `maxClauseCount` failure mode is observed in the wild, or a self-hosted operator reports total request failure on short or synonym-expanded final tokens.
3. `top_terms_N` invariance (Confirmation criterion 4) fails to hold, which would reclassify 128 from headroom to a tuning parameter and re-engage ADR-025 Driver 4.
4. The street-level-first property is measured at corpus scale and found violated, whether or not a user reports it. The same criterion was **landed on [ADR-025](025-search-ranking-symmetric-ssla.accepted.md) in this commit**, under its Reassessment Criteria, as the bullet beginning _"The street-level-first property is measured at corpus scale"_. Its absence there is why the original defect survived two closures: ADR-025's pre-existing criteria each require a backend change, a `bool_prefix` clause change, or a user report, and none of them fires on a silent corpus-scale violation. (Located by quoting the bullet rather than by position: an ordinal goes silently false the moment a criterion lands ahead of it, and nothing checks it.)
5. The six-probe displacement is traced to a real recall mechanism rather than the instrument.
6. Partial-prefix recall regresses on the ADR-041 superset property once its gate is rebuilt at corpus scale.
