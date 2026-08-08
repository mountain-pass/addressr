---
status: 'accepted'
date: 2026-08-07
accepted-date: 2026-08-08
first-released: 2026-08-08
human-oversight: confirmed
oversight-date: 2026-08-08
supersedes: [042-anchored-span-phrase-clause-for-street-level-first-ranking]
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-11-07
---

# Keyword-prefix anchor for street-level-first ranking

> Supersedes [ADR-042 Anchored span phrase clause for street-level-first ranking](042-anchored-span-phrase-clause-for-street-level-first-ranking.superseded.md), which was ratified 2026-08-07 and superseded the same day, before any implementation shipped.
>
> **ADR-042's diagnosis is carried forward intact and is not in question.** What is replaced is only its mechanism. Its Context section remains the best statement of the root cause and should be read.

## Context and Problem Statement

Querying a street address that has sub-units returns the sub-units, not the address. Typing `8 WATERS RD, NEUTRAL BAY NSW 2089` against production returns eight UNIT records at that address and never the address itself, which is in the index. Measured on a fresh random national sample of 120 sub-unit-bearing addresses: **60.0% return a sub-unit first**. This is the defect [issue #375](https://github.com/mountain-pass/addressr/issues/375) reported, tracked on [P074](../problems/closed/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md).

ADR-042 established the correct diagnosis, which this decision adopts unchanged: `match_phrase_prefix` matches a phrase **anywhere** in a field, and a sub-unit's `sla` and `ssla` both contain the parent's complete token sequence. Under "contains" semantics the discriminator between parent and child is **absent from the text by construction**, so no scoring adjustment is well-posed. Under "starts with" it is present and exact.

**An unplanned corroboration of that diagnosis, measured 2026-08-08.** Under the _pre-decision_ query, a **mistyped** address returned the street-level record first **85%** of the time, while a **correctly typed** one got it wrong **60%** of the time. Typing the address correctly made the answer worse. The mechanism explains why: a typo makes `phrase_prefix` inert (it carries no fuzziness), leaving `bool_prefix` alone to decide — and `bool_prefix`, after ADR-025, was already ranking correctly. The defect was never a failure to score the street-level record highly enough; it was a sibling clause overriding a clause that had the right answer. This decision removes that clause.

ADR-042 then chose `span_first` to express "starts with". Implementation found that wrong, for a reason not visible when it was ratified.

**Span queries do not analyse.** `span_term` with raw text returns 0 hits — it matches an already-indexed term. So building the clause requires the analysed tokens, which requires an `_analyze` call before every search: a second sequential round trip on the revenue-generating endpoint. Measured wall-clock p50 rose from 160 ms to 342 ms, p90 from 202 ms to 417 ms.

Alternatives to that round trip were checked rather than assumed. The `intervals` query **does** analyse raw text server-side, but rejects a position constraint (`unknown field [start]`). So no query type both analyses and anchors — which is the gap `span_first` pays for with an extra round trip.

A `prefix` query on a `keyword` field does not need to analyse anything, because a keyword field stores the string whole. "Starts with" is its native semantics. `sla.raw` and `ssla.raw` already exist as keyword subfields, indexed on every document.

## Decision Drivers

- The defect is customer-visible on the revenue-generating `/addresses?q=` endpoint and was twice believed fixed.
- Fixture scale cannot reproduce it: OT (5,186 docs) and a full TAS load (375,613 docs) both measure 0%.
- Notation tolerance must survive — `14/2 Parkes` and `Unit 14, 2 Parkes` must both find the same sub-unit.
- Partial-prefix recall must not regress; it is what P069 / [issue #365](https://github.com/mountain-pass/addressr/issues/365) was closed on.
- ADR-025 Decision Driver 3 (ranking correctness must not depend on engine-specific DSL) and Driver 4 (no tuning parameters).
- JTBD-001 documents a 200 ms latency target, which ADR-031 treats as load-bearing.

## Considered Options

1. **Keyword-prefix anchor (chosen)** — replace the `phrase_prefix` clause with a `dis_max` over `prefix` queries on `sla.raw` and `ssla.raw`, query uppercased client-side, gated on selectivity.
2. **Anchored span phrase clause** — ADR-042's choice. Correct semantics, but needs a per-request `_analyze` round trip and is Lucene-only.
3. **Index-time start-of-field sentinel token** — prepend a marker so plain `match_phrase_prefix` can anchor. One round trip, portable, but costs a 16.9M-document re-index and writes a token into the index that is not address data.
4. **Model the hierarchy in the index** — specificity and parent-exists fields, filtered when the query carries no sub-unit token. Rejected on measurement: the required query-side classifier scores 180/180 on complete addresses but **92% across keystroke prefixes, with 179 of 191 failures at 1–3 characters** — it fails exactly where autocomplete lives. Recorded because it looks like the principled option right up until it is measured.
5. **Do nothing** — leave 60% of affected queries wrong.

## Decision Outcome

Chosen: **keyword-prefix anchor**. It achieves ADR-042's semantics at baseline latency, one round trip, no re-index, and without engine-specific DSL.

Measured against production `addressr6`, 2026-08-07:

|                        | street-level-first               | recall (268 probes) | p50 / p90 wall     | round trips |
| ---------------------- | -------------------------------- | ------------------- | ------------------ | ----------- |
| baseline               | **60.0%** wrong (fresh 120-draw) | 42/268              | 160 / 202 ms       | 1           |
| `span_first` (ADR-042) | 0.0%                             | 45/268 (net +3)     | 342 / 417 ms       | 2           |
| **keyword prefix**     | **0.0%** (fresh 120-draw)        | 43/268 (net +1)     | **170 / 220 ms** † | **1**       |

`0.0%` is on a sample drawn fresh and never previously measured, which is what ADR-042 Confirmation 1 requires and what this decision inherits.

† **Superseded 2026-08-08 by the post-deploy measurement** in Confirmation 7 below. These were pre-merge candidate figures, retained because the published 3.0.8 CHANGELOG quotes them. Measured against the shipped clause: **p50 +1 ms, p90 −3 ms**, i.e. no detectable latency cost.

**Post-implementation confirmation, 2026-08-08 — measured against the shipped code, on freshly redrawn samples.** The table above records the _candidate_ measurements taken before implementation. The three below are separate draws against the shipped code — not restatements — and they are the **relevance** figures the release notes publish. Latency **has now been re-measured** against the shipped clause and is recorded in the fourth row; the figures the published 3.0.8 CHANGELOG quotes are the pre-merge candidate ones, superseded here.

| gate                                       | draw                                                                                                          | result                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| street-level-first                         | **150** addresses, redrawn                                                                                    | **0 violations (0.0%)**                                                                  |
| partial-prefix recall                      | **182** probes over 60 targets, redrawn                                                                       | **net 0** (8 lost, 8 gained); sensitivity gate PASS                                      |
| typo tolerance                             | **60** mistyped queries, both arms in the same run                                                            | 90.0% in page, 85.0% first — identical before and after                                  |
| latency (Confirmation 7)                   | **84** samples per arm, 6 replicates over ADR-027's 14 queries, legacy and shipped **interleaved in one run** | legacy p50 167 / p90 244 ms; shipped p50 169 / p90 **241** ms — **p50 +1 ms, p90 −3 ms** |
| ADR-027 14-query baseline (Confirmation 4) | legacy vs shipped, same run                                                                                   | **10 of 14 top-1 unchanged, 0 regressions**; see below                                   |

The recall figure differs from the table's `43/268 (net +1)` because it is a different draw at a different size, not because the property moved; both are net non-negative and the ladder's `net < 0` gate is what either would have to breach. Recording both, with their sizes, is the sample-provenance discipline Confirmation 1 exists to enforce — a reader who finds only one number cannot tell which run produced it.

### The selectivity gate

A `prefix` on a ~16.9M-term keyword dictionary costs whatever it matches. Measured: `"1"` took **2651 ms** against a 334 ms baseline; `"2"` took 1942 ms. `"A"` was _faster_ than baseline, because almost no SLA begins with a letter.

So the cost is driven by selectivity, not length — `"10"` is two characters and still cost +191 ms. The gate is therefore **whether the query has advanced past the street number** — precisely, a non-space followed by whitespace — and not a character count. It is deliberately not merely "contains whitespace": the two differ on a leading-space query, and Reassessment Criterion 2 protects this predicate specifically. With it, every measured case returns to within noise of baseline, several faster.

**The per-request number understates the case; the aggregate is the argument.** JTBD-001 is keystroke-level autocomplete, so a ~35-character address is ~35 requests — of which only the leading **bare-digit** keystrokes are pathological: two for a two-digit street number. The keystroke that adds the space is gated **on**, and measured against production on 2026-08-07 it sits within noise of baseline (`"1 "` −85 ms, `"55 "` +18 ms, `"8 "` −38 ms, median of 5, paired in the same run). The space is itself the selectivity: `prefix: '1'` enumerates `1…`, `10…`, `100…`, `11…`, whereas `prefix: '1 '` reaches only street-number-exactly-1.

Per 1,000 searches, priced at this ADR's own measured per-length figures rather than a flat worst case: **avoided** = 1,000 × (2,317 + 191) ms = **≈ 2,508 s**; **added** = ~33,000 gated-on requests × 10 ms p50 = **≈ 330 s**, or 594 s at the p90 delta. The gate therefore removes **81–88%** of the load this change would otherwise add (p90 to p50). That product, not the 2651 ms single-request figure, is what Reassessment Criterion 2 exists to protect.

Two provenance notes, because ADR-026 requires them of measured claims. The boundary figures are laptop-to-Sydney round trips against `addressr6` with roughly ±90 ms observed run-to-run spread, so **individual deltas are not separable from noise** — the only claim they support is the bounded one, that the boundary keystroke shows no pathology of the `"1"`-shaped kind. And the ~35-requests-per-search frequency is derived from JTBD-001's keystroke model, not from telemetry: **no data, worst-case assumption**.

Nothing is lost functionally. Before the second token there is no discrimination to add: the page is 8 rows drawn from millions either way.

### On ADR-025's drivers

**Driver 3 is satisfied, not overridden.** ADR-042 required an explicit override because `span_first` is Lucene-only. A prefix on a keyword field is expressible in every backend ADR-021 contemplates — as a statement about _clause expressibility_, not a claim that a backend abstraction layer exists (ADR-021 records that none does, and `src/init-index-config.js` says inventing one would be its first brick). **ADR-042's override is therefore withdrawn**, and ADR-025's engine-agnosticism rationale survives a live challenge on its merits.

**ADR-025's Option A is not revived.** Its `dis_max` _replaced_ the `bool_prefix` summation across `sla`/`ssla` — the mechanism ADR-025 chose. This `dis_max` sits alongside an untouched `bool_prefix` clause and replaces the sibling `phrase_prefix`. Both of Option A's rejection grounds fall anyway: the DSL-coupling ground on the portability argument above, and the tuning-parameter ground because **the clause being replaced was already `dis_max`-shaped**. `multi_match type: phrase_prefix` runs `best_fields`, which is sugar over `dis_max` with `tie_breaker` defaulting to 0.0. The production query has contained a `dis_max` since before ADR-025 was written; `src/build-search-body.js` and ADR-028's Confirmation both say so in as many words. ADR-025's Option A con is a factual error in a prior record, and correcting it is not the same as adopting the option.

**Driver 4 is satisfied for scoring weights, and honestly not more than that.** No boost, no `tie_breaker`, no magic constant enters the relevance calculation — better than ADR-042, which needed a `top_terms_128` invariance sweep to justify its constant. But the selectivity gate **is** a parameter: a query-shape classifier whose threshold was selected from measurement and whose alternative (a character count) was rejected on measurement. It moved from a score weight to a gate predicate; it did not disappear. Claiming zero parameters while Reassessment Criterion 2 exists to protect one would be self-contradictory on the face of this document.

### On JTBD-001's 200 ms target

Named as a driver, so it gets a verdict rather than a mention. **The target is already breached at baseline, and by more than first measured.** Pre-merge the baseline read p90 202 ms against a documented 200 ms, and this change looked like it moved it to 220 ms.

**Corrected 2026-08-08 on the post-deploy measurement** (Confirmation 7, 84 samples per arm, legacy and shipped interleaved in one run): **legacy p90 244 ms, shipped p90 241 ms.** So the pre-existing breach is ~22% rather than ~1%, and **this change does not move p90 at all**. Both halves of the original verdict were wrong in the project's favour: the baseline problem is larger and this decision's contribution to it is nil.

The disposition is unchanged and now rests on better numbers. This decision neither causes nor fixes the breach. No performance-budget ADR governs `/addresses?q=`, so accepting it is a standing position rather than a measured trade-off — **and promotion to `accepted` makes that a live accepted position on the revenue endpoint rather than a proposal's caveat.** Re-affirmed knowingly at promotion; a budget ADR remains the honest next step.

No performance-budget ADR governs `/addresses?q=`. This change moves the endpoint's cost model from analysis-bound to term-dictionary-bound, with the selectivity gate as the only thing holding the tail down, which is exactly when a budget would earn its keep. **Recorded here as knowingly ungoverned risk** rather than left implicit.

## Consequences

### Good

- Street-level-first holds at 0.0% on a freshly drawn national sample, against a 60.0% baseline.
- **Latency indistinguishable from baseline.** Measured post-deploy 2026-08-08: **p50 +1 ms, p90 −3 ms** (Confirmation 7). The pre-merge estimate of +10 / +18 ms, which the published CHANGELOG quotes, was conservative. Against `span_first`'s 2.1×, and one round trip rather than two.
- No re-index, no mapping change, no blue/green cutover.
- **P078's per-shard expansion-IDF mechanism leaves this clause entirely** rather than surviving at reduced amplitude as it does under `top_terms_128`. A prefix on a keyword carries no per-term IDF sum over an expansion set.
- No `span_multi`, so no `maxClauseCount` shard-failure mode — ADR-042 introduced one, where a lowered cluster setting turned a ranking question into total request failure.
- Portable. ADR-025 Driver 3 needs no override.
- Fixes the named exact-vs-range inversion: for `108 GAZE RD` the exact record moves from #2 to #1, measured on both the short and full query forms. Recorded on [P078](../problems/open/078-phrase-prefix-scores-depend-on-shard-local-expansion-set.md), which built its sensitivity gate on the case, and it is the defect [P075](../problems/open/075-adr041-inverts-exact-vs-range-on-one-address.md) exists for. **Correction 2026-08-08 — the mechanism is not what P075 recorded.** P075 attributes the inversion to ADR-028's `sla_range_expanded` last-endpoint alias. That field is populated on 0 of 16,905,824 production documents ([P091](../problems/open/091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md)), so it cannot have contributed to any score, and removing it from the query cannot be why this ranks correctly now. What fixed it is the removal of the `phrase_prefix` **clause** over `sla`/`ssla` — the same contains-semantics defect this whole decision addresses.
- Simpler to read: a `prefix` query, not a span tree assembled from analysed positions.

### Neutral

- ADR-028's endpoint recall and its mid-range false-positive invariant are unchanged, and the canonical range form still ranks first for its own query.
- `ssla` and ADR-025's symmetric population are retained unchanged; this composes with ADR-025.
- **Typo tolerance is unchanged, and that is measured rather than assumed.** A `prefix` on a keyword field has no fuzziness, and it is stricter than "no fuzziness" suggests: matching is all-or-nothing from position 0, so a single wrong character _anywhere_ — including in the postcode — voids the whole clause. That sounds alarming and is not, because **the clause it replaces was equally typo-intolerant**: `phrase_prefix` shipped with its fuzziness explicitly disabled (the original code carries a commented-out `// fuzziness: 'AUTO'`). Mistyped input has always been carried by the `bool_prefix` clause's `fuzziness: 'AUTO:5,8'` (ADR-027), which this decision does not touch.

  Measured on 60 mistyped queries (one substituted character in the street name), before and after: target in page **54/60 (90.0%)** both arms; target ranked first **51/60 (85.0%)** both arms; recall lost 0, gained 0. The anchor helps correctly-typed input and contributes nothing to mistyped input — which is precisely what the old clause did.

### Bad

- **`sla_range_expanded` leaves the query — and the measured cost of that is NIL, because the field has never been populated.** Established 2026-08-08 against production: `sla_range_expanded` is populated on **0 of 16,905,824** documents. It is generated correctly but indexed one level too deep, at `_source.structured.sla_range_expanded`, while the mapping declares and every query targeted the top level. ADR-028's index-side ranking mechanism has therefore never executed, and this decision removed a clause targeting an empty field. See [P091](../problems/open/091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md).

  Everything below was written before that was known. It is retained because the _reasoning_ is what a future reader needs when P091's fix lands and the question becomes live for the first time — but read it as analysis of a future option, not as a cost this decision incurred.

  **Nor would it have been a forced consequence.** An earlier draft of this ADR said the field was "barred from `bool_prefix` by a standing prohibition", which reads as an external constraint. It is not. **Both constraints are ours**, and neither survives contact with the mechanism this decision adopts.

  The `bool_prefix` rule is real but narrow: `multi_match type: 'bool_prefix'` uses `most_fields` semantics and **sums** per-field scores, so a third field carried only by range documents would hand them a free summand — the P007 asymmetry in a new costume. That is an argument about summation. **`dis_max` takes the max, so it does not transfer.** Measured 2026-08-08 against OpenSearch 3.5.0: a document lacking `sla_range_expanded` scored **exactly 1.0000** whether or not the field was in the `dis_max`. No inflation, no asymmetry.

  The absent `.raw` subfield is softer still — one argument in `src/init-index-config.js` (`analyzedTextField()` rather than `analyzedTextField({ raw: true })`), and the test that pins it names the reason: _"never sorted on"_. `sla`/`ssla` carry `.raw` because the query **sorts** on them. Nobody decided the aliases should not be prefix-matchable; prefix-matching was not a consideration when that line was written, because there was no prefix clause.

  So the endpoint-ranking win ADR-028 chose Option A for is **recoverable, and the anchor is a better carrier for it than `phrase_prefix` was**. Measured on ADR-028's own `TRAVEL INN HOTEL, 225-245 DRUMMOND ST` case — the CARSPACE-versus-range inversion from P026 — adding `sla_range_expanded.raw` to this `dis_max` moves the range document from **#2 to #1**. A `prefix` query matches a multi-valued keyword if any value matches, so the two aliases work as indexed.

  **What is deferred, and why.** Populating `.raw` on an existing field requires a re-index. That is a sequencing fact, **not** an argument: ADR-029's blue/green machinery exists precisely so a re-index is routine, and a required re-index must never be allowed to argue for a worse design. The reason this ships without it is that the two changes are independent — this one is verified end-to-end and fixes a live customer-visible defect on the revenue-generating endpoint today, and holding it behind a re-index cycle would trade a measured 60.0% → 0.0% improvement for a ranking refinement on a narrower population. The alias anchor is the next decision, not a discarded one.

  Meanwhile the bounded consequence stands: endpoint **recall** is unaffected, because the tokenizer splits `103-107` into `103` and `107` and `bool_prefix` carries it regardless, and all four ADR-028 probes behave identically to baseline.

  **ADR-028 therefore needs amending, and the false sentence is specific**: its Decision Outcome claims Option A preserves "the endpoint-recall and endpoint-ranking wins that `sla_range_expanded` was introduced for". The recall half survives. The ranking half is suspended until the alias anchor lands. Query-side ADR-028's outcome is its own rejected Option D in the interim, while index-side Option A is retained — and retained for a concrete reason, since the aliases are what the follow-up will anchor on. Its Reassessment Criterion 5 does **not** fire: the pin is re-pointed, not deleted, on ADR-028's own re-point-not-delete precedent. What is void is that criterion's _rationale_ (see Confirmation 10). Knock-on: ADR-027 Reassessment Criterion 3 prescribes symmetric `sla_range_expanded` population as one of two remedies for a future ranking inversion, and that remedy is unreachable until the field has a query-side carrier again.

- **The anchor masks analysis defects for literal prefixes, which costs ADR-041's gate some sensitivity.** Being analysis-blind is the whole point, but it cuts both ways: the clause matches whenever the typed text literally prefixes the stored SLA, _regardless of what the analyzer did_. So a query that ought to expose a broken analysis chain can be rescued into the page by the anchor instead. ADR-041's old-config control asserted that `55 Pyrmont Bri` **fails** against the deliberately-broken directional config; under this change it would pass, and the control would silently stop controlling anything. The probe moves to `Pyrmont Bri`, which is not a literal prefix, so the anchor contributes nothing and the analysis defect is isolated again. The masking is bounded — probes past the first comma are not literal prefixes either — but it is real, and it is why that probe must not be "tidied" back.
- **Recall is net +1 rather than `span_first`'s +3.** Still better than baseline. Re-measured 2026-08-08 on a 60-target draw: net 0 (8 lost, 8 gained), which is within the variation between draws.
- **The clause is analysis-blind.** No synonyms, no fuzziness, no case folding. It fires only when the typed text literally prefixes the stored SLA. Measured on 40 addresses, top-1 / in-page: verbatim 40/40, lowercase 40/40, no-comma 37/40 but **40/40 in page**, `RD`→`ROAD` 21/24 but **24/24 in page**, no-postcode 39/40 but **40/40 in page**. Degradation is graceful and never a loss, because `bool_prefix` carries the variants. The invariant to hold is target-in-page; the top-1 shortfall is accepted.
- **The uppercase transform assumes G-NAF SLAs are stored uppercase.** True today, silent breakage if it changes. The assumption is live only because the anchor moves off the analysed `sla`/`ssla` fields — whose chain begins with an `uppercase` filter — onto the unanalysed `.raw` keyword subfields, where nothing folds case. That guarantee is precisely what this change walks away from.

  A keyword `normalizer` is the robust form, and its cost is not the obvious one. `analysisStructureStamp` fingerprints only `analysis.filter` and `analysis.analyzer`, **not** `analysis.normalizer`, so adding one does not bump the `_meta` stamp and `initIndex`'s stale-config abort does **not** fire. What the loader does instead is **unmeasured**: `indexConfigMatches` would return false, so it reaches `putMapping`, and adding a normalizer to an already-existing keyword subfield is a mapping change on an existing field. Measure that path against a local engine before adopting — ADR-041 set exactly that precedent for the in-place route rather than reasoning about it. What is _not_ unmeasured, because ADR-041 already records it for analyzers, is that a mapping update does not re-normalise terms already indexed: existing documents keep the terms they were written with. Prefer the **uppercase** direction, which mirrors the analysed fields' existing filter and is a no-op on today's data.

- The selectivity gate is a behavioural discontinuity: the same query gains a clause on typing a space. Defensible, measured, but it is a rule a reader must know about.

## Confirmation

Inherited from ADR-042 and still binding:

1. **Corpus-scale street-level-first**, on a **randomly redrawn** national sample. A frozen sample degenerates into the instance-pinning that hid this for months. `test/perf/street-level-first-probe.mjs`.
2. **Corpus-scale partial-prefix recall**, target-in-top-8, mid-word probes, with the sensitivity gate that aborts unless it reproduces P078's four recorded losses. `test/perf/partial-prefix-recall-ladder.mjs`. **Both arms of that gate, and the ladder's baseline arm, run against the `legacy` variant** — the pre-this-decision body — because `legacy` is the configuration P078 recorded those losses in and is the arm recall must not regress _from_. `legacy` is therefore a load-bearing fixture in `test/perf/relevance-lib.mjs` and must not be deleted; point only one of the two call sites at it and the gate compares an uncontrolled pair.
3. **Fixture-scale Cucumber discharges neither gate** and is retained as non-regression only. This sentence is load-bearing: the property measured 0% on OT and TAS while production measured 62.7% on the first draw and 60.0% on a later one — two draws of the same property, which is itself the point, and reading a green Cucumber run as sufficient is how the defect survived two closures.
4. **ADR-027's 14-query v2.3.0 baseline** re-run post-deploy.
5. **Query-body single source** — service and ADR-041 integration test both build from `src/build-search-body.js`. Standing invariant, holding as of 3.0.7.

New to this decision:

6. **ADR-028's five endpoint scenarios, the mid-range false-positive, and the canonical-range-first probe** — now load-bearing rather than non-regression, since `sla_range_expanded` leaves the query.
7. **Latency re-baselined.** Do not carry ADR-042's 46.5 / 81 ms forward; it disagrees with today's measured baseline by 3.4× and is undischargeable. Pin against a baseline reproduced in the same run, and take replicates — the +10 ms p50 delta is within observed run-to-run drift and is not yet distinguishable from noise.
8. **Short-prefix latency.** Assert the selectivity gate holds: single-character and bare-street-number queries stay within noise of baseline. This replaces ADR-042's `maxClauseCount` probe as the failure mode that must not regress.
9. **The uppercase assumption**, pinned at the three layers where it can actually fail, each instrument matched to what it can prove.

   a. **The data assumption, at corpus scale — this is the real one.** No indexed `sla.raw` differs from its own uppercasing, on a **randomly redrawn** sample. G-NAF case is a property of the quarterly distribution, not of this codebase: `mapToSla` is `fla.join(', ')`, every component traces to an `Authority_Code_*_AUT_psv` NAME/CODE column or a raw `ADDRESS_DETAIL` column, and nothing in `service/address-service.js` uppercases `sla` or `ssla`.

   b. **The data assumption, at the loader — NOT SHIPPED, and named as a gap rather than a plan.** The instrument would be `mapAddressDetails` counting _and logging_ any mapped `sla`/`ssla` differing from its own uppercasing, escalating to fail-loud once a clean baseline run establishes the count is zero; a counter nobody reads fires nothing. It is the only instrument that would fire at the quarterly refresh rather than at the next customer query. **No such instrument exists today and none is added by this decision.** Recorded plainly rather than deferred to a ticket that does not exist: until it is built, Reassessment Criterion 3 is detectable only by 9a, and only when someone deliberately runs it.

   c. **The code assumption — what a unit test can honestly prove.** Given uppercase G-NAF inputs, `mapAddressDetails` output equals its own uppercasing: the mapper is case-preserving and introduces no lower- or mixed-case literal of its own (today's sole code-authored alphabetic literal is `LOT`). The assertion message must say this proves the mapper does not _introduce_ case, and does **not** prove G-NAF is uppercase — 9a and 9b carry that. A unit test asserting "the output is uppercase" would pass because the _fixture_ is uppercase and would keep passing after G-NAF changed: the instance-pinning Confirmation 3 exists to end.

   d. **End to end**: a mixed-case query probe against a real index.

10. **`dis_max` carries no explicit `tie_breaker`** — the re-pointed ADR-028 pin. Note that its _original_ rationale does not survive the move: absent-field-contributes-0 mattered because `sla_range_expanded` was absent on non-range docs, whereas `sla.raw` and `ssla.raw` are populated on **every** document (`sla` unconditionally, `ssla` unconditionally per ADR-025's symmetric population). No field is absent, so a raised `tie_breaker` cannot act as a malus. The pin survives on **ADR-025 Decision Driver 4** — a non-zero value would be a magic number needing its own justification — and the assertion message must say so, or the suite states a false rationale.

11. **Variant-tolerance floor**: target-in-page for punctuation and synonym variants, **and for single-character typos**, which the original variant sweep did not cover and which are the most common real-world autocomplete input error. The typo arm must be measured against the pre-decision query in the same run, since the claim is parity rather than improvement. Records the top-1 shortfall as accepted with its mechanism named, so a future reviewer does not read it as a defect and re-open a settled trade.
12. **`sla.raw` / `ssla.raw` carry no `ignore_above`.** Currently true and previously unremarked, now load-bearing: adding one would silently strand long SLAs from the anchor while leaving every test green.

13. **The selectivity boundary is crossed by the ADR-041 instrument.** Before this decision `test/integration/search-analysis.test.mjs` built prefixes from two tokens up, so every probe contained whitespace and every probe was gated **on** — the instrument structurally could not cross the one discontinuity this change introduces, leaving Reassessment Criterion 6 undischargeable by its own nominated gate. Two changes ship with this decision: `prefixes()` defaults to **one** token so the walk starts on the gated-**off** side, and an explicit boundary probe walks `'55'` → `'55 '` → `'55 P'` → `'55 PY'`. The trailing-space step is the boundary itself and cannot be dropped — the gate turns **on** at `'55 '`, and no token-joined prefix ever produces it.

### Confirmation 4 in detail, with its frame stated

**The frame is legacy-vs-shipped in one run, NOT the recorded v2.3.0 baseline**, and that distinction matters: measured against the April document, three of the four changes below had already drifted before this decision, through ADR-027, ADR-028, ADR-041 and a reindex. The in-run legacy arm is the better instrument. **The v2.3.0 baseline document should be re-captured at 3.0.8**, or Confirmation 4 amended to name the in-run comparator, otherwise the next change inherits a stale reference. Comparison was **top-1 only**.

| Q                               | change                                                      | reading                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 `16 Gaze Rd Christmas Island` | `UNIT 1, 16 GAZE RD` → `16 GAZE RD`                         | **Improvement, and a restoration.** `16 GAZE RD` was top-1 in the April record; legacy has since drifted off it and the shipped clause puts it back. This is ADR-025 Driver 1 delivered.                                                                                                                                                                                                                       |
| 11 `MURRAY RD CHRISTMAS ISLAND` | `22 MURRAY RD` → `16 MURRAY RD`                             | **Neutral.** Both arms are score-tied (legacy 50.3797 ×4, shipped 17.2927 ×3) and both resolve by the documented `ssla.raw asc` tiebreak. The query carries no street number, so neither answer is more correct.                                                                                                                                                                                               |
| 12 `3053`                       | `30536 BRAND HWY, WA` → `1 CHARLES ST, CARLTON VIC 3053`    | **Neutral, and a page-level change rather than a reorder** — `30536 BRAND HWY` leaves the top 8 entirely. It is still matched by `bool_prefix`; it is outranked. Whether a bare postcode should return that postcode or a street number beginning `3053` is recorded nowhere as correct, and the ambiguity self-corrects two keystrokes later when the gate opens. Recorded as a change, not claimed as a win. |
| 14 `Carlton VIC`                | `30 CARLTON ST` → `CARLTON GARDENS NORTH, 1-111 CARLTON ST` | **Neutral on correctness** — both are in Carlton VIC 3053 — but see the class below. Not the tiebreak: digits sort before letters, so a tie would have kept `30 CARLTON ST` on top. The winner scores strictly higher, most likely because `CARLTON` appears three times in it.                                                                                                                                |

### The class this surfaced: gated ON, but nothing prefixes

Queries 11, 12 and 14 share a property the decision did not previously characterise. **The typed string prefixes no stored SLA**, so the anchor contributes nothing and the observed change is the _uncompensated removal of `phrase_prefix`_. Verified directly: the `dis_max` alone returns **0 hits** for both `Carlton VIC` and `MURRAY RD CHRISTMAS ISLAND`.

This is a large class — street-name-first, locality-only, building-name-first and postcode-only queries — and it is distinct from the gated-off class the selectivity-gate section characterises. **No gate covers it**: the recall ladder cuts mid-word in the 2nd or 3rd token of a full address, so every probe is number-leading. Three observed samples are all non-regressions, which is why this does not block promotion, but three is not a characterisation. Reassessment Criterion 7 below is added for it.

## Production Validation

Promoted to `accepted` on 2026-08-08, the day after release, against the three conditions this ADR defined **before** the evidence arrived. DECISION-MANAGEMENT.md's "positive track record" criterion delegates its own definition — _"define timeframe/success criteria"_ — so the bar here is event-based rather than a clock, which is the repo's standing practice: ADR-041 was promoted on the day of its cutover, and ADR-029 Phase 1 waived a 7-day soak on positive health evidence.

**1. Maintainer confirmation.** Verified on the live site and accepted 2026-08-08. The demonstration was stronger than the reported case: typing the **partial** `8 WATERS R` returned six street-level `8 WATERS RD` records across different localities with no sub-unit among them, and at `8 WATERS RD` the `UNIT 8, 8 WATERS RD, NEUTRAL BAY` record sat below all six. That exercises the anchor's discriminator directly — `UNIT 8, 8 WATERS RD` does not literally prefix `8 WATERS R` — and, being a partial-prefix shape, touches P069's property as well as this decision's.

**2. Confirmation 4 discharged.** ADR-027's 14-query baseline, legacy versus shipped in one run: 10 of 14 top-1 unchanged, 4 changed, **0 regressions**. Frame, scope and the reading of each change are recorded above; two of the four are improvements and two are neutral, one of them a page-level change recorded as such rather than claimed as a win.

**3. Confirmation 7 discharged.** Latency re-measured against the shipped clause: **p50 +1 ms, p90 −3 ms**. The pre-merge estimate was conservative in both directions — the baseline breach of JTBD-001's 200 ms target is larger than recorded (legacy p90 244 ms) and this decision does not contribute to it.

**What acceptance does not cover.** Maintainer acceptance is of the reported case; the property evidence is separate and is what makes one address sufficient now where it was not in April — 0 violations of 150 on a freshly redrawn national sample, against 60.0% of a 120-address draw. Reassessment Criterion 1 is the standing guard, and it fires only when someone deliberately runs `test/perf/street-level-first-probe.mjs`; no cadence is automated. Criterion 7 records a class this promotion did not characterise.

## Reassessment Criteria

1. The street-level-first property is measured at corpus scale and found violated, whether or not a user reports it.
2. Short-prefix latency regresses, or the selectivity gate is removed or weakened.
3. G-NAF SLAs stop being stored uppercase, or a keyword `normalizer` is adopted. Two riders. The normalizer route is **unguarded**: `analysisStructureStamp` does not fingerprint `analysis.normalizer`, so adopting one does not trip `initIndex`'s abort — extending the stamp is a prerequisite of adoption, not a follow-up. And this criterion does not fire by itself: with Confirmation 9b unshipped, detection requires someone to deliberately run the 9a corpus probe.
4. `sla_range_expanded` remains without a query-side carrier — **but see [P091](../problems/open/091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md) before acting on this criterion, which now leads.** The field has never been populated (0 of 16,905,824 documents; it is written to `_source.structured.sla_range_expanded` while the mapping declares the top level), and measurement says it should be removed rather than repaired: it contributes nothing to endpoint recall — 100/100 gap-case probes found in page without it, 92 of them at rank #1 — and in 66.7% of range addresses at least one endpoint exists as its own address, where the alias would make the range document compete with the real one. An earlier draft of this criterion said removing the field from the query was part of why the `108 GAZE RD` inversion ranks correctly. That was wrong: an empty field contributes nothing to a max. Re-open only if P091 resolves toward keeping the field, and then measure both directions before restoring it.
5. A backend migration makes the portability argument live rather than theoretical.
6. Partial-prefix recall regresses on ADR-041's superset property.
7. **The non-prefixing class is measured and found to regress.** Queries where the typed string prefixes no stored SLA — street-name-first, locality-only, building-name-first, postcode-only — receive nothing from the anchor and are exposed to the bare removal of `phrase_prefix`. Three samples were checked at promotion and none regressed; the class is uncharacterised beyond that, and no gate reaches it because the recall ladder's probes are all number-leading. Extend the ladder with non-number-leading probes, or accept the gap knowingly.
