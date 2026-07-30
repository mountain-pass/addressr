# Problem 069: Partial-prefix search drops results a shorter query returns

**Status**: Known Error
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

Widened 2026-07-29: the failing class is any query shaped `<number> <word> <partial-token>`, not just the reporter's street. `55 Harris S` also returns zero despite `55 HARRIS ST, PYRMONT NSW 2009` being indexed. This is the shape a user produces mid-keystroke in an autocomplete field, so the practical effect is that autocomplete goes blank part-way through typing a numbered street address and recovers only on the last character of the street name.

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

### Prior hypothesis — DISPROVED 2026-07-29

The earlier hypothesis was that the query is not built with `match_bool_prefix`, so the final incomplete token is matched as a complete term. **That is wrong.** `service/address-service.js:960` already uses `type: 'bool_prefix'` (with a second `phrase_prefix` clause at `:970`), and prefix matching demonstrably works: `Pyrmont Bri` returns 8 results, all `BRIDGEVIEW` matches, so `Bri` is being prefix-expanded correctly. Do not spend time re-checking the query type.

### Confirmed behaviour (live prod probes via the MCP client, 2026-07-29, v3.0.4)

| query            | results | note                                                              |
| ---------------- | ------: | ----------------------------------------------------------------- |
| `55 Pyrmont`     |       8 | `55 PYRMONT BRIDGE RD` 2nd, score 12.507814                       |
| `Pyrmont Bri`    |       8 | prefix matching works — `Bri` → `BRIDGEVIEW`                      |
| `55 Pyrmont Bri` |   **0** | the reporter's case                                               |
| `55 Harris S`    |   **0** | different street, same shape — `55 HARRIS ST` demonstrably exists |

**The defect is much broader than "street-name-prefix recall".** `55 Harris S` returning zero shows the failing class is the general shape `<number> <word> <partial-token>` — which is precisely what a user types into an autocomplete box mid-keystroke. Every partial third token following a number returns an empty result set. `Pyrmont Bri` (no leading number) works, so the leading numeric token is implicated in the interaction, not the prefix machinery on its own.

### CONFIRMED ROOT CAUSE (reproduced locally 2026-07-29, OpenSearch 3.5.0)

`my_synonym_filter` rewrites full street-type words to their **abbreviations**, and it runs at **both index and search time** (`client/elasticsearch.js:96-115` sets `analyzer` with no `search_analyzer`). `buildSynonyms` emits `CODE => NAME` pairs, and in the G-NAF authority tables the CODE is the full word and the NAME is the abbreviation:

```
BRIDGE|BDGE|BDGE
STREET|ST|ST
ROAD|RD|RD
S|SOUTH|SOUTH        (STREET_SUFFIX — the one pair that runs the other way)
```

So `55 PYRMONT BRIDGE RD, PYRMONT NSW 2009` **indexes as** `[55, PYRMONT, BDGE, RD, PYRMONT, NSW, 2009]`. The token `BRIDGE` is not in the index at all.

`match_bool_prefix` makes the final query token a prefix query. A _partial_ token is not a complete synonym code, so it is never rewritten — but the indexed token was. The two can then never meet:

- **Mechanism 1 — partial prefix of an abbreviated word.** Query `55 Pyrmont Bri` analyses to `[55, PYRMONT, BRI]`. `BRI*` cannot match the indexed `BDGE`. This is the reporter's exact case. It requires the index to hold the abbreviation, so it is confined to the **194 `STREET_TYPE` pairs**. Corrected 2026-07-29: an earlier draft claimed all four authority tables ran full-to-abbreviation and put the count at 268. Only `STREET_TYPE` does; `STREET_SUFFIX`, `FLAT_TYPE` and `LEVEL_TYPE` run the other way and index the full word, so a partial of the full word reaches them normally. See ADR-041 Context for the per-table directions.
- **Mechanism 2 — partial that is itself a code.** Query `55 Harris S` analyses to `[55, HARRIS, SOUTH]`, because `S => SOUTH` is a real street suffix. `SOUTH*` cannot match the indexed `ST`.

