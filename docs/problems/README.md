# Problem Backlog

> Last reviewed: 2026-07-15 **P047 + P048 captured** — session retro after the OpenSearch 2.19→3.5 migration (cutover + v2 decommission complete; ADR-035 accepted). Two upstream wr-risk-scorer frictions ticketed (appetite-misstatement, external-comms marker hash-exactness).
> Run `/wr-itil:review-problems` to refresh.

## WSJF Rankings

| WSJF | ID   | Title                                                                   | Severity   | Status      | Effort | Notes                                                                                              |
| ---- | ---- | ----------------------------------------------------------------------- | ---------- | ----------- | ------ | -------------------------------------------------------------------------------------------------- |
| 20.0 | P040 | Uptime Robot 401 alerts — Cloudflare Worker allowlist CIDR-match bug    | 10 (High)  | Known Error | S      | RCA corrected 2026-05-14; option 2 worker patch deliverable in chat; option 4 follow-up = P042     |
| 12.0 | P001 | Stale Dockerfile                                                        | 6 (Medium) | Known Error | S      | Fix released 2026-04-19; awaiting local docker-build verify                                        |
| 12.0 | P019 | No deploy-time smoke check for root Link header rels                    | 6 (Medium) | Known Error | S      | Fix released 2026-04-19; awaiting verify on next publish                                           |
| 9.0  | P006 | RapidAPI CI sync deferred                                               | 9 (Medium) | Known Error | M      | Both approaches failed; GraphQL path unexplored                                                    |
| 8.0  | P004 | release:watch script reports false negative                             | 4 (Low)    | Known Error | S      | Fix released 2026-04-19; awaiting verify on next release                                           |
| 8.0  | P030 | Dependabot reports 46 vulnerabilities on master                         | 16 (High)  | Open        | M      | Deferred estimate; needs review-problems re-rank                                                   |
| 7.5  | P028 | OpenSearch 1.3.20 version debt                                          | 15 (High)  | Known Error | L      | Drives ADR 029 blue/green; re-attempt in flight (amendment 2026-07-06)                             |
| 6.0  | P036 | v2 shadow auth silently regressed mid-soak (FGAC clobber class)         | 12 (High)  | Open        | M      | Un-parked 2026-07-06 (re-attempt fired); audit logs shipped in module; deferred re-rate            |
| 6.0  | P026 | Numeric fuzziness in bool_prefix inflates ranking                       | 12 (High)  | Open        | M      | Deferred estimate; needs review-problems re-rank                                                   |
| 6.0  | P027 | Synonym expansion bypasses AUTO:5,8 fuzziness                           | 12 (High)  | Open        | M      | Deferred estimate; needs review-problems re-rank                                                   |
| 6.0  | P034 | addressr-loader's COVERED_STATES filter is case-sensitive               | 6 (Medium) | Open        | S      | Deferred estimate; needs review-problems re-rank                                                   |
| 4.5  | P014 | Invalid address ID returns 500 not 404                                  | 9 (Medium) | Open        | M      | Error handling exists but untested; null-check gap                                                 |
| 4.5  | P032 | No CI perf regression detection — k6 stress profile is on-demand only   | 9 (Medium) | Open        | M      | Deferred estimate; needs review-problems re-rank                                                   |
| 4.0  | P029 | Cucumber `will NOT include:` step crashes on v2 API responses           | 4 (Low)    | Open        | S      | Deferred estimate; needs review-problems re-rank                                                   |
| 4.0  | P031 | `wr-architect:create-adr` skill does not auto-satisfy edit-gate hooks   | 4 (Low)    | Open        | S      | Deferred estimate; needs review-problems re-rank                                                   |
| 3.0  | P025 | GitHub Actions using Node.js 20 runtime are deprecated                  | 6 (Medium) | Open        | M      | Deferred estimate; needs review-problems re-rank                                                   |
| 3.0  | P035 | Read-shadow soak validation has multiple blind spots                    | 12 (High)  | Open        | L      | Class-of-issue ticket; debug endpoint shipped; CW alarms next                                      |
| 3.0  | P015 | Range-number addresses not findable by base number                      | 12 (High)  | Open        | L      | Hypothesis only; needs OpenSearch explain investigation                                            |
| 2.5  | P023 | Cross-origin root `/` not browser-cached                                | 10 (High)  | Open        | L      | Multi-layer (origin CORS + RapidAPI gateway + SDK)                                                 |
| 1.5  | P039 | Decouple SaaS deployment from npm publish in release pipeline           | 3 (Low)    | Open        | M      | Captured 2026-05-14; deferred estimate; needs review-problems re-rank                              |
| 1.5  | P041 | `/wr-itil:capture-problem` halts on pre-existing README drift           | 3 (Low)    | Open        | M      | Captured 2026-05-14; meta-ticket; deferred estimate                                                |
| 1.5  | P044 | changesets/action swallows publish failure → deploy silently skips      | (defer)    | Open        | S      | Captured 2026-05-25; silent-green failure mode of the P039 publish-coupling                        |
| 1.5  | P043 | `wr-itil` SID-helper fallback picks subagent UUID in multi-agent sess   | 3 (Low)    | Open        | M      | Captured 2026-05-14 retro; upstream fix needed in @windyroad/itil; one-line bash workaround        |
| 1.5  | P033 | Source-inspection tests are an anti-pattern in this codebase            | 6 (Medium) | Open        | L      | Deferred estimate; needs review-problems re-rank                                                   |
| 1.5  | P045 | RISK-POLICY 14-day staleness window conflicts with quarterly cadence    | (defer)    | Open        | M      | Captured 2026-07-06; upstream wr-risk-scorer hook; fortnightly date-bump workaround                |
| 1.5  | P046 | wr-architect oversight-marker blocks confirms in multi-agent sessions   | (defer)    | Open        | M      | Captured 2026-07-08 retro; sibling of P043; abs-path + SID-discovery; hand-write marker workaround |
| 1.5  | P047 | wr-risk-scorer mis-states appetite; STOPs on within-appetite score of 5 | (defer)    | Open        | S      | Captured 2026-07-15 retro; upstream wr-risk-scorer; gate blocks only >5, scorer says >4            |
| 1.5  | P048 | external-comms marker hash-exactness forces re-review round-trips       | (defer)    | Open        | M      | Captured 2026-07-15 retro; upstream wr-risk-scorer hook; re-review full message incl. trailers     |

