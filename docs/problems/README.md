# Problem Backlog

> Last reviewed: 2026-07-20 **P056 known error → parked (upstream-blocked)** — wr-itil SKILL.md bodies exceed the ADR-054 runtime budget; breach re-verified live at park time (installed 0.59.1 `work-problems/SKILL.md` = 245,245 bytes, exact match to the 2026-07-18 analyze-context measurement); no adopter-side trim possible (bodies ship in the plugin cache), on-demand-load workaround documented; upstream windyroad/agent-plugins#367 open, 0 comments, unacknowledged; upstream lifecycle comment reconciled-and-skipped per the P060 already-communicated-at-filing workaround; fix locus is `@windyroad/itil` REFERENCE.md split per ADR-054/ADR-038 (via /wr-itil:manage-problem AFK iter)
> Run `/wr-itil:review-problems` to refresh.

## WSJF Rankings

Dev-work queue only. Verification Pending (`.verifying.md`, WSJF multiplier 0) and Parked (`.parked.md`, multiplier 0) tickets are excluded per ADR-022 — surfaced in their own sections below. Rows render **tier-first** (Tier 0 Critical-bypass [Severity Very High ≥17 OR security-classified OR incident-linked] → Tier 1 Inbound-reported → Tier 2 Internal), then within each tier by `(WSJF desc, Known-Error-first, Effort-divisor asc, Reported-date asc, ID asc)`. All tickets are Tier 2 (Origin internal; max Severity 9 < 17). <!-- REPORTED-FIRST-TIER-SOURCE: /wr-itil:work-problems SKILL.md Step 3 (ADR-076) -->

| WSJF | ID   | Title                                                                 | Severity     | Status      | Effort | Reported   | Origin   |
| ---- | ---- | --------------------------------------------------------------------- | ------------ | ----------- | ------ | ---------- | -------- |
| 9.0  | P006 | RapidAPI CI sync deferred                                             | 9 (Medium)   | Known Error | M      | 2026-04-15 | internal |
| 8.0  | P015 | Range-number addresses not findable by base number                    | 4 (Low)      | Known Error | S      | 2026-04-16 | internal |
| 8.0  | P031 | `wr-architect:create-adr` skill does not auto-satisfy edit-gate hooks | 4 (Low)      | Known Error | S      | 2026-04-21 | internal |
| 4.5  | P032 | No CI perf regression detection — k6 stress profile is on-demand only | 9 (Medium)   | Open        | M      | 2026-04-27 | internal |
| 4.0  | P041 | `/wr-itil:capture-problem` halts on pre-existing README drift         | 4 (Low)      | Known Error | M      | 2026-05-14 | internal |
| 4.0  | P059 | wr-itil fix-time RFC authoring contract skew — Tasks vs stories       | 4 (Low)      | Known Error | M      | 2026-07-19 | internal |
| 3.0  | P045 | RISK-POLICY 14-day staleness window conflicts with quarterly cadence  | 3 (Low)      | Known Error | M      | 2026-07-06 | internal |
| 3.0  | P050 | Stale-Open tickets after fix ships — no ADR-022 transition-fold check | 6 (Medium)   | Open        | M      | 2026-07-16 | internal |
| 2.5  | P023 | Cross-origin root `/` not browser-cached                              | 10 (High)    | Open        | L      | 2026-04-18 | internal |
| 2.0  | P039 | Decouple SaaS deployment from npm publish in release pipeline         | 4 (Low)      | Open        | M      | 2026-05-14 | internal |
| 2.0  | P055 | Migrate Docker image from Alpine to Distroless (supersedes ADR-013)   | 4 (Low)      | Open        | M      | 2026-07-18 | internal |
| 2.0  | P057 | Relevance-close evaluator misses platform-version-rooted tickets      | 4 (Low)      | Open        | M      | 2026-07-19 | internal |
| 2.0  | P061 | work-problems iter briefing carries another ticket's evaluator caveat | 4 (Low)      | Open        | M      | 2026-07-19 | internal |
| 2.0  | P035 | Read-shadow soak validation has multiple blind spots                  | 8 (Medium)   | Open        | L      | 2026-05-03 | internal |
| 1.5  | P033 | Source-inspection tests are an anti-pattern in this codebase          | 6 (Medium)   | Open        | L      | 2026-04-28 | internal |
| 1.0  | P046 | wr-architect oversight-marker blocks confirms in multi-agent sessions | 2 (Very Low) | Open        | M      | 2026-07-08 | internal |

## Verification Queue

Fix released, awaiting user verification (driven off `docs/problems/verifying/*.md` per ADR-022). Sorted by `Released date ASC`. <!-- VQ-SORT-DIRECTION: oldest-first per ADR-022 --> `Likely verified?` carries an evidence-first cell per P186. <!-- LIKELY-VERIFIED-CELL-SHAPE: evidence-based per P186 -->