This also explains the otherwise-odd `Pyrmont Bri` result: it returned `BRIDGEVIEW` docs (a building name, not a street type, so never abbreviated) but never `PYRMONT BRIDGE RD`. Consistent with the mechanism, and it was the clue that the prefix machinery itself was fine.

### Reproduction (local, no prod access needed)

Confirmed against `opensearchproject/opensearch:3.5.0` — the same engine version as prod — using the exact index settings from `client/elasticsearch.js`, the real synonym list built from the May 2026 G-NAF authority tables (268 pairs), and three documents. Every prod observation reproduces:

| query               | local |                        prod |
| ------------------- | ----: | --------------------------: |
| `55 Pyrmont`        |  hits |                           8 |
| `Pyrmont Bri`       |     0 | 8, none of them `BRIDGE RD` |
| `55 Pyrmont Bri`    |     0 |                           0 |
| `55 Pyrmont Bridge` |  hits |                           4 |
| `55 Harris S`       |     0 |                           0 |

The decisive evidence is `_analyze`: the doc yields `BDGE` where the query yields `BRI`.

### Fix direction — validated locally, now implemented (see Fix Strategy)

Index **both** forms at the same position and stop rewriting the query:

1. Emit synonyms as **equivalents** (`BRIDGE, BDGE`) rather than directional replacements (`BRIDGE => BDGE`), so the index holds both tokens at the same position.
2. Add a `search_analyzer` identical to `my_analyzer` **minus** `my_synonym_filter`, so a partial token is never rewritten.

With both applied, every keystroke resolves — verified locally:

`55 Pyrmont` → `55 Pyrmont B` → `55 Pyrmont Bri` → `55 Pyrmont Bridge` → `55 Pyrmont Bridge Rd` → `55 Pyrmont Bridge Road` all return the target, and `55 Harris S` / `St` / `Street` all return `55 HARRIS ST`.

**This requires a full reindex.** Analyzer and mapping changes cannot be applied to an existing index in place, so shipping it means rebuilding ~15M documents. Per ADR-029 that should go blue/green with a rollback path rather than in place — see [[feedback_zero_outage_search_upgrades]]. That, not the code change, is the bulk of the remaining effort; the config change itself is small.

Worth checking during implementation: whether indexing both forms shifts relevance scores (two tokens at one position changes term statistics), and whether the `sla_range_expanded` field needs the same treatment.

### Superseded investigation notes

The target doc is a plain address (`55 PYRMONT BRIDGE RD, PYRMONT NSW 2009`), not a range-numbered one, so the ADR-026 `sla_range_expanded` path is **not** involved — that field is absent on non-range docs and only appears in the `phrase_prefix` clause.

Both `should` clauses fail simultaneously, which is the surprising part: on a naive reading each should match. `55 HARRIS ST` analyses to `[55, HARRIS, ST]`, so `term(55) AND term(HARRIS) AND prefix(S)` ought to hit, and the `phrase_prefix` clause ought to hit too. Something in analysis is making both miss.

The prime suspect is the custom analyzer at `client/elasticsearch.js:68-77`: `my_analyzer` = `whitecomma` tokenizer + `uppercase`, `asciifolding`, `my_synonym_filter`, `comma_stripper`, `trim`, applied at **both index and search time** (no separate `search_analyzer`). Two specific things to test with `_analyze`:

- The `synonym` filter (not `synonym_graph`) runs at search time on a query whose final token is a partial word. Synonym filters emit tokens at the same position, and `match_bool_prefix` selects the last token _by position_ for its prefix clause — a plausible mechanism for the prefix clause being built against the wrong token.
- `uppercase` runs BEFORE `my_synonym_filter` in the chain. If the supplied synonym list is lowercase, no synonym ever matches, which is a separate latent defect worth confirming while in there.

Next concrete step needs backend access this session did not have (prod is SigV4/OIDC, ADR-034/035):