## Verification Queue

<!-- VQ-SORT-DIRECTION: oldest-first per ADR-022 -->
<!-- LIKELY-VERIFIED-CELL-SHAPE: evidence-based per P186 -->

| ID   | Title                                               | Released   | Likely verified?  | Notes                                                                                    |
| ---- | --------------------------------------------------- | ---------- | ----------------- | ---------------------------------------------------------------------------------------- |
| P042 | Version-control the Cloudflare Worker via Terraform | 2026-05-25 | no — not observed | Worker cut over (ADR 032, v2.6.12/13); awaiting 24h UR observation (shared gate w/ P040) |

## Parked

| ID   | Title                                                                   | Reason                                                                                                                                      | Parked since |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| P013 | Loader second run fails on cloud clusters                               | Cannot reproduce on supported config                                                                                                        | 2026-04-15   |
| P018 | Root `/` cache TTL too long                                             | Long-lived root cache is intentional per user direction                                                                                     | 2026-04-18   |
| P005 | TDD hook does not recognise Cucumber                                    | Blocked on upstream windyroad TDD plugin fix                                                                                                | 2026-04-19   |
| P016 | External comms posted without voice/tone check or risk assessment       | Parked pending process-gate design (VOICE-AND-TONE.md now exists)                                                                           | 2026-04-19   |
| P021 | `git push origin master` is not risk-gated — risk scorer advisory       | Parked pending hook design                                                                                                                  | 2026-04-19   |
| P024 | `wr-architect:agent` misses per-request performance / load implications | Parked governance tooling blind spot                                                                                                        | 2026-04-19   |
| P038 | Scale v2 back to steady-state sizing post-populate                      | Superseded by ADR 029 Phase 1 rollback decommission; permanently superseded if t3.small populate succeeds (re-attempt amendment 2026-07-06) | 2026-05-14   |

## Review notes (2026-04-19)

**Auto-transitioned Open → Known Error** (per review step 9b.10 — confirmed root cause + workaround documented):

- P005 — root cause in upstream windyroad TDD plugin confirmed; workaround (wrapper `.test.js` file) documented
- P006 — both integration approaches investigated and proven defunct/unversioned; manual-sync workaround documented
- P012 — root cause pinpointed to `service/address-service.js:790-799`; scrolling past noise documented
- P020 — root cause (no npm script) confirmed; `node --test <file>` manual workaround documented
- P021 — gap in enforcement confirmed; user-manual-inspection workaround documented
- P022 — CLAUDE.md gap confirmed; per-session reinforcement workaround documented

**WSJF changes from prior review**:

- P005: 8.0 → 16.0 (status ↑ Known Error)
- P006: 4.5 → 9.0 (status ↑ Known Error)
- P012: 4.0 → 8.0 (status ↑ Known Error)
- P020, P021, P022: new problems (added 2026-04-18) now ranked
- P019: new problem (added 2026-04-18) now ranked
- P023, P024: new problems (added 2026-04-18) now ranked

No priority (Impact × Likelihood) values changed — only Status multipliers applied.
