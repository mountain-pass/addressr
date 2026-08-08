---
status: 'accepted'
date: 2026-07-29
accepted-date: 2026-08-02
human-oversight: confirmed
oversight-date: 2026-07-29
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-10-29
---

# Equivalent synonyms with a synonym-free search analyzer

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context, then corrected after architecture review caught a factual error in the authority-table directions. Human-ratified 2026-07-29. Promoted to `accepted` on 2026-08-02: the stated condition (`status: proposed` until the fix is verified in production) is met. The blue/green cutover landed in commit `33e6c04` and the goal condition is confirmed on the live endpoint: `55 Pyrmont Bri` returns 4 results with the target at #1 (previously 0), `55 Harris S` returns 8 (previously 0), and the control `55 Pyrmont` is unchanged.

## Context and Problem Statement

`my_synonym_filter` (`client/elasticsearch.js`) is built by `buildSynonyms` from the G-NAF authority tables as explicit `CODE => NAME` mappings, which **replace** the left side with the right. The four tables do not agree on which side is the abbreviation — verified against the May 2026 tables:

| Table                      | Direction                             | Example                         |
| -------------------------- | ------------------------------------- | ------------------------------- |
| `STREET_TYPE` (194 pairs)  | CODE = full word, NAME = abbreviation | `BRIDGE\|BDGE`, `AIRWALK\|AWLK` |
| `STREET_SUFFIX` (18 pairs) | CODE = abbreviation, NAME = full word | `S\|SOUTH`, `DE\|DEVIATION`     |
| `FLAT_TYPE` (40 pairs)     | CODE = abbreviation, NAME = full word | `APT\|APARTMENT`                |
| `LEVEL_TYPE` (16 pairs)    | CODE = abbreviation, NAME = full word | `LG\|LOWER GROUND FLOOR`        |

The filter is attached as `analyzer` with no `search_analyzer`, so it runs at **both index and search time**. For `STREET_TYPE` that means full words are replaced by abbreviations: `55 PYRMONT BRIDGE RD, PYRMONT NSW 2009` indexes as `[55, PYRMONT, BDGE, RD, PYRMONT, NSW, 2009]` — the token `BRIDGE` is never in the index at all.

`match_bool_prefix` makes the final query token a prefix query. A _partial_ token is not a complete synonym code, so it is never rewritten — but the indexed token may have been. Two mechanisms:

- **Partial prefix of a word the index abbreviated.** `55 Pyrmont Bri` analyses to `[55, PYRMONT, BRI]`; `BRI*` cannot match the indexed `BDGE`. This requires the index to hold the abbreviation, so it is confined to the **194 `STREET_TYPE` pairs**. The other three tables index the full word, so a partial of the full word reaches it normally.
- **Partial that is itself a code.** `55 Harris S` analyses to `[55, HARRIS, SOUTH]`; `SOUTH*` cannot match the indexed `ST`. This needs the typed prefix to exactly equal a code, so it reaches any table with short codes — the 18 street suffixes demonstrably, and single-letter or two-letter flat/level codes by the same mechanism.

An earlier draft of this record claimed all four tables ran full-to-abbreviation and put the blast radius at 194 + 40 + 16 + 18. That was wrong — it generalised from two tables. The corrected demonstrated failure set is the 194 street types plus the 18 street suffixes, and the index-growth estimate below is derived from the smaller set.

This is P069, reported externally as issue #365. It breaks autocomplete mid-keystroke on the revenue-generating `/addresses?q=` endpoint — the primary product use case. Confirmed by local reproduction on OpenSearch 3.5.0 (the production engine version) using the exact index settings and the real 268-pair synonym list (all four tables; 268 is the correct pair count, and only its use as a blast radius was wrong); `_analyze` is the decisive evidence.

## Decision Drivers

