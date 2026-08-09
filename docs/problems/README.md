# Problem Backlog

> Last reviewed: 2026-08-09 **P098 captured** — test files whose assertions never execute, because no runner reaches them or nothing invokes their runner; one is named by an ADR Confirmation criterion, one is the standing instrument for a lint rule enabled the same day, and two are the named guards behind release-reliability outcomes (lightweight aside via /wr-itil:capture-problem)
> Run `/wr-itil:review-problems` to refresh.

## WSJF Rankings

Dev-work queue only. Verification Pending (`.verifying.md`, WSJF multiplier 0) and Parked (`.parked.md`, multiplier 0) tickets are excluded per ADR-022 — surfaced in their own sections below. Rows render **tier-first** (Tier 0 Critical-bypass [Severity Very High ≥17 OR security-classified OR incident-linked] → Tier 1 Inbound-reported [`**Origin**: inbound-reported`] → Tier 2 Internal), then within each tier by `(WSJF desc, Known-Error-first, Effort-divisor asc, Reported-date asc, ID asc)` so top-to-bottom order matches `/wr-itil:work-problems` Step 3 selection 1:1 (P138 + ADR-076). The `Reported` and `Origin` columns MUST appear. <!-- REPORTED-FIRST-TIER-SOURCE: /wr-itil:work-problems SKILL.md Step 3 (ADR-076) -->

| WSJF | ID   | Title                                                                 | Severity     | Status        | Effort | Reported   | Origin   |
| ---- | ---- | --------------------------------------------------------------------- | ------------ | ------------- | ------ | ---------- | -------- |
| 10.0 | P091 | sla_range_expanded indexed at the wrong path, never searchable        | High (10)    | Open          | S      | 2026-08-08 | internal |
| 9.0  | P032 | No CI perf regression detection — k6 stress profile on-demand only    | Medium (9)   | Known Error   | M      | 2026-04-27 | internal |
| 9.0  | P064 | external-comms commit-message gate scans only the first `-m` value    | Medium (9)   | Open          | S      | 2026-07-26 | internal |
| 8.0  | P031 | `create-adr` skill does not auto-satisfy the edit-gate hooks          | Low (4)      | Known Error   | S      | 2026-04-21 | internal |
| 8.0  | P086 | Text-matched gates: commands slip past, documentation trips them      | High (16)    | Upstream #410 | S      | 2026-08-04 | internal |
| 8.0  | P087 | Architect gate binds to the Edit/Write tool; Bash edits bypass it     | Medium (8)   | Open          | S      | 2026-08-05 | internal |
| 8.0  | P033 | Source-inspection tests are an anti-pattern in this codebase          | High (16)    | Open          | M      | 2026-04-28 | internal |
| 6.0  | P066 | `wr-architect` edit gate blocks Write to untracked `scratchpad/`      | Medium (6)   | Open          | S      | 2026-07-26 | internal |
| 6.0  | P071 | Loader pinned to legacy GDA94 datum — coordinates ~1.8m out           | Medium (6)   | Open          | M      | 2026-07-29 | internal |
| 6.0  | P077 | Risk scorer rates deferral as mitigation (upstream-blocked)           | High (12)    | Open          | M      | 2026-08-01 | internal |
| 6.0  | P079 | "Rollback exercised" is not a gate on warm-standby decommission       | High (12)    | Open          | M      | 2026-08-02 | internal |
| 6.0  | P080 | external-comms gate cannot read `--body-file`; that path never clears | Medium (6)   | Upstream #408 | S      | 2026-08-02 | internal |
| 6.0  | P082 | `RISK_BYPASS: reducing` opens all three gates, incl. push-past-CI     | High (12)    | Upstream #407 | S      | 2026-08-02 | internal |
| 6.0  | P085 | `push:watch` reports success on a red master (3 selector defects)     | High (12)    | Open          | S      | 2026-08-03 | internal |
| 5.0  | P098 | Test assertions that never execute — no runner, or no caller          | High (10)    | Open          | M      | 2026-08-09 | internal |
| 4.5  | P081 | Assistant escalates judgement calls, acts freely on mechanical ones   | Medium (9)   | Open          | M      | 2026-08-02 | internal |
| 4.5  | P083 | Risk register is an index of hints — 24 of 25 entries uncurated       | Medium (9)   | Open          | M      | 2026-08-03 | internal |
| 4.5  | P088 | Assistant manufactures problems and presents them as findings         | Medium (9)   | Open          | M      | 2026-08-07 | internal |
| 4.5  | P097 | Cucumber leg intermittently starts against an empty index             | Medium (9)   | Open          | M      | 2026-08-09 | internal |
| 4.0  | P039 | Decouple SaaS deployment from npm publish in release pipeline         | Low (4)      | Known Error   | M      | 2026-05-14 | internal |
| 4.0  | P041 | `capture-problem` halts on pre-existing README drift                  | Low (4)      | Known Error   | M      | 2026-05-14 | internal |
| 4.0  | P055 | Migrate the Docker image from Alpine to Distroless                    | Low (4)      | Known Error   | M      | 2026-07-18 | internal |
| 4.0  | P035 | Read-shadow soak validation has multiple blind spots                  | Medium (8)   | Known Error   | L      | 2026-05-03 | internal |
| 4.0  | P065 | RFC-007 carries `stories: []` — no story map, no story, no reason     | Low (4)      | Open          | S      | 2026-07-26 | internal |
| 4.0  | P089 | No file-length lint rule; two source files past 1000 lines            | Low (4)      | Open          | S      | 2026-08-07 | internal |
| 4.0  | P063 | work-problems pre-flight dispatch exceeds harness 600s Bash cap       | Medium (8)   | Open          | M      | 2026-07-21 | internal |
| 4.0  | P076 | ADR Confirmation items can be prescribed and never implemented        | Medium (8)   | Open          | M      | 2026-07-31 | internal |
| 4.0  | P078 | phrase_prefix scores depend on shard-local prefix-expansion set       | Medium (8)   | Open          | M      | 2026-08-02 | internal |
| 3.0  | P072 | Architect ISSUES FOUND writes no marker, deadlocking ADR edits        | Medium (6)   | Open          | M      | 2026-07-30 | internal |
| 3.0  | P050 | Stale-Open tickets after fix ships — no transition-fold check         | Medium (6)   | Open          | M      | 2026-07-16 | internal |
| 3.0  | P075 | ADR-041 inverts exact-vs-range ranking on at least one address        | Medium (9)   | Open          | M      | 2026-07-31 | internal |
| 3.0  | P084 | ESLint 10 / unicorn 72 lint debt, pre-commit hook is the only gate    | Medium (6)   | Open          | M      | 2026-08-03 | internal |
| 3.0  | P090 | Decisions compendium facts are hand-maintained; nothing checks them   | Medium (6)   | Open          | M      | 2026-08-07 | internal |
| 3.0  | P092 | CHANGELOG erratum from the P074 changeset                             | Low (3)      | Open          | S      | 2026-08-08 | internal |
| 2.0  | P057 | Relevance-close evaluator misses platform-version-rooted tickets      | Low (4)      | Open          | M      | 2026-07-19 | internal |
| 2.0  | P061 | work-problems iter briefing carries another ticket's evaluator caveat | Low (4)      | Open          | M      | 2026-07-19 | internal |
| 2.0  | P073 | ADR-041 flips one street-level-first case (not a regression)          | Low (4)      | Open          | M      | 2026-07-31 | internal |
| 2.0  | P093 | analyze-context Step 0 halts on a repo-relative path                  | Low (4)      | Open          | M      | 2026-08-08 | internal |
| 1.0  | P046 | wr-architect oversight-marker discipline blocks multi-agent confirms  | Very Low (2) | Open          | M      | 2026-07-08 | internal |

