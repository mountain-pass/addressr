# Problem Backlog

> Last reviewed: 2026-07-29 **P068 closed as already-fixed (Open → Closed in one session)** — the data.gov.au CloudFront 403 was fixed on 2026-04-28 by `741fd21`, three months before the ticket was captured. `LOADER_USER_AGENT` (`service/gnaf-package-fetch.js:35`) sends a Mozilla-prefixed compatible-mode User-Agent on the CKAN `package_show` request, defeating the WAF rule that had been returning a 403 HTML error page for bare-UA requests and breaking the loader's `JSON.parse`. Released v2.4.3 (changeset `.changeset/fix-loader-user-agent.md`, PR #462, merge `3d52cdd`), present in current `@mountainpass/addressr@3.0.3`, covered by three behavioural tests. The miss was a capture-pass gap, not an investigation gap: issue #458 was filed 2026-04-27 and we hit the identical failure internally one day later via the ADR-029 Phase 1 populate (run 25032179791), but the 2026-07-29 inbound-assessment pass never cross-checked the code, so a fixed defect entered the backlog ranked WSJF 8.0. Live probe from AU on close confirms all paths healthy and the reporter symptom not reproducing; the WAF no longer rejects bare-UA from this vantage point, so the shipped header is currently belt-and-braces and stays for exactly that reason. Effort re-rated M → S per P047. Two residuals carried out rather than fixed under this ticket: `utils/stream-down.js` still sends no User-Agent on the ZIP download hop, and the download-URL smoke check (investigation task 4) was never built, so silent re-breakage would again surface only as a failing load. Ladder traversed Open → Known Error → Verification Pending → Closed as one commit per ADR-014 batch grain, the intermediate states having never existed independently.
> Run `/wr-itil:review-problems` to refresh.

## WSJF Rankings

Dev-work queue only. Verification Pending (`.verifying.md`, WSJF multiplier 0) and Parked (`.parked.md`, multiplier 0) tickets are excluded per ADR-022 — surfaced in their own sections below. Rows render **tier-first** (Tier 0 Critical-bypass [Severity Very High ≥17 OR security-classified OR incident-linked] → Tier 1 Inbound-reported [`**Origin**: inbound-reported`] → Tier 2 Internal), then within each tier by `(WSJF desc, Known-Error-first, Effort-divisor asc, Reported-date asc, ID asc)` so top-to-bottom order matches `/wr-itil:work-problems` Step 3 selection 1:1 (P138 + ADR-076). The `Reported` and `Origin` columns MUST appear. <!-- REPORTED-FIRST-TIER-SOURCE: /wr-itil:work-problems SKILL.md Step 3 (ADR-076) -->

