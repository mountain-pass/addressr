# Problem 069: Partial-prefix search drops results a shorter query returns

**Status**: Verification Pending
**Released**: 2026-08-02 (ADR-041 blue/green cutover, commit `33e6c04`)
**Verified in production**: 2026-08-02 — `55 Pyrmont Bri` returns 4 results with `55 PYRMONT BRIDGE RD, PYRMONT NSW 2009` at #1 (previously 0); `55 Harris S` returns 8 (previously 0); control `55 Pyrmont` unchanged. Reporter notified and issue #365 closed.
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

Recorded and human-ratified as **[ADR-041](../../decisions/041-equivalent-synonyms-with-synonym-free-search-analyzer.accepted.md)**: emit synonyms as equivalents rather than directional replacements so both forms share an index position, and add a `search_analyzer` without the synonym filter so a partial query token is never rewritten.

**Implemented and merged to master, deliberately unreleased:**

| Commit    | What                                                                                                                                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1084ce7` | The fix. Analysis config and synonym building extracted to `src/init-index-config.js` (clean ESM, P033); equivalents + `search_analyzer`; `initIndex` fail-loud stale-index guard; source-inspection regex replaced with 13 builder assertions; new integration suite on both CI engine legs. |
| `775a9ee` | Regression fix — the extraction had dropped seven keyword fields from the locality mapping, breaking `/postcodes`. Caught by Cucumber in CI.                                                                                                                                                  |

**No changeset, on purpose.** The analyzer change only takes effect on re-analysed documents, and the fail-loud guard means any deployment still on a pre-ADR-041 index gets a hard loader abort on its next run. Publishing must therefore _follow_ the reindex, not lead it. The quarterly `update-*.yml` crons run the loader from a master checkout, so they will abort on their next firing until the reindex lands — loud and non-destructive, and remediated by the migration itself.

**Remaining work is a production operation, not code.** Per ADR-029 and the user's ratified choice of domain-level blue/green: provision the blue domain, load with `replicas=0` and the doc-count alarm armed first, validate doc count and geo, measure parity, run the relevance gate (SSLA-14, full Cucumber `test:nogeo` + `test:geo`, k6 pair against a freshly re-derived baseline — not the inherited 1443 ms), gate the green index's hot-set against the page-cache budget, cut over, exercise rollback in both directions, then publish and notify the reporter on #365.

## Migration state (2026-08-02) — CUTOVER COMPLETE, PRODUCTION SERVES `addressr6`

**The cutover landed 2026-08-02 in commit `33e6c04`, and the fix is verified on the live endpoint.** `ELASTIC_HOST` now resolves to `module.opensearch_v4.endpoint` (`addressr6`); `addressr5` is retained WARM as the rollback target and must not be decommissioned yet.

All playbook steps are complete. The step-5 relevance gate previously read FAILED on P073; that finding was **dissolved by measurement, not waived** — P073's blast radius turned out to be an aggregate improvement, not a regression (see P073/P074 and the row below). The read-shadow ran from **2026-07-31 02:45Z** for 33.8 hours across two business peaks, all five ADR-031 Soak Gate criteria passed, and it was removed with the cutover since it would now mirror v4 onto itself (recorded as an ADR-031 ledger amendment dated 2026-08-02).

**Do not re-run the cutover runbook below as though it were pending.** It is retained as the record of what was executed and as the source of the rollback procedure, which remains live. Flipping `ELASTIC_HOST` back to v3 returns consumers to the domain where this ticket's defect reproduces.

| Step                                 | State                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Provision blue domain quiet       | Done — `addressr6`, OpenSearch 3.5, `m6g.large.search` x2, 20 GB gp3. EB `ELASTIC_HOST` never touched, still `addressr5`.                                                                                                                                                                                                                                                                                                                                       |
| 2. Full load, `replicas: 0`          | Done — ~9.5h, locally over SigV4. Only logged error was the benign `Counts.csv` ENOENT that `fileExists` handles by design.                                                                                                                                                                                                                                                                                                                                     |
| 3. Validate                          | Done — **exact doc parity 16,905,824** on both domains; localities 17,578; replicas raised to 1; cluster **green**, zero unassigned.                                                                                                                                                                                                                                                                                                                            |
| 4. Read-shadow                       | **Running since 2026-07-31 02:45Z.** Verified mirroring: `successes == attempts`, 0 failures, `lastError` null. Target-side coverage verified as **mirror parity** — v4's `query_total` growth matched v3's exactly over the sample window (ratio 1.00). Expressed as a ratio deliberately: raw counts over a stated window are a production traffic volume, which RISK-POLICY classes as confidential in this public repo.                                     |
| 5. Relevance gate                    | **Passed on the measurement that matters.** 13 of 14 SSLA-14 queries hold. The 14th (`16 Gaze Rd Christmas Island`) flips one street-level case, but a 145-address blast-radius sample shows production violating the same invariant on **73/145 (50.3%)** against ADR-041's **71/145 (49.0%)** — aggregate-neutral-to-better, so it is not a regression. The ~50% baseline violation is P074, a pre-existing defect this migration exposed rather than caused. |
| 6-9. Cutover, rollback, decommission | Gated on the ADR-031 soak gate (rewritten in place 2026-07-31: coverage, parity, warmth convergence, a >=24h floor spanning a business-hours peak, and re-derived k6), plus Cucumber `test:nogeo`/`test:geo` against the green domain and the ADR-033 primary-path invariant pair.                                                                                                                                                                              |

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

**Soak-start evidence (2026-07-31 02:45Z), recorded because ADR-031's rewritten gate is evaluated against it:**

- Quiescence verified BEFORE enabling, per the ADR-031 amendment written from the failure where bulk-index contention drove shadow success 95% to 52% and invalidated that soak: v4 `index_current=0`, `is_throttled=false`, doc counts at exact parity on both indices at matching 5 shards / 1 replica.
- Green index confirmed to actually carry the ADR-041 analyzer, at the data layer and not merely in config. `_meta.analysisStamp` reads `synonymForm: equivalent`; `_analyze` co-positions `BRIDGE`/`BDGE` and `RD`/`ROAD` on green while blue holds only the abbreviations; and a term query for `BRIDGE` on `sla` returns **0 hits on blue against the 10,000 cap on green**. The term query is the discriminating one — the first two prove configuration, only the third proves the postings were physically written.
- Measured index growth is **+0.59%** (~34.6 MB, 2.05 bytes/doc), falsifying ADR-041's 15-25% estimate by 25-40x. This retires the page-cache cliff that made the hot-set gate urgent; ADR-041 is amended with the measurement and the mechanism.

**Instrument note — do not try to shortcut the primary-path invariant with production metrics.** ADR-033 owes a shadow-off/shadow-on k6 pair to verify ADR-031's <=1 ms p95 invariant, and the obvious shortcut is to compare ALB p95 across the deploy boundary instead. It does not work: pre-deploy production p95 swings between 50 ms and 200 ms in 15-minute buckets, so natural variance is roughly +/-50 ms against a 1 ms signal. Production traffic cannot resolve the invariant at all; the controlled k6 pair is the only instrument with the resolution, and ADR-031's Soak Gate now carries an interruption clause authorising the off-leg.

**Operational notes for whoever resumes this:**

- The first load attempt was killed by the session harness at 254k docs. Restarting was safe because documents carry explicit `_id`s, so a re-run overwrites rather than duplicates — the exact doc-count parity confirms that held. Run the loader detached (`nohup`, reparented to PID 1) or it will not survive.
- Watch `_stats` `indexing.index_total`, not the `_cat/indices` doc count. Refresh is throttled under heavy indexing, so the doc count lags by ~15 minutes and looks stalled when it is not. This cost an unnecessary investigation.
- The SNS subscription for `addressr-search-ops` was still `PendingConfirmation` throughout the load, so the doc-count trip-wire alarms reached nobody during a ~9.5h unattended window. Confirm the subscription before the next long-running step.
- The loader runs `x64` node under Rosetta on Apple Silicon (see `reference_env_arch_and_skill_tool`), which is why throughput was ~20-100k/min rather than better.
- `addressr6` is now the PRODUCTION domain as of 2026-08-02. `addressr5` is the warm rollback target and is still costing money: do not tear either down. P073 was resolved by measurement rather than by a fix, and did not block the cutover.

## Cutover runbook (written 2026-07-31 while the soak ran; EXECUTED 2026-08-02, commit `33e6c04`)

Written now, while the evidence is fresh, so the next session executes rather
than reconstructs this from three ADRs and a playbook. Every path, role name and
variable below was verified against the tree on 2026-07-31.

**Do not start until all five ADR-031 Soak Gate criteria pass.** As of ~2 h into
the soak: criteria 1 and 2 hold, criterion 3 (p90 flattening) does **not** —
green's p90 has fallen to roughly 1.10x blue's and is still descending rather
than flat. Criterion 4 (≥24 h spanning a business-hours peak) elapses no earlier
than ~02:45Z 2026-08-01.

### Step 0 — gate

- Re-read `/debug/shadow-config`: `failures` 0 and `lastError` null, sampled several times (counters are cumulative-since-boot, and each read hits one ASG instance at random — P035 BS-1 and BS-4).
- Target-side coverage: v4 `_stats/search` `query_total` growth **within 1% of** v3's over the same window. Express and record this as a ratio, never as raw counts — counts over a stated window are a production traffic volume and RISK-POLICY classes those as confidential in this public repo (see R004, R011, R016).
- Warmth: v4 `SearchLatency` p90 flat within 10% across the trailing 6 h **and** within 1.5x of v3's concurrent p90 on the parity dashboard.
- `addressr-v4-shadow-search-rate-floor` recorded no ALARM transition across the window.

### Step 1 — fresh blue-side k6 baseline

ADR-041 requires the k6 pass condition be re-derived from a baseline **measured
immediately before this cutover**. The inherited 1,443 ms threshold is retired
and must not be reused — it descends from a long-gone v1 figure and carries so
much slack it could not fail. Run blue, record p95, set the green gate at 1.5x.

### Step 2 — the cutover commit

One commit, all of it, because a partial landing leaves the writer and the
reader pointed at different domains:

1. `deploy/main.tf` — `ELASTIC_HOST` from `module.opensearch_v3.endpoint` to `module.opensearch_v4.endpoint`. A **module output, not a variable**, so no Terraform variable and no GitHub secret is involved on the read path.
2. `deploy/vars.tf` — `v4_searchable_documents_floor` 1,000,000 → 15,000,000, now that v4 is populated and primary. Leave `v3_searchable_documents_floor` alone until v3 is decommissioned.
3. `deploy/main.tf` — retire or repoint `addressr-v4-shadow-search-rate-floor`. Once v4 is primary its search rate is production's, not the shadow's, so the floor is meaningless and will sit in ALARM.
4. `.github/workflows/release.yml` — flip the smoke `hostSet` assertion back to `false`, since a v4→v4 shadow is redundant.
5. `deploy/main.tf` — remove the five `ADDRESSR_SHADOW_*` settings.

### Step 3 — writer retarget, and the one real secret prerequisite

`.github/workflows/reusable-update.yml` resolves its target in a hard-coded
branch that **errors on anything but `v3`** (`::error::Unsupported target`). It
needs a `v4` arm added, mirroring the v3 one: host from `TF_VAR_ELASTIC_V4_HOST`,
role `gha-v4-loader` — which already exists (`aws_iam_role.gha_v4_loader`,
`deploy/oidc.tf`) and already holds `es:ESHttp*` on the v4 domain.

Then flip `target: v3` to `target: v4` in the **nine** `update-<state>.yml` crons
and in `populate-search-domain.yml`.

**`TF_VAR_ELASTIC_V4_HOST` must be set as a GitHub Actions secret before this
step**, or the v4 arm fails its own non-empty guard. Note the asymmetry, because
it is easy to get backwards: the **read** path needs no secret because Terraform
resolves the endpoint from a module output; only the **writer** path needs one,
because GitHub Actions has no Terraform state to read from.

### Step 4 — verify, then exercise rollback

- Goal condition 1 against the **live** endpoint: `55 Pyrmont Bri` returns `55 PYRMONT BRIDGE RD, PYRMONT NSW 2009`, and `55 Harris S` returns `55 HARRIS ST, PYRMONT NSW 2009`. Both return zero results on blue today and resolve at rank 1 on green.
- Then **exercise** rollback rather than trusting it: flip `ELASTIC_HOST` back to v3, observe, flip forward to v4, observe. Both directions, results recorded. v3 stays warm throughout because it serves until the moment of the flip, which is what makes the rollback zero-outage.
- Only after that is v3 eligible for decommission — and not in the same commit.

### Step 5 — close out

Transition P069 to Verification Pending citing the release, and reply on #365.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none) — P073 no longer blocks. It was raised on the premise that the ADR-041 analyzer regresses the ADR-025 street-level-first invariant; measuring the blast radius across 145 street-level-plus-sub-unit addresses reversed that premise (blue violates on 50.3%, green on 49.0% — green is marginally better), and P073 was downgraded High (12) → Low (4). P075's exact-vs-range inversion was likewise measured at zero occurrences across 800 random pairs, and P078 attributes it to a per-shard `phrase_prefix` expansion mechanism that pre-exists ADR-041 and is present on blue identically.
- **Composes with**: P007 (search-scoring / ranking), P026 (numeric ranking, closed) — same search-relevance subsystem.

## Related

- Origin: [mountain-pass/addressr#365](https://github.com/mountain-pass/addressr/issues/365) (external reporter; comment corrected 2026-07-29).
- Distinct from P015 (range-number recall, closed) and P026 (numeric ranking, closed) — those did not cover street-name-prefix recall.

## Reported Upstream

- **Origin issue**: https://github.com/mountain-pass/addressr/issues/365
- **Acknowledged**: 2026-07-29 — corrected the earlier over-claim; confirmed still open (comment `5109833126`).