| ID   | Title                                                            | Released   | Likely verified?  | Notes                                                                                                                                                                                                                                      |
| ---- | ---------------------------------------------------------------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P001 | Stale Dockerfile                                                 | 2026-04-19 | no — not observed | Node 22-alpine base + `addressr-server-2` CMD (commit 1a68e6e); verify via local `docker build` — no CI signal. Note: P055 (Distroless migration) would supersede this base-image state if worked first                                    |
| P004 | release:watch script reports false negative                      | 2026-04-19 | no — not observed | Step-level query fix (commit e800b05); verify release:watch reports correctly on next release                                                                                                                                              |
| P014 | Invalid address ID returns 500 instead of 404                    | 2026-04-19 | no — not observed | 404-not-500 error-handling fix (commit fda4e3b); verify an invalid address ID returns HTTP 404. 2026-07-19 sweep probe via MCP addressr blocked (403 key-not-subscribed at the RapidAPI gateway) — needs a subscribed-key or backend probe |
| P019 | No deploy-time smoke check for root Link header rels             | 2026-04-19 | no — not observed | curl+grep rel probe in release.yml "Smoke test production" (commit 98a0ca9, no changeset — workflow-only); verify via green probe on next published release (step only fires on publish; recent runs were docs-only)                       |
| P040 | Uptime Robot 401 alerts — worker CIDR-match bug + UR IP drift    | 2026-05-25 | no — not observed | CIDR matcher + re-synced safeIps live via P042 cutover (3969b9e); session probe green, zero UR IP drift (206/206); verify UR dashboard shows no 401 alerts                                                                                 |
| P042 | Version-control the Cloudflare Worker via Terraform              | 2026-05-25 | no — not observed | Worker cut over (ADR 032, v2.6.12/13); shared UR-observation gate with P040                                                                                                                                                                |
| P036 | v2 shadow auth silently regressed (FGAC clobber)                 | 2026-07-15 | no — not observed | FGAC clobber structurally removed — ADR-033 IAM/SigV4 FGAC-off in production (ADR-035); verify no clobber/index-deletion recurs on the FGAC-off domain                                                                                     |
| P034 | addressr-loader's COVERED_STATES filter is case-sensitive        | 2026-07-16 | no — not observed | Case-insensitive filter + fail-loud zero-match guard (RFC-001); ships next publish; verify via a lowercase COVERED_STATES populate loading real docs                                                                                       |
| P051 | release:watch stalls on release-PR action_required approval gate | 2026-07-18 | no — not observed | Step 1b in `scripts/release-watch.sh` auto-approves the release-PR run, SHA-bound to the PR head (commit 4622682, master push, no changeset). Verify next release no longer times out at "Waiting for build check"                         |
| P025 | GitHub Actions using Node.js 20 runtime are deprecated           | 2026-07-19 | no — not observed | Five Node 20/16-era pins bumped to Node 24 builds per RFC-005. Partial evidence 2026-07-19 sweep: release.yml run 29676393589 had **zero** deprecation annotations on release + build-and-test jobs; reusable-update.yml has not run yet   |

## Inbound Upstream Reports

_No inbound discovery pass has run yet (`docs/problems/.upstream-channels.json` not configured). The 2026-07-19 AFK sweep queued a config-direction question per ADR-013 Rule 6 — configure channels or write the empty-channels stub to settle it._

## Parked