## Verification Queue

Fix released, awaiting user verification (driven off the dual-tolerant glob `docs/problems/*.verifying.md docs/problems/verifying/*.md` per ADR-022 + RFC-002 migration window). Sorted by `Released date ASC` (oldest at row 1; same-day releases tiebreak by ID ASC). <!-- VQ-SORT-DIRECTION: oldest-first per ADR-022 --> `Likely verified?` column carries an **evidence-first** cell per P186 — three canonical values: `yes — observed: <evidence>`, `no — not observed` (default for newly-released tickets), `no — observed regression`. <!-- LIKELY-VERIFIED-CELL-SHAPE: evidence-based per P186 --> Age is preserved separately via the `Released` column.

| ID   | Title                                                          | Released           | Likely verified?                                                                                                   |
| ---- | -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| P051 | release:watch stalls on the changeset release-PR approval gate | 2026-07-18         | no — not observed                                                                                                  |
| P062 | AFK iter subprocess sessions missing docs/BRIEFING.md content  | 2026-07-20         | no — not observed                                                                                                  |
| P023 | Cross-origin root `/` not browser-cached (preflight flood)     | 2026-07-25 v3.0.2  | no — not observed                                                                                                  |
| P067 | addressr server has no SIGTERM graceful-shutdown handler       | 2026-07-26 v3.0.3  | no — not observed                                                                                                  |
| P070 | stream-down promotes failed and partial downloads into cache   | 2026-07-29 v3.0.4  | no — not observed                                                                                                  |
| P069 | Partial-prefix search drops results a shorter query returns    | 2026-08-02 33e6c04 | yes — observed: `55 Pyrmont Bri` returns 4 results with the target at #1 on the live endpoint (was 0); #365 closed |