- `POST /<index>/_analyze` with `my_analyzer` on `"55 Harris S"` and on `"55 HARRIS ST, PYRMONT NSW 2009"`, and compare token streams and positions.
- `GET /<index>/_validate/query?explain=true` and `_search?explain=true` with the exact body `searchForAddress` builds, to see the rewritten Lucene query for the failing case.

### Investigation Tasks

- [x] Reproduce against live/prod search — done 2026-07-29 via the MCP client against v3.0.4; table above. Confirmed the reporter's case and found the wider class.
- [x] Rule out the query-construction hypothesis — the query already uses `bool_prefix`; prefix expansion works (`Pyrmont Bri`).
- [x] Run `_analyze` on the failing query and the target doc and compare token streams — decisive: doc yields `BDGE`, query yields `BRI`.
- [x] Confirm the synonym-filter interaction with `match_bool_prefix` — confirmed; search-time abbreviation rewriting is the root cause.
- [x] Reproduce locally against OpenSearch 3.5.0 with the real 268-pair synonym list — every prod observation reproduces.
- [x] Validate a fix direction — equivalent synonyms plus a synonym-free `search_analyzer`; every keystroke resolves.
- [x] Implement the analyzer/mapping change — landed in `1084ce7`, with the extraction into `src/init-index-config.js` so the config is testable in raw Node ESM.
- [x] Add a behavioural regression test for the "longer prefix ⊇ shorter prefix" property — `test/integration/search-analysis.test.mjs`, 6 tests against a real engine on both CI legs, including a control asserting the OLD config still fails so the suite provably discriminates.
- [ ] Plan and execute the reindex blue/green per ADR-029, with a rollback path.
- [ ] Re-check relevance scoring after the change — two tokens at one position alters term statistics.
- [x] Decide whether `sla_range_expanded` needs the same `search_analyzer` treatment — yes, necessarily. `search_analyzer` is per-field, so missing it would leave the ADR-028 phrase_prefix clause rewriting the query while the bool_prefix clause does not. Applied, and asserted in `test/js/__tests__/elasticsearch.test.mjs`.

## Fix Strategy

Recorded and human-ratified as **[ADR-041](../../decisions/041-equivalent-synonyms-with-synonym-free-search-analyzer.proposed.md)**: emit synonyms as equivalents rather than directional replacements so both forms share an index position, and add a `search_analyzer` without the synonym filter so a partial query token is never rewritten.

**Implemented and merged to master, deliberately unreleased:**

