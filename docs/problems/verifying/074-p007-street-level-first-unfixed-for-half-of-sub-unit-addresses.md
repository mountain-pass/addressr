# Problem 074: P007 street-level-first is unfixed for ~50% of addresses with sub-units

**Status**: Verification Pending
**Reported**: 2026-07-31
**Origin**: internal — surfaced 2026-07-31 while measuring the blast radius of P073.
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Almost certain (4). Impact 4 per RISK-POLICY § Impact: paid and free RapidAPI consumers are handed the wrong "best match" on the revenue-generating `/addresses?q=` endpoint. This is the defect issue [#375](https://github.com/mountain-pass/addressr/issues/375) reported and that ADR-025 was written to fix. Likelihood 4: measured at 50.3% of a 145-address sample against live production, and deterministic per address.
**Effort**: L — a scoring/ranking fix on the search-relevance path, needing a corpus-scale before/after measurement rather than a spot check, and very likely an ADR-025 amendment.
**WSJF**: 4.0 — (16 × 1.0) / 4
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

ADR-025 (Symmetric `ssla` Indexing for Search Ranking) was accepted to fix P007: for a query carrying no sub-unit token, the exact street-level match must rank first, above sub-units at that address. Its Decision Driver 1 states this as a correctness requirement.

**It is unfixed for about half of the affected addresses.** Measured 2026-07-31 against live production (`addressr5`): 145 street-level addresses that also have sub-units, each queried exactly as written, checking whether the street-level record ranks first.

**73 of 145 = 50.3% return a sub-unit first.**

Confirmed end to end through the live RapidAPI endpoint, not just against the backend. `8 WATERS RD, NEUTRAL BAY NSW 2089`:

| #   | result                                     | score     |
| --- | ------------------------------------------ | --------- |
| 1   | UNIT 1, 8 WATERS RD, NEUTRAL BAY NSW 2089  | 53.560207 |
| 2   | UNIT 1, 8 WATERS RD, NEUTRAL BAY NSW 2089  | 53.560207 |
| 3   | UNIT 11, 8 WATERS RD, NEUTRAL BAY NSW 2089 | 53.560207 |
| 4   | UNIT 19, 8 WATERS RD, NEUTRAL BAY NSW 2089 | 53.560207 |
| …   | … all eight results are UNIT records       | 53.560207 |

The bare `8 WATERS RD, NEUTRAL BAY NSW 2089` document **exists in the index** and is not returned at all in the first page.

## Symptoms

Querying a street address that has sub-units returns the sub-units and not the street-level address. Consumers are handed the wrong best match. This is precisely the complaint in issue #375.

## Workaround

None for consumers.

## Impact Assessment

- **Who is affected**: RapidAPI consumers querying any street address with sub-units — concentrated in dense metro addresses, which is where consumer traffic concentrates. Both paid and free tier.
- **Frequency**: 50.3% of a 145-address sample. Deterministic per address.
- **Severity**: Significant — wrong best-match on the primary product surface, on a previously-reported customer-visible defect believed fixed.

## Root Cause Analysis

### Confirmed root cause 2026-08-06 — this is P078's mechanism

Confirmed by `_explain` against live production (`addressr6`) on 2026-08-06. **The cause is the per-shard `phrase_prefix` expansion-IDF mechanism recorded in P078**, not a failure of ADR-025's symmetric `ssla` indexing.

ADR-025's mechanism is verified **present and working**. The street-level document `GANSW718868682` carries `ssla = "8 WATERS RD, NEUTRAL BAY NSW 2089"`, identical to its `sla` — symmetric indexing is in the index as designed, and the `bool_prefix` clause scores the street-level document **higher** than the sub-unit, exactly as ADR-025 intended:

| clause                       | street-level `GANSW718868682` | sub-unit `GANSW718868613` |
| ---------------------------- | ----------------------------- | ------------------------- |
| `bool_prefix` on `sla`       | 12.4359                       | 11.3948                   |
| `bool_prefix` on `ssla`      | 12.2632                       | 11.7201                   |
| **`phrase_prefix` (max of)** | **22.0088**                   | **34.2438**               |
| total                        | 46.7079                       | 57.3587                   |

The entire 10.65-point deficit is the `phrase_prefix` clause, and its cause is visible in the matched terms:

```
sub-unit    ssla:"8 WATERS RD NEUTRAL BAY NSW (2089 2089E 2089S 2089A)"   idf sum 74.66
street-level ssla:"8 WATERS RD NEUTRAL BAY NSW (2089 2089A)"              idf sum 44.77
```

The final query token is rewritten into a MultiPhraseQuery whose last position holds the prefix-expansion set, and **BM25 sums the idf of every alternative at that position** — including alternatives the matching document does not contain. The sub-unit's shard happens to hold three extra terms beginning `2089` that each occur exactly once (`n=1`, idf 14.6287 apiece, ~43.9 points of pure noise). The street-level document's shard holds one such term (`n=2`, idf 14.1177). `tf` is near-identical and in fact slightly **favours** the street-level document (0.483 vs 0.459).

So the two documents are scored against different expansion sets purely because they landed on different shards. Nothing about either document or the quality of its match to the query is involved.

**`search_type=dfs_query_then_fetch` does not fix it** — re-tested here, byte-identical ranking. DFS globalises term statistics but the expansion set is rewritten per-shard before DFS gathers stats. This matches P078's finding exactly.

### This supersedes the preliminary observation

The earlier note below is **wrong** and is retained only for provenance:

> Every returned sub-unit carries an identical score (`53.560207`) … the street-level document is not scoring competitively at all. This is a **different failure from P073**.

The identical sub-unit scores are a consequence, not a cause: all eight sub-units share a shard and therefore share an expansion set, so they tie exactly. The street-level document _is_ in contention — it loses by ~10 points on one clause. **P078's Related section records P074 as "a different failure shape"; that is now falsified.** This measurement discharges P078 investigation task 3 affirmatively for P074.

### Why this was invisible

The SSLA-14 baseline and the Cucumber P007 scenarios sample addresses where the invariant **does** hold (`278 ROSS RIVER RD`, `19 MURRAY RD`, `16 GAZE RD`). Both gates pass while half the corpus violates the property. The gates pin _instances_, not the _property_.

Small states do not exhibit it at all: measured **0%** violations on both OT (5,186 docs) and TAS (375,613 docs). The failure concentrates in dense metro addresses with many sub-units. Any local or fixture-scale reproduction will therefore show a false clean bill of health.

### Candidate fixes, measured 2026-08-06 / 2026-08-07

Measured against a fresh 150-address sample drawn randomly from sub-unit-bearing addresses nationally (harness rebuilt this session; the 2026-07-31 sample was not retained). Property under test is ADR-025 Decision Driver 1: querying the street-level address verbatim must return that street-level record at position 1. All candidates are **query-time only — no mapping change, no re-index.**

| Candidate                              | street-level-first violations | partial-prefix recall                              |
| -------------------------------------- | ----------------------------- | -------------------------------------------------- |
| baseline (production today)            | 94/150 = **62.7%**            | reference — 42/268 on the rebuilt ladder           |
| `max_expansions: 10`                   | 87/150 = 58.0%                | not measured                                       |
| `max_expansions: 5`                    | 67/150 = 44.7%                | not measured                                       |
| `max_expansions: 2`                    | 28/150 = 18.7%                | not measured                                       |
| `max_expansions: 1`                    | 1/150 = **0.7%**              | 27/268 — **lost 20, gained 5**; rejected           |
| `constant_score` wrapper, boost 20     | 3/150 = **2.0%**              | 43/268 — lost 10, gained 11 (net +1)               |
| `ssla` dropped from phrase clause only | 91/150 = 60.7%                | not measured — rejected, barely moves the property |
| **anchored phrase (`span_first`)**     | **0/150 = 0.0%**              | **45/268 — lost 6, gained 9 (net +3)**             |

The violation rate is monotone in the expansion count, which is itself confirmation of the mechanism.

**The anchored-phrase candidate supersedes `constant_score` as the leading option** (2026-08-07). It is the only candidate that wins on both properties, and it is also marginally faster: p90 81 ms against baseline 99 ms over 40 queries, because anchoring prunes candidates before scoring.

The insight is the maintainer's: `match_phrase_prefix` matches the phrase **anywhere in the field** — only the final _term_ is a prefix. We want "field starts with what was typed". A sub-unit's `sla` and `ssla` both literally contain the parent's full address (`UNIT 1, ⟨8 WATERS RD…⟩`; `ssla` tokenises `1/8 …` to `1@0 8@1 WATERS@2 …`), so under "contains" semantics the discriminator is **absent from the text by construction** and no scoring change is well-posed. Under "starts with" it is present and exact, because both accepted notations put the sub-unit marker at the head of the string. Verified: `8 WATERS RD…` → parent first; `UNIT 1, 8 WATERS RD…` → that unit; `1/8 WATERS RD…` → that unit.

That also explains why the earlier `ssla`-only probe failed. The containment is not specific to `ssla`; it holds for every field and notation, so there is no field to remove.

Implementation notes carried from the measurement:

- The final position must stay a prefix (`span_multi`), or the anchor drops 20 recall probes — the same damage `max_expansions: 1` does — because `span_term` is exact and `14 FALK` stops reaching `FALKLAND`.
- `span_multi` enumerates matching terms and dies on the 1024-clause cap for short or synonym-expanded finals: `86 NORTH` expands the synonym `N`, and `N*` fails **all shards**. A bounded rewrite (`top_terms_128`) is required. Unlike `max_expansions` this cannot decide parent-vs-child — anchoring does that structurally — so the ADR-025 Driver 4 argument differs, but it still has to be made and tested.
- `span_first` is Lucene-specific. The objection is **ADR-025 Decision Driver 3**, not ADR-021 (which constrains no query DSL) — see Fix Strategy prerequisite 8. A portable equivalent exists and is stronger than it first appears: an **index-time start-of-field sentinel token** (prepend a marker via char_filter, then query a plain `match_phrase_prefix` for `SENTINEL <query>`) gives identical semantics with zero engine-specific DSL, and works anywhere a literal token can be phrase-matched. It costs a re-index, which is exactly the trade ADR-025 already adjudicated — and it chose the index-shape side. Record it as a Considered Option and as the migration path if not adopted outright. ~~A `sla.raw` keyword-prefix clause is **not** viable: it is exact-string (so `8 waters rd neutral bay` fails), cannot carry the `ssla` slash normalisation, and `sla_range_expanded` has no `.raw` subfield at all.~~ **Two of these three are FALSIFIED, measured 2026-08-07.** (a) A `prefix` query on a keyword is starts-with, not equality, and the case objection is answered by uppercasing the query — measured 40/40 top-1 on lowercase input. (b) `ssla.raw` is in the clause and slash-form still resolves. (c) The `sla_range_expanded` point is **correct and stands**; it is recorded as the accepted cost in ADR-043's Bad consequences. This verdict is retained rather than deleted because a live "not viable" sitting beside the shipped mechanism is exactly the false-but-trusted governance fact P090 exists about.

### Investigation Tasks

- [x] Measure the violation rate at corpus scale against live production — 73/145 = 50.3%.
- [x] Confirm through the public API rather than only the backend — done, `8 WATERS RD`.
- [x] Confirm it is not a regression from ADR-041 — ADR-041 measures 71/145 = 49.0% on the identical sample, marginally better.
- [x] Check whether smaller corpora reproduce it — they do not; OT and TAS both 0%.
- [x] Determine why the street-level document is not competitive, using `_explain` on a violating pair — done 2026-08-06; it is P078's per-shard expansion-IDF mechanism, and the street-level document _is_ in contention.
- [x] Decide the fix — settled 2026-08-07 on the **keyword-prefix anchor**, recorded in [ADR-043](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.proposed.md). ADR-042's `span_first` was ratified and superseded the same day: it needs an `_analyze` round trip per search, and the keyword prefix reaches the same 0.0% at baseline latency, portably, with no re-index. Earlier in the day `constant_score` was the candidate. The ADR it required is [ADR-042 Anchored span phrase clause for street-level-first ranking](../../decisions/042-anchored-span-phrase-clause-for-street-level-first-ranking.superseded.md), ratified by the maintainer 2026-08-07 (`human-oversight: confirmed`); it stays `status: proposed` until the fix is verified in production, per DECISION-MANAGEMENT.md. The ADR-025 amendment it required has partially landed — see Fix Strategy prerequisite 2, which is NOT fully discharged.
- [x] Build the corpus-scale partial-prefix recall ladder that gates the change (shared with P078 task 1) — **partially discharged 2026-08-07**. A valid 268-probe ladder exists and every candidate is measured against it. Two gaps remain: the harness is not committed (next task), and the probe frame must cut **mid-word** in the 2nd/3rd token to be on-mechanism — a fraction-of-length frame lands on word boundaries and measures 0 losses over 360 probes, a vacuous null. The ladder carries a sensitivity gate asserting it reproduces P078's four recorded `max_expansions: 1` losses; it aborts otherwise.
- [ ] **Explain the six probes the anchored candidate still loses** — `107 WOL`, `68 WATT`, `72 WATT`, `63 TOW`, `65 TOW`, `79 GLA`, plus `49 CHURCH ST` (one of P078's four known `max_expansions: 1` losses, which recurs here under a mechanically unrelated candidate). **They are not lost — they are outranked** (diagnosed 2026-08-07). All six still match, and the target is still returned: for `107 WOL` the anchored clause matches 142 documents and ranks `107 WOLLONGONG ST, FYSHWICK ACT 2609` at position 11, against position 4 on baseline. It falls off the 8-result page rather than out of the result set. Every one of the six has a **common** street name (`WOLLONGONG`, `WATTLE`, `TOWNSVILLE`, `GLADSTONE`, and `CHURCH` for the seventh); the documents displacing them have rarer ones (`WOLLOMBI`, `WOLSELEY`, `TOWNSEND`). Note that the target was already in a 3-way score tie on baseline (321.8182) and remains in one under anchoring (1426.8823) — the change is how many documents sit above the tie, not the tie itself.

Remaining hypotheses: (a) the `top_terms_128` bounded rewrite on the final `span_multi` position retains per-term IDF scoring, so the clause rewards rare street names — but see the falsified note below, this is at most partial; (b) the `end=N` anchor window is too tight where a multi-word index synonym inflates positions, pushing terms past the window (the ADR-041 `NORTH EAST` hazard, prerequisite 14).

Two hypotheses are **falsified**:

- _Exact `span_term` on non-final positions breaks the anchor where `match_phrase_prefix` tolerated a typo._ `match_phrase_prefix` is already exact for non-final terms (the `fuzziness` line is commented out in `buildAddressSearchBody`, `src/build-search-body.js`), so nothing changed there.
- _Removing the clause's contribution to ranking fixes it._ Tested: wrapping the anchored clause in `constant_score` (so it decides eligibility only and `bool_prefix` does all ranking) measures **worse** — 44/268 with 9 lost against the scored anchor's 45/268 with 6 lost, and it loses three of P078's four known probes instead of one. Street-level-first stays at 0/150 either way. So the displacement is not simply the final position's IDF, and flattening the clause is not the remedy.

**Not blocking — the instrument is at fault, not the query** (maintainer correction, 2026-08-07). The ladder designates a single "correct" target per probe, drawn from `test/perf/exact-vs-range-frame.json` — a frame built for exact-vs-range pairs, not for prefix autocomplete. For a three-letter probe like `107 WOL` that designation is arbitrary: 142 addresses match, across a dozen street names, and nothing about the query prefers Fyshwick over Como, Lidsdale or Cessnock. Every result the anchored clause returns for `107 WOL` does start with `107 WOL`, so the candidate is behaving correctly and the ladder is scoring a coin flip as a failure.

`WOLLONGONG` ranked 4th on baseline only because of the per-shard IDF noise this whole ticket is about. Treating its departure as a regression would be defending the noise.

What remains worth doing is narrower: make the ladder's target designation meaningful for short probes (assert the street _name_ survives rather than one locality's instance of it), or restrict the ladder to probe lengths where a unique target genuinely exists. Until then the six-probe figure should not be read as a recall cost.

- [x] Commit the measurement harness so the gate is reproducible — done 2026-08-07. Landed as `test/perf/relevance-lib.mjs`, `test/perf/street-level-first-probe.mjs` and `test/perf/partial-prefix-recall-ladder.mjs`, with `test/perf/sample.json` as the terminal record of the 2026-08-06 run. **Ported from Python to Node before committing**, on the architect's finding that a Python version would have to restate the query body and would therefore be the third hand-copy of it — the same defect fixed in 3.0.7 that morning. Every candidate is now a delta on `src/build-search-body.js`. Reproduction verified after the port: baseline 94/150 = 62.7%, anchored 0/150, ladder 268 probes net +3 with the sensitivity gate passing, all byte-identical to the scratchpad figures.
- [ ] Widen the sample and characterise which addresses violate (sub-unit count? locality density? presence of a range?).
- [ ] Replace the instance-based P007 gates with a **property** assertion: for a street address with sub-units, the street-level record ranks above all of them.

## Fix Strategy

**Superseded 2026-08-07.** The prior strategy — wrap the `phrase_prefix` clause in a `constant_score` filter — is replaced by the anchored-phrase candidate, which measures 0.0% against `constant_score`'s 2.0% and is net-positive rather than net-neutral on recall.

Replace the `phrase_prefix` clause built by `buildAddressSearchBody` in `src/build-search-body.js` with an anchored phrase clause per field over `sla` and `ssla`, so the clause means "this field **starts with** what was typed" rather than "contains it":

```
span_first(
  span_near([ <span_or of span_term per analyzed position>…,
              <span_or of span_multi/prefix, rewrite top_terms_128, for the FINAL position> ],
            slop=0, in_order=true),
  end=<number of analyzed positions>)
```

The `bool_prefix` clause is left byte-identical, so recall continues to come from it and ADR-025's summation symmetry is untouched. `ssla` is retained in full — it delivers notation tolerance (`14/2 Parkes` and `Unit 14, 2 Parkes` both work), which is an independent wanted feature and not the cause of this defect.

Blocking prerequisites, per the architecture reviews of 2026-08-06 and 2026-08-07:

1. **A new ADR is required.** This is the fourth query-shape change on the revenue endpoint in the ADR-025 → ADR-027 → ADR-028 → ADR-041 lineage; precedent settles the grain. It must argue past ADR-025 Decision Driver 4 ("no tuning parameters"), which is a real obstacle for a `boost: 20` magic number.
2. **ADR-025 needs an amendment regardless. PARTIALLY DISCHARGED 2026-08-07 — three of four parts remain.** The reassessment criterion landed (_the Driver 1 property is measured at corpus scale and found violated, whether or not a user reports it_). Still outstanding, and these are the consequential ones:

   - Its recorded **root cause** still names `bool_prefix` summation asymmetry alone. That was real and was fixed; the live defect is per-shard `phrase_prefix` expansion IDF. ADR-025's body has not absorbed the correction.
   - Its **Consequences** still read flatly "Exact street-level matches rank first for no-sub-unit queries — resolves P007 / issue #375", measured at 62.7% violation. This is the single most consequential false claim in the decision corpus on this topic, and it is the upstream of the #375 retraction text prerequisite 14 requires.
   - Its **Confirmation** still pins instances (`GAOT_717321355`, `278 ROSS RIVER RD`) with no property-level criterion. Tracked separately by the investigation task on replacing the instance-based gates.

3. **DISCHARGED 2026-08-07 in 3.0.7** — `test/integration/search-analysis.test.mjs` now imports `buildAddressSearchBody` from `src/build-search-body.js` rather than hand-copying the body (line 32 imports it, line 102 calls it). ADR-027's Confirmation records the same fact, and ADR-042 Confirmation 9 carries it forward as a standing invariant. Original text: **it built its own copy of the query body** rather than importing from the service. Changing the service without it leaves ADR-041's property test green while production diverges — the gate P069 was closed on is not load-bearing for this change until that copy is fixed.
4. **Re-run ADR-028's five endpoint-recall scenarios**; `sla_range_expanded` lives in this clause only, so range-endpoint recall runs entirely through the clause being modified.
5. **Sequence against P069**, which is in Verification Pending on this same clause with an open "re-check relevance scoring" task. Do not perturb the clause while its verification property is being altered underneath it.
6. Correct the stale `ADR 026` citation. **Re-pointed 2026-08-07, not discharged**: the query-side citations moved to `src/build-search-body.js` and were corrected to ADR-028 there, but a stale `// ADR 026:` comment survives on the **indexing** side at `service/address-service.js:778`.
7. **Fix the recall ladder's target designation for short probes.** Downgraded from blocking (2026-08-07): the six "losses" were the instrument marking a coin flip as a failure, not a recall cost — see the Investigation Task. The ladder must assert something determinate at three-character probe lengths (the street _name_ surviving, rather than one locality's instance of it), or restrict itself to probe lengths where a unique correct answer exists. This gates the ladder's credibility as evidence, not the fix.
8. **DISCHARGED 2026-08-07** by ADR-042's Decision Outcome, which quotes ADR-025's "driven **primarily** by engine-agnosticism" verbatim, states that `span_first` is more Lucene-specific than the `dis_max` ADR-025 rejected on that ground, records the maintainer direction, and states that ADR-021 imposes no query-DSL constraint. Original requirement: **argue past ADR-025 Decision Driver 3, not ADR-021.** ADR-021 imposes no constraint on query DSL and none of its criteria fire. The binding conflict is ADR-025's own Decision Outcome, which chose symmetric indexing "driven **primarily** by engine-agnosticism … encoding the ranking fix in data rather than in Lucene-specific DSL", and rejected `dis_max` (Option A) on exactly that ground. This proposal adopts a mechanism **more** Lucene-specific than the one ADR-025 rejected for being Lucene-specific. Arguable, but it must be argued explicitly or the ADR reads as reversing ADR-025 without noticing.
9. **Carry `sla_range_expanded` into the anchored clause as a third span field.** Correcting an earlier reading here: a query for `105 GAZE RD` failing to match `103-107 GAZE RD` is **not** a defect — ADR-028's key correctness invariant is that mid-range numbers must NOT match, and its Confirmation pins that explicitly. Anchoring is in fact a **better** fit than `phrase_prefix`, because the range aliases are synthesised as complete head-anchored strings (`103 GAZE RD, …` / `107 GAZE RD, …`) that match at position 0 cleanly. The real hazard is omission: if the `phrase_prefix` clause is deleted and the field is not carried over, `sla_range_expanded` leaves the query entirely — `bool_prefix` does not carry it and must not — losing the `225 DRUMMOND ST` / `TRAVEL INN HOTEL, 225-245 DRUMMOND ST` case ADR-028 exists to serve.
10. **Decide how the per-field spans combine — the default is wrong.** Span queries have no multi-field primitive, so "one per field" means three sibling clauses. Placed in the top-level `bool.should` their scores **sum across fields**, reinstating the P007-shape asymmetry ADR-025 exists to prevent and the in-code prohibition at lines 969-975 forbids. Wrapping the three `span_first` clauses in a `dis_max` with `tie_breaker` at its 0.0 default reproduces today's best_fields-max semantics exactly. Note the tension: ADR-025 rejected Option A partly for introducing `dis_max`/`tie_breaker` — though 0.0 is the degenerate value, not a tuned one, and is already the operative semantic.
11. **An ADR-028 amendment is required, and three pinned tests must be re-pointed rather than deleted.** `test/js/__tests__/address-service.test.mjs:250` (phrase_prefix fields include `sla_range_expanded`) and `:318` (no explicit `tie_breaker`) both break; `:286` (`bool_prefix` must NOT include `sla_range_expanded`) survives and must be retained. ADR-028 Reassessment Criterion 5 fires on the nose — it exists to stop the `tie_breaker=0.0` assertion being deleted, so deletion would make an accepted invariant unattributed.
12. **Justify the `top_terms_N` rewrite method, not just the value 128.** `top_terms_N` retains per-term scoring at the expanded position — an IDF contribution summed over a **per-shard** expansion set. That is P078's mechanism, re-admitted inside the new clause at the final position. Anchoring dominates it empirically (0/150), but it is not gone. The ADR must say whether a blended-frequency or constant-score span rewrite is available and why this one was chosen. For the value itself, measure invariance across 64/128/512 on **both** properties and find the N at which it breaks, so 128 is justified as headroom between an observed floor and the 1024 ceiling rather than as a magic number.
13. **Record the `maxClauseCount` availability consequence.** `indices.query.bool.max_clause_count` is cluster configuration; a self-hosted operator running a lowered value gets total request failure, not degraded ranking. This is a new failure class — `phrase_prefix` had an implicit expansion bound — and no gate currently covers it.
14. **Correct GitHub issue [#375](https://github.com/mountain-pass/addressr/issues/375) at release, and not before — by rewriting P007's `## Fix Released` section, which is the only mechanical path to the posted prose.** The issue is CLOSED, carrying a 2026-04-16 comment headed "Fix deployed — verified in production". That comment verified one address; the property fails for 62.7%. The reporter has believed this resolved since April, and this ticket has known otherwise since 2026-07-31. Maintainer direction 2026-08-07 is to correct it when the fix ships rather than now.

    `**Origin**: inbound-reported (#375)` was added to [P007](../known-error/007-search-scoring-exact-address-ranked-below-subunits.md) on 2026-08-07 so the ADR-024 lifecycle dispatch fires at the Known Error → Verifying transition rather than depending on memory. **That guarantees a comment fires; it does not guarantee the comment is the correction.** The dispatch generates reporter-facing prose from P007's `## Fix Released` section under a no-invention rule, and has no retract-a-prior-claim branch. Its default output is "the fix shipped, please verify", which landing beneath the April claim without retracting it reads as a second unverified claim from the same account — worse than the current silence. Neither the external-comms nor the voice-tone gate checks factual currency; the SKILL says so itself.

    So the retraction has to be **in** that section. At the transition, **replace** P007's `## Fix Released` (do not append beneath the falsified one, already marked historical on 2026-08-07) with text carrying: the April claim was wrong and why (verified on an instance, not the property); the measured 62.7%; the actual mechanism (per-shard `phrase_prefix` expansion-IDF, not the `bool_prefix` summation the April comment named); and a working link to ADR-025, whose file is now `.accepted.md` — the April comment's link points at `.proposed.md` and is dead.

    P007's `## Fix Strategy` section is also three revisions stale (it still recommends `dis_max`, which ADR-025 rejected) and Step 1 of the dispatch extracts it for known-error tickets. Mark it historical before the transition.

    **`CHANGELOG.md` carries the same false claim, on a more-read surface.** The 2.2.0 entry ends with a sentence claiming it fixes issue 375 and closes P007. Per architecture review 2026-08-07, do **not** edit that entry: a changelog entry is dated testimony about what a release claimed, and rewriting it would erase the evidence that 2.2.0 made the claim — which is a fact this ticket needs to stay legible. Issue the retraction as a **new forward entry** on the release that ships the fix, as an erratum. Derive it from the same text as the P007 `## Fix Released` replacement above so the two surfaces cannot drift.

    Note the urgency moved slightly on 2026-08-07: that entry's link was dead (`tompahoward/addressr` does not resolve) and was corrected to `mountain-pass`. A reader following it now lands on the CLOSED issue and its "verified in production" comment, where before they landed nowhere. The correction is net-right, but it made the false claim more reachable rather than less.

15. **Probe the multi-word-synonym position hazard.** ADR-041 records an accepted pre-existing position collision on shapes like `NORTH EAST`. Anchoring adds an `end=N` window on top of phrase position semantics, so a position-inflating index synonym can push terms **beyond** the window and fail where an unanchored phrase would still match later in the field. Unanchored `phrase_prefix` had no such exposure. Unmeasured.

## Fix Implemented — 2026-08-08

The keyword-prefix anchor from [ADR-043 — Keyword-prefix anchor for street-level-first ranking](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.proposed.md) is implemented in `src/build-search-body.js`. The `phrase_prefix` clause is replaced by a `dis_max` over `prefix` queries on the existing `sla.raw` / `ssla.raw` keyword subfields, uppercased, gated on the query having advanced past the street number.

**Measured against production `addressr6` after the change:**

| gate                                                              | result                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| street-level-first, **freshly drawn** 150-address national sample | **0 violations, 0.0%** — against the 60.0% baseline this ticket recorded                    |
| partial-prefix recall ladder, 182 probes over 60 targets          | net **0** (8 lost, 8 gained); sensitivity gate **PASS**                                     |
| the reported case, `8 WATERS RD, NEUTRAL BAY NSW 2089`            | the street-level record is now **#1**; previously it was absent from all 8 rows             |
| slash-notation tolerance, `14/2 PARKES ST`                        | unchanged — `UNIT 14, 2 PARKES ST, KIRRIBILLI NSW 2061` at #1 under both old and new bodies |

The recall ladder's sensitivity gate passing is what makes the net-0 figure evidence rather than a number: it aborts unless it first reproduces the four losses [P078](../open/078-phrase-prefix-scores-depend-on-shard-local-expansion-set.md) recorded for `max_expansions: 1`. The 8 losses are the already-tracked named probes, not a new population.

**What the fix costs, all recorded in ADR-043 rather than discovered later:**

- `sla_range_expanded` leaves the query entirely. It has no `.raw` subfield and is barred from `bool_prefix` by ADR-025, so the `phrase_prefix` clause was its only carrier. Query-side this makes ADR-028's outcome its own rejected Option D, which is why ADR-028 carries an amendment rather than a comment. Endpoint recall is unaffected — the tokenizer splits `103-107` into `103` and `107` regardless — but ADR-028's Cucumber endpoint scenarios are promoted from non-regression to load-bearing, because they are now the only instrument standing between this and a silent recall loss.
- The clause is analysis-blind, so it degrades to target-in-page rather than top-1 for synonym and punctuation variants. `bool_prefix` carries those.
- Being analysis-blind also means it _rescues_ any query that literally prefixes the stored SLA, regardless of what the analyzer did — which cost ADR-041's old-config control its sensitivity. That probe moved from `55 Pyrmont Bri` to `Pyrmont Bri`, which is not a literal prefix, so the anchor contributes nothing and the analysis defect is isolated again.

Not yet closed. That criterion — released and verified on the live endpoint — was satisfied on 2026-08-08 and is superseded by the closure rule in `## Fix Released` below: the remaining gate is **maintainer** confirmation, not my own live-endpoint measurement.

## Fix Released

Released in **3.0.8** on 2026-08-08. Awaiting user verification.

`/addresses?q=` now anchors on the start of the address using the existing `sla.raw` / `ssla.raw` keyword subfields, per [ADR-043 — Keyword-prefix anchor for street-level-first ranking](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.proposed.md). Commits `34e84c7` (the fix) and `6e3ab74` (changeset package name, which blocked the first release attempt).

**Confirmed on the live public API**, through the consumer path rather than against the index — the step the April v2.2.0 closure skipped, and the reason this ticket was re-opened as P074 in the first place. `https://backend.addressr.io/health` reports `3.0.8`:

| query                                   | first result                                            |
| --------------------------------------- | ------------------------------------------------------- |
| `8 WATERS RD, NEUTRAL BAY NSW 2089`     | `8 WATERS RD, NEUTRAL BAY NSW 2089` — the reported case |
| `108 GAZE RD, CHRISTMAS ISLAND OT 6798` | `108 GAZE RD, …` ahead of `96-108 GAZE RD, …` (P075)    |
| `14/2 Parkes St`                        | `UNIT 14, 2 PARKES ST, KIRRIBILLI NSW 2061`             |
| `Unit 14, 2 Parkes St`                  | same record — both notations hold (ADR-025)             |

Pre-release measurement against the production index, each on a separately drawn sample: street-level-first **0 of 150** against a 60.0%-of-120 baseline; partial-prefix recall net 0 across 182 probes over 60 targets with the sensitivity gate passing; 60 mistyped queries unchanged at 90% in page / 85% first.

**Fix Strategy prerequisite 14 is PARTIALLY discharged — one of three obligations, not all.**

- [x] **Reporter-facing correction posted.** [Comment 5223522329](https://github.com/mountain-pass/addressr/issues/375#issuecomment-5223522329) retracts the April "verified in production" claim and names the fixture-scale-versus-production gap as the reason it survived.
- [x] **P007's `## Fix Released` replaced**, not appended to. It carried the falsified April text, and the ADR-024 lifecycle dispatch reads that section verbatim under a no-invention rule — with the release condition now met, leaving it would have let a second false "verified" claim reach the reporter hours after the retraction.
- [ ] **CHANGELOG erratum — OUTSTANDING, and its window has closed.** Prerequisite 14 specifies a forward entry on the release that ships the fix, derived from the same text so the surfaces cannot drift. 3.0.8 shipped without it and its entry ends "Fixes issue #375", so **the corpus now carries two unretracted claims to have fixed #375** (2.2.0 and 3.0.8) rather than one. A CHANGELOG entry cannot be edited after publication, so this needs a home on the next release. Do not mark prerequisite 14 closed until it has one.

**This ticket does not close on the above.** Per **wr-itil ADR-022** (not this repo's ADR-022, which is Locality postcode from address details) it closes when the maintainer confirms the fix in production, not when it deploys and not on my own measurements. That distinction is the whole reason this ticket exists: the April closure was also a real measurement, correctly performed, on one address.

- [ ] **On close, promote [ADR-043](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.proposed.md) to `accepted` — but only with its other two conditions discharged too**, which that ADR names and this ticket must not lose: **Confirmation 4** (ADR-027's 14-query v2.3.0 baseline re-run against 3.0.8, not yet done) and **Confirmation 7** (latency re-baselined post-implementation; the published p50/p90 are pre-deploy candidate figures). It is held at `proposed` deliberately — DECISION-MANAGEMENT.md requires a positive production track record, which is the same evidence question this ticket is holding open, and promoting on self-measurement while refusing to close on self-measurement would apply two bars to one body of evidence.

## Dependencies

- **Blocks**: (none) — this is pre-existing production behaviour, not a migration blocker.
- **Blocked by**: (none)
- **Composes with**: P007 (the original defect, believed fixed by ADR-025), P073 (a narrower instance of the same invariant failing, on an address where it previously held).

## Related

- **ADR-025** — the decision whose Decision Driver 1 this violates, and whose mechanism needs re-examining.
- **P007** / issue [#375](https://github.com/mountain-pass/addressr/issues/375) — the original customer report.
- **P073** — surfaced this; its blast-radius measurement is what exposed the 50%.
- `docs/problems/026-baseline-v2.3.0.md` — the SSLA-14 baseline that passes while the property is half-violated.