| WSJF | ID   | Title                                                                 | Severity     | Status      | Effort | Reported   | Origin                  |
| ---- | ---- | --------------------------------------------------------------------- | ------------ | ----------- | ------ | ---------- | ----------------------- |
| 4.0  | P069 | Partial-prefix search drops results a shorter query returns           | High (16)    | Open        | L      | 2026-07-29 | inbound-reported (#365) |
| 9.0  | P032 | No CI perf regression detection — k6 stress profile on-demand only    | Medium (9)   | Known Error | M      | 2026-04-27 | internal                |
| 9.0  | P064 | external-comms commit-message gate scans only the first `-m` value    | Medium (9)   | Open        | S      | 2026-07-26 | internal                |
| 8.0  | P031 | `create-adr` skill does not auto-satisfy the edit-gate hooks          | Low (4)      | Known Error | S      | 2026-04-21 | internal                |
| 6.0  | P066 | `wr-architect` edit gate blocks Write to untracked `scratchpad/`      | Medium (6)   | Open        | S      | 2026-07-26 | internal                |
| 4.0  | P039 | Decouple SaaS deployment from npm publish in release pipeline         | Low (4)      | Known Error | M      | 2026-05-14 | internal                |
| 4.0  | P041 | `capture-problem` halts on pre-existing README drift                  | Low (4)      | Known Error | M      | 2026-05-14 | internal                |
| 4.0  | P055 | Migrate the Docker image from Alpine to Distroless                    | Low (4)      | Known Error | M      | 2026-07-18 | internal                |
| 4.0  | P035 | Read-shadow soak validation has multiple blind spots                  | Medium (8)   | Known Error | L      | 2026-05-03 | internal                |
| 4.0  | P065 | RFC-007 carries `stories: []` — no story map, no story, no reason     | Low (4)      | Open        | S      | 2026-07-26 | internal                |
| 4.0  | P063 | work-problems pre-flight dispatch exceeds harness 600s Bash cap       | Medium (8)   | Open        | M      | 2026-07-21 | internal                |
| 3.0  | P033 | Source-inspection tests are an anti-pattern in this codebase          | Medium (6)   | Open        | M      | 2026-04-28 | internal                |
| 3.0  | P050 | Stale-Open tickets after fix ships — no transition-fold check         | Medium (6)   | Open        | M      | 2026-07-16 | internal                |
| 2.0  | P057 | Relevance-close evaluator misses platform-version-rooted tickets      | Low (4)      | Open        | M      | 2026-07-19 | internal                |
| 2.0  | P061 | work-problems iter briefing carries another ticket's evaluator caveat | Low (4)      | Open        | M      | 2026-07-19 | internal                |
| 1.0  | P046 | wr-architect oversight-marker discipline blocks multi-agent confirms  | Very Low (2) | Open        | M      | 2026-07-08 | internal                |

## Verification Queue

Fix released, awaiting user verification (driven off the dual-tolerant glob `docs/problems/*.verifying.md docs/problems/verifying/*.md` per ADR-022 + RFC-002 migration window). Sorted by `Released date ASC` (oldest at row 1; same-day releases tiebreak by ID ASC). <!-- VQ-SORT-DIRECTION: oldest-first per ADR-022 --> `Likely verified?` column carries an **evidence-first** cell per P186 — three canonical values: `yes — observed: <evidence>`, `no — not observed` (default for newly-released tickets), `no — observed regression`. <!-- LIKELY-VERIFIED-CELL-SHAPE: evidence-based per P186 --> Age is preserved separately via the `Released` column.

| ID   | Title                                                          | Released          | Likely verified?  |
| ---- | -------------------------------------------------------------- | ----------------- | ----------------- |
| P051 | release:watch stalls on the changeset release-PR approval gate | 2026-07-18        | no — not observed |
| P062 | AFK iter subprocess sessions missing docs/BRIEFING.md content  | 2026-07-20        | no — not observed |
| P023 | Cross-origin root `/` not browser-cached (preflight flood)     | 2026-07-25 v3.0.2 | no — not observed |
| P067 | addressr server has no SIGTERM graceful-shutdown handler       | 2026-07-26 v3.0.3 | no — not observed |

## Inbound Upstream Reports

Inbound reports discovered by Step 4.5 (ADR-062), rendered off `docs/problems/.upstream-cache.json`. Channel bootstrapped 2026-07-29: `github-issues:mountain-pass/addressr`. Nine open issues assessed; the two genuine third-party/actionable reports were captured locally and acknowledged upstream. The seven maintainer-self-filed issues are listed for visibility but carry no reporter-facing verdict. Sorted by `created_at ASC`.

| #    | Source                      | Title                                                        | Author          | Created    | Classification                                | Local ticket |
| ---- | --------------------------- | ------------------------------------------------------------ | --------------- | ---------- | --------------------------------------------- | ------------ |
| #26  | github-issues:mountain-pass | Add support for NZ addresses                                 | tompahoward     | 2020-08-23 | self-filed (feature)                          | —            |
| #81  | github-issues:mountain-pass | Validation error when Elastic Search returns an error        | tompahoward     | 2020-09-23 | self-filed                                    | —            |
| #91  | github-issues:mountain-pass | Indexing Backoff is not backing off                          | tompahoward     | 2020-10-08 | self-filed                                    | —            |
| #362 | github-issues:mountain-pass | Support for old or custom data files                         | tompahoward     | 2022-01-17 | self-filed (feature)                          | —            |
| #365 | github-issues:mountain-pass | Partial search returning incorrect results                   | tompahoward     | 2022-06-01 | safe-and-valid (still open; over-claim fixed) | P069         |
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