| ID   | Title                                                                       | Reason                                                                                                                                                                                 | Parked since |
| ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| P013 | Loader second run fails on cloud clusters                                   | Cannot reproduce on supported config                                                                                                                                                   | 2026-04-15   |
| P018 | Root `/` cache TTL too long                                                 | Long-lived root cache is intentional per user direction                                                                                                                                | 2026-04-18   |
| P005 | TDD hook does not recognise Cucumber                                        | Blocked on upstream windyroad TDD plugin fix                                                                                                                                           | 2026-04-19   |
| P016 | External comms posted without voice/tone check or risk assessment           | Parked pending process-gate design (VOICE-AND-TONE.md now exists)                                                                                                                      | 2026-04-19   |
| P021 | `git push origin master` is not risk-gated — risk scorer advisory           | Parked pending hook design                                                                                                                                                             | 2026-04-19   |
| P024 | `wr-architect:agent` misses per-request performance / load implications     | Parked governance tooling blind spot                                                                                                                                                   | 2026-04-19   |
| P038 | Scale v2 back to steady-state sizing post-populate                          | **Permanently superseded** (2026-07-15): v2 (2.19) domain decommissioned, production on 3.5 per ADR-035 — close candidate                                                              | 2026-05-14   |
| P052 | red-master push guard blocks the CI-fix commit that would green it          | Upstream-blocked: fix belongs in `@windyroad/risk-scorer` `check_ci_status` (windyroad/agent-plugins#360 open)                                                                         | 2026-07-19   |
| P048 | external-comms marker hash-exactness forces re-review round-trips           | Upstream-blocked: marker-key construction lives in `@windyroad/risk-scorer` external-comms hook (windyroad/agent-plugins#361 open)                                                     | 2026-07-19   |
| P049 | wr-retrospective retro scripts lack bin shims in adopter repos              | Upstream-blocked: fix is three ADR-049 shims + SKILL reword in `@windyroad/wr-retrospective` (windyroad/agent-plugins#362 open)                                                        | 2026-07-19   |
| P058 | `wr-risk-scorer-restage-commit` bypasses external-comms commit-message gate | Upstream-blocked: gate surface regex + helper live in `@windyroad/risk-scorer` (windyroad/agent-plugins#368 open)                                                                      | 2026-07-19   |
| P060 | `wr-itil:update-upstream` O→KE comment restates issue body (filing current) | Upstream-blocked: fix is an already-communicated-at-filing branch in `@windyroad/itil` update-upstream Step 3 (windyroad/agent-plugins#369 open)                                       | 2026-07-19   |
| P053 | wr-risk-scorer scorer defers to policy prose over gate numeric at 5         | Upstream-blocked: scorer prose-deference + update-policy prose live in `@windyroad/risk-scorer` (windyroad/agent-plugins#365 open); local RISK-POLICY.md wording workaround applied    | 2026-07-19   |
| P054 | wr-risk-scorer label bands disagree (skill 3-5 Low vs validator 5-9)        | Upstream-blocked: band reconciliation lives in `@windyroad/risk-scorer` (windyroad/agent-plugins#366 open); split re-verified in 0.17.0; local policy carries validator-accepted bands | 2026-07-19   |
| P056 | wr-itil SKILL.md bodies exceed ADR-054 runtime budget (work-problems 245KB) | Upstream-blocked: REFERENCE.md split lives in `@windyroad/itil` (windyroad/agent-plugins#367 open); breach re-verified in 0.59.1; on-demand-load workaround documented                 | 2026-07-20   |

## Review notes (2026-07-19 mid-loop AFK sweep)

**Closed on verification evidence (Step 4 Bucket 1, ADR-044 framework-mediated; recovery for each: `/wr-itil:transition-problem <NNN> known-error`)**:

- **P029** (Cucumber `will NOT include:` v2 crash) — recorded condition "CI green on next push" observed: build-and-test (2.19.5) + (3.5.0) green on release.yml run 29676393589, four consecutive green runs since fix commit 2fc5423.
- **P030** (Dependabot 46 vulnerabilities) — recorded condition "banner clears" observed: `dependabot/alerts?state=open` API returned 0 open alerts after multiple post-v3.0.0/v3.0.1 pushes.
- **P044** (changesets/action swallows publish failure) — recorded condition "step passes green on next release run" observed: the P044 fail-loud step ran `success` on run 29676393589. Residual noted in the ticket: the failure-detection leg is only exercised by a real swallowed failure.

**Relevance-closed (Step 4.6)**: **P043** (wr-itil SID-helper picks subagent UUID) — the evaluator's `file-no-longer-exists` cite is the known repo-external false-positive class (paths live in the upstream plugin), so the close rests on verified upstream evidence: wr-itil 0.59.1 `session-id.sh` now fans marker writes across the full candidate-SID set (24h mtime window), structurally removing the single-wrong-SID pick; zero create-gate denies across this session's multi-agent captures (P057/P059/P060). Reversible via `git revert`.

**Auto-transitioned Open → Known Error** (confirmed root cause + documented workaround): P015 (fix shipped v2.3.0; remaining work is #367 reporter-case verification + close — see below), P045 (hook hardcode confirmed; date-bump workaround), P053, P054, P056 (root causes confirmed 2026-07-18, upstream-reported #365/#366/#367), P059 (SKILL-prose contradiction, twice corroborated), P060 (missing already-communicated branch confirmed at SKILL source).

**Re-rated**: P015 12→4 + Effort L→S (ADR 026 shipped, smoke green on all three #367 cases, P026 ranking battery clean — this is now a verify-and-close errand ranked #2 so the next iteration finishes it and answers issue #367); P035 12→8 (ADR-035 migration complete; silent-failure class dormant until the next blue/green backend migration); P050 4→6 (second confirmed multi-week stale-transition occurrence: P026 ~3 months, P040 ~54 days).

**Caveated CLOSE-CANDIDATEs left open for maintainer confirmation** (all `multi-phase-mixed-progress`; evaluator shapes in parentheses): P015 (driver P007 closed), P023 (driver P017 closed), P032 (driver P028 closed), P033 (references an unwritten README path — future work, weak cite), P035 (driver P028 closed), P039 (ADR-029 confirmed), P041 (ADR-032 confirmed — but the halt was re-verified live in 0.59.1 on 2026-07-18, so this candidate looks wrong), P046 (junk cite: truncated path `docs/decisions/029-...md`). Note the evaluator's driver/ADR shapes keyed on _related_ artefacts, not fix evidence — treat these verdicts sceptically at the next interactive review.

**Blocked on user**: P006 (top of queue, WSJF 9.0) cannot start — `RAPIDAPI_OWNER_ID` / `RAPIDAPI_KEY` secrets absent and the GraphQL Platform API subscription is an account-level action (queued since 2026-07-19). P031 carries a queued shim-vs-accept decision.

**Step 4.5 inbound discovery**: skipped — `docs/problems/.upstream-channels.json` absent; config-direction question queued per ADR-013 Rule 6 (bootstrap channels, or decline permanently via the empty-channels stub).