| Commit    | What                                                                                                                                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1084ce7` | The fix. Analysis config and synonym building extracted to `src/init-index-config.js` (clean ESM, P033); equivalents + `search_analyzer`; `initIndex` fail-loud stale-index guard; source-inspection regex replaced with 13 builder assertions; new integration suite on both CI engine legs. |
| `775a9ee` | Regression fix — the extraction had dropped seven keyword fields from the locality mapping, breaking `/postcodes`. Caught by Cucumber in CI.                                                                                                                                                  |

**No changeset, on purpose.** The analyzer change only takes effect on re-analysed documents, and the fail-loud guard means any deployment still on a pre-ADR-041 index gets a hard loader abort on its next run. Publishing must therefore _follow_ the reindex, not lead it. The quarterly `update-*.yml` crons run the loader from a master checkout, so they will abort on their next firing until the reindex lands — loud and non-destructive, and remediated by the migration itself.

**Remaining work is a production operation, not code.** Per ADR-029 and the user's ratified choice of domain-level blue/green: provision the blue domain, load with `replicas=0` and the doc-count alarm armed first, validate doc count and geo, measure parity, run the relevance gate (SSLA-14, full Cucumber `test:nogeo` + `test:geo`, k6 pair against a freshly re-derived baseline — not the inherited 1443 ms), gate the green index's hot-set against the page-cache budget, cut over, exercise rollback in both directions, then publish and notify the reporter on #365.

## Migration state (2026-07-31) — HALTED AT THE RELEVANCE GATE

Playbook steps 1-3 complete and verified. Step 5 (parity/relevance gate) **failed**, so there has been no cutover and production is unaffected.

| Step                                 | State                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Provision blue domain quiet       | Done — `addressr6`, OpenSearch 3.5, `m6g.large.search` x2, 20 GB gp3. EB `ELASTIC_HOST` never touched, still `addressr5`.                                             |
| 2. Full load, `replicas: 0`          | Done — ~9.5h, locally over SigV4. Only logged error was the benign `Counts.csv` ENOENT that `fileExists` handles by design.                                           |
| 3. Validate                          | Done — **exact doc parity 16,905,824** on both domains; localities 17,578; replicas raised to 1; cluster **green**, zero unassigned.                                  |
| 4. Read-shadow                       | Not started.                                                                                                                                                          |
| 5. Relevance gate                    | **FAILED — see P073.** 13 of 14 SSLA-14 queries hold; `16 Gaze Rd Christmas Island` puts sub-units above the street-level match, violating ADR-025 Decision Driver 1. |
| 6-9. Cutover, rollback, decommission | Blocked.                                                                                                                                                              |

**P069 itself is confirmed fixed on the green domain**, measured against the old domain as control on identical data:

| query                  | addressr5 (old)   | addressr6 (ADR-041)  |
| ---------------------- | ----------------- | -------------------- |
| `55 Pyrmont Bri`       | **0 hits**        | 4 hits, target at #1 |
| `55 Harris S`          | **0 hits**        | 8 hits, target at #7 |
| `55 Pyrmont` (control) | 8 hits, target #2 | 8 hits, target #2    |

Both reported cases go from zero results to finding the target, and the shorter control query is unchanged, so recall was not bought by breaking something else.

Analyzer behaviour verified directly on the domain before the load was committed to:

```
INDEX  "55 PYRMONT BRIDGE RD": 55@0 PYRMONT@1 BRIDGE@2 BDGE@2 RD@3 ROAD@3
SEARCH "55 Pyrmont Bri"      : 55@0 PYRMONT@1 BRI@2
SEARCH "55 Harris S"         : 55@0 HARRIS@1 S@2
```

**Operational notes for whoever resumes this:**

- The first load attempt was killed by the session harness at 254k docs. Restarting was safe because documents carry explicit `_id`s, so a re-run overwrites rather than duplicates — the exact doc-count parity confirms that held. Run the loader detached (`nohup`, reparented to PID 1) or it will not survive.
- Watch `_stats` `indexing.index_total`, not the `_cat/indices` doc count. Refresh is throttled under heavy indexing, so the doc count lags by ~15 minutes and looks stalled when it is not. This cost an unnecessary investigation.
- The SNS subscription for `addressr-search-ops` was still `PendingConfirmation` throughout the load, so the doc-count trip-wire alarms reached nobody during a ~9.5h unattended window. Confirm the subscription before the next long-running step.
- The loader runs `x64` node under Rosetta on Apple Silicon (see `reference_env_arch_and_skill_tool`), which is why throughput was ~20-100k/min rather than better.
- `addressr6` is loaded, green, and costing money. It is the correct green domain to cut over **once P073 is resolved** — do not tear it down and do not reload it unless the fix is index-time.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: P073 — the ADR-041 analyzer regresses the ADR-025 street-level-first invariant. The green domain is loaded and P069 is verified fixed on it, but it cannot take traffic until that is resolved.
- **Composes with**: P007 (search-scoring / ranking), P026 (numeric ranking, closed) — same search-relevance subsystem.

## Related

- Origin: [mountain-pass/addressr#365](https://github.com/mountain-pass/addressr/issues/365) (external reporter; comment corrected 2026-07-29).
- Distinct from P015 (range-number recall, closed) and P026 (numeric ranking, closed) — those did not cover street-name-prefix recall.

## Reported Upstream

- **Origin issue**: https://github.com/mountain-pass/addressr/issues/365
- **Acknowledged**: 2026-07-29 — corrected the earlier over-claim; confirmed still open (comment `5109833126`).