## Inbound Upstream Reports

Inbound reports discovered by Step 4.5 (ADR-062), rendered off `docs/problems/.upstream-cache.json`. Channel bootstrapped 2026-07-29: `github-issues:mountain-pass/addressr`. Nine open issues assessed; the two genuine third-party/actionable reports were captured locally and acknowledged upstream. The seven maintainer-self-filed issues are listed for visibility but carry no reporter-facing verdict. Sorted by `created_at ASC`.

| #    | Source                      | Title                                                        | Author          | Created    | Classification                                | Local ticket |
| ---- | --------------------------- | ------------------------------------------------------------ | --------------- | ---------- | --------------------------------------------- | ------------ |
| #26  | github-issues:mountain-pass | Add support for NZ addresses                                 | tompahoward     | 2020-08-23 | self-filed (feature)                          | —            |
| #81  | github-issues:mountain-pass | Validation error when Elastic Search returns an error        | tompahoward     | 2020-09-23 | self-filed                                    | —            |
| #91  | github-issues:mountain-pass | Indexing Backoff is not backing off                          | tompahoward     | 2020-10-08 | self-filed                                    | —            |
| #362 | github-issues:mountain-pass | Support for old or custom data files                         | tompahoward     | 2022-01-17 | self-filed (feature)                          | —            |
| #365 | github-issues:mountain-pass | Partial search returning incorrect results                   | tompahoward     | 2022-06-01 | safe-and-valid (CLOSED 2026-08-02, fixed)     | P069         |
| #376 | github-issues:mountain-pass | Update to TLS 1.3                                            | tompahoward     | 2022-09-30 | self-filed                                    | —            |
| #405 | github-issues:mountain-pass | FR: Add ABS Boundaries and Local Government Areas            | mitchellkellett | 2026-01-15 | feature-request (out of problem scope)        | —            |
| #456 | github-issues:mountain-pass | Link relation URIs not dereferenceable to documentation      | tompahoward     | 2026-04-26 | self-filed                                    | —            |
| #458 | github-issues:mountain-pass | CloudFront 403 Errors When Downloading Data from data.gov.au | Arunmozhi05G    | 2026-04-27 | safe-and-valid (fixed in v2.4.3; P068 closed) | P068 closed  |

## Parked

| ID   | Title                                                              | Reason                                           | Parked since |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------ | ------------ |
| P005 | TDD hook does not recognise Cucumber feature files                 | see ticket                                       | 2026-04-19   |
| P013 | Loader second run fails on cloud-managed clusters                  | see ticket                                       | 2026-04-16   |
| P016 | External comms posted without voice/tone or risk check             | see ticket                                       | 2026-04-19   |
| P018 | Root `/` cache TTL too long for a version-gated HATEOAS contract   | ops-tradeoff, user-deferred                      | 2026-04-18   |
| P021 | `git push origin master` is not risk-gated (advisory only)         | see ticket                                       | 2026-04-19   |
| P024 | `wr-architect:agent` misses per-request performance implications   | see ticket                                       | 2026-04-19   |
| P038 | Scale v2 OpenSearch back to steady-state sizing post-populate      | post-populate sizing                             | 2026-05-14   |
| P048 | external-comms marker hash-exactness forces re-review round-trips  | upstream-blocked (`@windyroad/risk-scorer`)      | 2026-07-19   |
| P049 | wr-retrospective retro scripts lack bin shims in adopter repos     | upstream-blocked (`@windyroad/wr-retrospective`) | 2026-07-19   |
| P052 | red-master push guard blocks the CI-fix commit that would green it | upstream-blocked (`@windyroad/risk-scorer`)      | 2026-07-19   |
| P053 | scorer defers to policy prose over gate numeric at appetite edge   | upstream-blocked (`@windyroad/risk-scorer`)      | 2026-07-19   |
| P054 | risk-scorer label bands disagree across the plugin                 | upstream-blocked (`@windyroad/risk-scorer`)      | 2026-07-19   |
| P056 | wr-itil SKILL.md bodies exceed the ADR-054 runtime budget          | upstream-blocked (`@windyroad/itil`)             | 2026-07-19   |
| P058 | `restage-commit` commits bypass the git-commit-message gate        | upstream-blocked (`@windyroad/risk-scorer`)      | 2026-07-19   |
| P059 | wr-itil fix-time RFC authoring contract skew — Tasks vs stories    | upstream-blocked (`@windyroad/itil`)             | 2026-07-20   |
| P060 | update-upstream O→KE comment restates the issue body               | upstream-blocked (`@windyroad/itil`)             | 2026-07-19   |