- Autocomplete is the primary product use case; a query going blank part-way through typing is a direct product failure, not a ranking nuance.
- The defect is inbound-reported and externally visible (#365), so it carries reporter-facing credibility cost.
- The target token must **physically exist** in the index for a prefix query to reach it — this rules out every query-side-only remedy.
- Street-type equivalence (`ST`/`STREET`, `RD`/`ROAD`) is a genuine recall feature and must survive the fix.
- Mappings are additive-only for new documents, so any analyzer change forces a reindex; the cost of getting this wrong is a second reindex.

## Considered Options

1. **Equivalent synonyms plus a synonym-free `search_analyzer` (chosen)** — index both forms at the same position, and never rewrite the query.
2. **`search_analyzer` alone, synonyms unchanged** — stop rewriting the query but keep directional index-time replacement.
3. **Reverse the mapping direction (`NAME => CODE`)** — abbreviate in the other direction.
4. **Drop the synonym filter entirely** — no street-type equivalence at all.
5. **Query-side tuning only** (`bool_prefix` parameters, `minimum_should_match`) — leave analysis untouched.

## Decision Outcome

Chosen option: **"Equivalent synonyms plus a synonym-free `search_analyzer`"**.

Emit synonyms as equivalents (`BRIDGE, BDGE`) rather than directional replacements (`BRIDGE => BDGE`), so both forms occupy the same position in the index; and add a `search_analyzer` identical to `my_analyzer` minus `my_synonym_filter`, so a partial query token is never rewritten.

This is the only option that puts the token a user actually types into the index while preserving abbreviation equivalence. Validated locally: every keystroke from `55 Pyrmont` through `55 Pyrmont Bridge Road` resolves, as do `55 Harris S` / `St` / `Street`, and both `Rd` and `Road` work.

**The strongest argument is direction-agnosticism.** Every rejected option depends on knowing which side of a `CODE|NAME` pair is the abbreviation — and the four G-NAF tables disagree, which is precisely the confusion that produced the wrong Context in this record's first draft. Equivalents make the direction irrelevant: both tokens are indexed regardless of which column holds which. That also discharges this ADR's own reassessment criterion about the CODE/NAME direction ceasing to be stable, because the decision no longer depends on it.

**Multi-word synonym members need explicit handling.** Twelve pairs have a multi-word side (`RIGHT OF WAY|ROFW`, `NE|NORTH EAST`, `ATM|AUTOMATED TELLER MACHINE`, `LG|LOWER GROUND FLOOR`, …). `my_synonym_filter` is `type: synonym`, not `synonym_graph`, and under this decision it becomes index-time-only — so a multi-token alternative stacks at a single position, the classic Lucene multi-word-synonym position hazard. `synonym_graph` is not available as a substitute: it is search-analyzer-only, and this decision removes synonyms from the search analyzer entirely. The chosen handling is recorded in the Multi-Word Members section below.

**Scope — all of the following, or the fix is asymmetric:**

- `sla`, `ssla` **and** `sla_range_expanded`. `search_analyzer` is per-field; if a queried field is missed, the clause targeting it (inherited from the superseded ADR-026) keeps synonym-rewriting at search time and breaks differently from the `bool_prefix` clause.
- `initLocalityIndex`, which carries its own duplicated settings block. Missing it falsifies ADR-021's "same analyzer pipeline as address search" confirmation criterion.

## Multi-Word Members

Twelve pairs carry a multi-word side. All are emitted as **equivalents**, the same as every other pair — no special case.

The alternatives were worse. Retaining the directional form for multi-word pairs keeps index positions clean but manufactures a fresh P069-shaped defect: with no synonyms in the search analyzer, a query for `LG` or `NE` would no longer be rewritten while the index held only `LOWER GROUND FLOOR` / `NORTH EAST`, so those queries would stop matching entirely. Dropping the pairs loses `ROFW`↔`RIGHT OF WAY` equivalence silently.

The position hazard is accepted **because it is pre-existing, not introduced** — measured, not assumed.

Indexing `12 SMITH ST NE, DARWIN NT 0800` under equivalents yields:

```
pos=3 'NE'      pos=3 'NORTH'
pos=4 'DARWIN'  pos=4 'EAST'
```

`EAST` collides with `DARWIN`, so the `phrase_prefix` query `North Darwin` falsely matches that address. **(Amended 2026-08-08: [ADR 043](043-keyword-prefix-anchor-for-street-level-first-ranking.accepted.md) made this LATENT rather than live — the `phrase_prefix` clause is gone and its keyword-prefix replacement is position-blind, so no production clause consults positions. The index-time collision is unchanged; only its query-side manifestation is dormant.)** **The same false positive occurs under the current directional config**, because `NE => NORTH EAST` stacks the multi-token side identically. Measured on OpenSearch 3.5.0: `North Darwin` returns 1 hit against both the equivalent-form index and the directional-form control.

So the expected test outcome is a **documented pre-existing limitation, not a passing assertion** — tagged the way ADR-027 tags `@known-regression-adr-027`. The test's job is to pin the behaviour so a future analysis change cannot worsen it unnoticed; it is not a claim that multi-word phrase matching is correct. Fixing it is out of scope here and would need `synonym_graph`, which this decision forecloses by removing synonyms from the search analyzer.

Recall is unaffected: `12 Smith St NE`, `12 Smith St North East` and the partial `12 Smith St Nor` all return both the `NE` and the spelled-out address.

## Stale-Index Handling

`initIndex` **fails loud** when it meets an index whose analysis config predates this decision, naming both supported migration routes. It does not attempt the close / putSettings / putMapping path.

This is not a precaution — the in-place path was measured on OpenSearch 3.5.0 and it silently half-migrates:

| Step                                                                   | Result         |
| ---------------------------------------------------------------------- | -------------- |
| `indices.close`                                                        | `acknowledged` |
| `indices.putSettings` (adds `my_search_analyzer`, equivalent synonyms) | `acknowledged` |
| `indices.putMapping` (adds `search_analyzer` to an existing field)     | `acknowledged` |
| `indices.open`                                                         | `acknowledged` |
| `55 Pyrmont Bri` against the migrated index                            | **0 hits**     |

Every call succeeds. The index then advertises the corrected configuration while its documents still carry postings produced by the old analyzer, so the defect is still live — and `indexConfigMatches` now returns true, permanently fast-pathing past any further attempt. A false green that survives restarts is strictly worse than an error.

Detection is via an analysis-config version stamped into the mapping's `_meta`, **not** inferred from `indexConfigMatches`. That predicate is deliberately conservative and returns false for benign drift; conflating "differs" with "requires reindex" would turn every innocuous diff into a hard abort.

**The stamp is derived over analysis _structure_, deliberately excluding synonym list _contents_.** It covers the filter types, the `my_analyzer` and `my_search_analyzer` filter chains, and a marker for the synonym **form** (equivalent vs directional). It must not hash the synonym entries themselves: `buildSynonyms` rebuilds that list from the G-NAF authority tables on every load, so a quarterly refresh that adds a single new street type would change a contents-based hash and hard-abort the automated ADR-034 job. Nor can it be a hand-incremented literal — a future analysis change that forgets to bump it silently re-opens the P069 class through the benign-drift close/putSettings/putMapping branch this decision keeps alive. The structure-not-contents distinction is the whole point of the stamp and is not the implementer's to reinterpret.

**`initLocalityIndex` is exempt from fail-loud, and the exemption is conditional.** It runs the same close/putSettings/putMapping/open dance unconditionally, with no `indexConfigMatches` fast-path, so it would half-migrate identically — except the loader rewrites _every_ locality document immediately afterwards, so its postings self-heal on the next load. The exemption depends entirely on that full rewrite continuing to exist. If the locality load ever becomes incremental, this exemption must be revisited or the defect silently re-opens on that index.

Two migration routes are supported and both are documented:

1. **Blue/green** (the production path, ratified per ADR-029) — build a second domain, warm it, gate on parity, cut over.
2. **In-place via `_reindex`** — `_source` is stored and load-bearing (`service/address-service.js:1820` reads it per request), so OpenSearch can re-read every document and re-analyse it into a new index server-side. No G-NAF download, no PSV parsing, no documents crossing the network from a client. Operators running multiple instances behind a load balancer roll onto the new index with no outage, helped by the P067 graceful-shutdown drain; a single instance takes one restart. A literal-zero-outage single-instance variant needs read-alias indirection and is deliberately deferred, because it requires splitting the read target from the write/admin target and repointing the quarterly loader crons — which today resolve the default index name and would `indices.close()` a live aliased index.

Self-hosted operators get a real choice and a fast path. Nobody gets a silent half-migration.

## Consequences

### Good

- Partial-prefix recall is restored across the whole street-type/flat/level/suffix vocabulary, not just the two reported queries.
- Both spellings work in both directions: typing `Road` finds `RD` and typing `Rd` finds `ROAD`.
- Query-side analysis does one fewer token-filter pass over roughly 3-8 tokens, order 1-10 microseconds per query (no data — worst-case assumption). This is **not** a net performance claim, but it is small either way: the index-growth side it was thought to be outweighed by measured at +0.59% on 2026-07-31 (see Neutral, below). Postings for the street-type and suffix vocabulary do roughly double, but that vocabulary is a closed 268-pair set against a high-cardinality corpus, so the effect on a page-cache-bound domain is a bounded linear delta rather than the bimodal cliff this bullet originally assumed.

### Neutral

- ~~Index size grows roughly 15–25% on the affected text fields.~~ **Measured 2026-07-31 on the green build: growth is +0.59%, and the 15–25% estimate was wrong by a factor of 25–40×.** Primary store is 5,864,296,016 bytes on v3 against 5,898,944,630 on v4 — a delta of ~34.6 MB — compared like with like (`pri.store.size_in_bytes`, both indices at 5 shards / 1 replica, document counts at exact parity).

  The estimate failed by a category slip, and naming the mechanism matters more than recording the miss, because the wrong figure would otherwise stand as a sizing input for the next migration. The claim that "postings for the street-type and suffix vocabulary roughly double" is correct and survives. Converting that into a proportional share of total index size does not follow from it: the change writes roughly one extra co-positioned token per document, and those postings are dense and low-cardinality — the cheapest shape Lucene has, block-packed delta-encoded docids at well under a bit per doc plus one position and freq entry, order 1–2 bytes per document. The measurement corroborates the mechanism directly: 34,648,614 bytes over 16,905,824 documents is **2.05 bytes per document**, just above the predicted band. Total index size is dominated by high-cardinality street names, numbers and localities whose term-dictionary overhead swamps a closed 268-pair authority vocabulary entirely.

  Recorded as a **falsification in the unexpected direction**: the reassessment criterion below was written for growth that materially _exceeds_ the estimate, but materially undershooting it carries the same obligation to amend, since the number feeds sizing decisions either way. That criterion is re-based accordingly rather than left keyed to a retired figure.

### Bad

- **Address loads are incremental, so index-time expansion only reaches documents that are written.** A quarterly refresh adding a new street type updates the settings but leaves already-indexed documents un-re-analysed, so the new equivalence applies only to changed docs until a full rebuild. This limitation pre-dates the decision, but the decision makes index-time expansion the entire mechanism, so it is now load-bearing.

- **Forces a full reindex of 16,905,824 documents** (estimated at "~15M" when this was authored; the figure is now measured, and identical on both domains). The analysis change cannot be applied by mutating an existing index's settings — documents must be re-analysed, whether by a blue/green rebuild or a same-cluster `_reindex` (see Stale-Index Handling). Domain-level blue/green per ADR-029 and the OpenSearch migration playbook has been ratified as the cutover mechanism, chosen over an index-alias flip and an `ES_INDEX_NAME` env flip.
- **Alters term statistics.** Two tokens sharing a position changes IDF and field-length norms, so relevance must be re-verified rather than assumed. ADR-025's and ADR-028's confirmation scenarios are at risk.
- **Amends ADR-027.** `RD` becomes indexed as both `ROAD` and `RD`, so `AUTO:5,8` now sees a 4-character `ROAD` alongside `RD` and the fuzziness/synonym interaction changes shape. No enumerated ADR-027 criterion fired — criterion 3 is conjunctive and neither conjunct holds, since P069 is a recall failure rather than a ranking inversion and `AUTO:5,8` is neither its cause nor its cure. The trigger is substrate-driven: this decision changes the analysis chain that tuning sits on. ADR-027's `reassessment-date` had independently lapsed on 2026-07-19 and is pushed to 2026-10-29, and a sixth criterion covering analysis-chain changes is added there.

## Confirmation

- A behavioural regression test encoding the **property** that a longer valid prefix returns a superset of the shorter prefix's results, across several street types and at least one directional suffix — failing against the old config and passing against the new.
- The ADR-029 pre-cutover gate green against the new index: the SSLA-14 ranking baseline, full Cucumber `test:nogeo` and `test:geo`, and the k6 pair.
- `55 Pyrmont Bri` returns `55 PYRMONT BRIDGE RD, PYRMONT NSW 2009` and `55 Harris S` returns `55 HARRIS ST, PYRMONT NSW 2009`, both from production.
- `_analyze` on the new index shows `BRIDGE` and `BDGE` at the same position for the indexed document, and an unrewritten `BRI` for the query.
- A `phrase_prefix` assertion on a multi-word suffix address (`NORTH EAST`) pinning the position-collision behaviour as a **known limitation** **(amended 2026-08-08 by ADR 043: production no longer ships a `phrase_prefix` clause, so this is retained as an analysis-chain probe rather than a pin on a live production hazard — a green here is not ranking evidence)**, tagged so it is not mistaken for a passing correctness claim, together with the directional-config control showing the same result.
- ADR-028's mid-range false-positive scenario re-run against the new analysis config and still holding.
- The integration test runs on **both** CI engine legs (2.19.5 and 3.5.0), in its own script outside `test:js` so it never silently skips inside `pre-commit`; it skips only when the port is unreachable **and** `CI` is unset, and fails when `CI` is set.
- `initIndex` aborts with a remediation message naming both migration routes when the `_meta` analysis-structure stamp does not match, and does **not** attempt close/putSettings/putMapping.
- Unit assertions against the exported builders confirm `sla`, `ssla` and `sla_range_expanded` all carry both `analyzer` and `search_analyzer`, replacing the source-inspection regex in `test/js/__tests__/elasticsearch.test.mjs`.
- `initLocalityIndex`'s duplicated settings block defines the equivalent-form synonyms and `my_search_analyzer`, and its `locality_name` field carries both `analyzer` and `search_analyzer` — asserted against the exported builder in the same way as the `sla` / `ssla` / `sla_range_expanded` bullet. Without this the locality index can be silently left unmigrated: the locality Cucumber suite has three search scenarios (`ISLAND`, `DR`, an empty case) and all three pass under either synonym form, so no other gate item would catch it and P069 would remain live on locality autocomplete.
- The k6 pass condition is re-derived from a blue-side baseline measured immediately before this cutover. The inherited 1443 ms threshold is **not** used: it descends from the retired v1 961.64 ms baseline, whereas ADR-029 measured 219 ms green at cutover and ADR-035 measured 368 ms p95 on the 3.5 domain, so the inherited band carries roughly 4-6.6× slack and could not fail.
- The green index's on-disk size and resident hot-set are measured against the ADR-029 steady-state budget (`m6g.large.search` × 2, 20 GB gp3) **before** cutover, as a gate rather than a note. ADR-029's 2026-07-09 finding is that this domain is I/O and page-cache bound rather than compute bound: a hot-set exceeding RAM took p90 from 1,156 ms to 2,753 ms and still climbing while the comparison held near 200 ms.

  **On-disk size: discharged 2026-07-31.** The measured growth is +0.59% (~34.6 MB), not the estimated 15–25%. This gate's stated worry was that per-node page-cache headroom would fall from roughly 3 GB to 1.75 GB — a fall that was _entirely_ a consequence of the growth estimate. The growth did not happen, so the headroom does not fall, so the cliff this half was written to catch is retired. Disk was never the binding constraint: at ~5.9 GB per node against the 20 GB volume it sits near 29.5%, essentially unmoved.

  **Resident hot-set: NOT discharged by size-identity, and deliberately restated as a soak-observed criterion.** Hot-set is the resident working set under real query distribution, which is not the same quantity as index size. This decision changes _which_ postings queries touch even at constant total size: v4 must page in the dense `ROAD`/`BRIDGE`-class posting lists that v3's index never contained. Composition shifts even when the total does not. The same arithmetic that killed the growth estimate bounds this at ~20–40 MB of new resident data against ~3 GB of headroom — 0.7–1.3% — so the risk moves from a bimodal cliff to a bounded linear delta well inside budget. But bounded is not measured, and discharging by inference from index size would be the weaker evidence when a stronger instrument is already running: the ADR-031 read-shadow soak mirrors the real production query distribution onto green, which is a direct measurement of the resident hot-set under the actual workload.

  Still **before** cutover, by construction — ADR-031's soak gate precedes ADR-029 step 7. Discharged when all three hold, each naming an instrument that already exists rather than a quantity someone must invent at discharge time:

  1. v4 `SearchLatency` p90 satisfies ADR-031 soak criterion 3 — the warmth asymptote. Note criterion 3 was **corrected 2026-08-01** to compare the v4/v3 p90 **ratio** rather than v4's absolute p90, because absolute p90 tracks query volume and collapsed across a diurnal trough. Read the current ADR-031 text; do not rely on this summary.
  2. v4 p90 lands within 1.5× of v3's **concurrent** p90 on the v3-vs-v4 search-parity dashboard. This is a **level** guard, and it survives the 2026-08-01 correction even though its original justification did not. That justification said criterion 3 was self-relative; since the correction it is a target-vs-primary ratio, so it is not. The guard is still required because a ratio can be **flat but bad** — convergence at a poor level satisfies criterion 3 while leaving the target materially slower, which is close to what the `t3.small` did in July.
  3. v4 `ReadThroughput` is not sustained above v3's across the business-hours peak that ADR-031 soak criterion 4 requires. This is the honest proxy for page-cache pressure — AWS OpenSearch emits no page-cache metric, and sustained disk reads are the exact observable ADR-029's 2026-07-09 I/O-bound diagnosis rested on, where CPU and JVM both ran _lower_ than the comparison at equal query rate so the cost had to be disk.

## Pros and Cons of the Options

### Equivalent synonyms plus a synonym-free `search_analyzer` (chosen)

- Good, because the token the user types is physically present in the index, which is the only thing that lets a prefix query reach it.
- Good, because equivalence is preserved in both directions.
- Bad, because it forces a full reindex and perturbs term statistics.

### `search_analyzer` alone, synonyms unchanged

- Good, because it is a settings-only change (close/open), no reindex.
- Bad, because it is **strictly worse**: the query would then yield `BRIDGE` against an index holding only `BDGE`, so full-word queries break too.

### Reverse the mapping direction (`NAME => CODE`)

- Good, because it is a one-line change to `buildSynonyms`.
- Bad, because it is still a _replacement_, so it only moves which half of the query shape breaks.

### Drop the synonym filter entirely

- Good, because partial tokens are then never rewritten.
- Bad, because it loses `ST`/`STREET` and `RD`/`ROAD` equivalence, which is real recall the product depends on.

### Query-side tuning only

- Good, because it needs no reindex.
- Bad, because it cannot work — the target token is absent from the index, so no query formulation can reach it.

## Reassessment Criteria

- ~~The measured index-size growth materially exceeds the 15–25% estimate and forces an instance-class change that is not cost-justified.~~ **Re-based 2026-07-31.** A future reindex's measured index-size growth departs materially in _either_ direction from the +0.59% measured on the v4 green build, or the resident hot-set delta consumes a material fraction of per-node page-cache capacity. Undershoot triggers reassessment as squarely as overshoot: the figure feeds sizing decisions either way, and this criterion's first firing was an undershoot. Left keyed to the retired 15–25% estimate it could not have fired correctly in either direction, since a +0.59% delta cannot force an instance-class change.
- The post-cutover relevance gate shows a regression that cannot be recovered by tuning, indicating the co-positioned-token term statistics are not workable.
- ~~G-NAF changes the authority-table schema such that CODE/NAME direction is no longer stable.~~ **Discharged at authoring**: equivalents are direction-agnostic, so this decision does not depend on the direction being stable.
- OpenSearch gains a first-class mechanism for prefix-matching across synonym expansions, making the dual-form index redundant.

## Related

- **P069** — the driving problem; inbound-reported as mountain-pass/addressr#365.
- **ADR-029** — two-phase blue/green; the ratified cutover mechanism for the reindex this forces.
- **ADR-027** — amended by this decision; its reassessment date was lapsed and has been pushed to 2026-10-29 on that record.
- **ADR-021** — same-analyzer-pipeline criterion; requires `initLocalityIndex` to receive the identical change.
- **ADR-025** and **ADR-028** — relevance and range-expansion decisions whose confirmation scenarios must be re-verified pre-cutover.
- **ADR-026** (superseded by ADR-028) — lineage only, for the origin of the `phrase_prefix` clause. Its mid-range recall cases were found to be false positives and removed under ADR-028, so those carry nothing to re-verify; its still-live assertions, notably the `tie_breaker=0.0` pin, were carried forward onto ADR-028, which is on the list above.
- **ADR-034** (GHA-OIDC quarterly refresh) — load-bearing on the `_meta` stamp derivation: a contents-based hash would hard-abort this automated job whenever G-NAF adds a street type, which is why the stamp covers structure only.
- **ADR-035** — its own regression watch-items name this exact surface (the `my_analyzer` synonym filter, `match_bool_prefix`, `AUTO:5,8`).
- `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` — the blue/green sequence this reindex follows.
