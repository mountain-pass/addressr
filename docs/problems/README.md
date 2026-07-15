# Problem Backlog

> Last reviewed: 2026-07-15 **P049 captured** — wr-retrospective retro scripts (check-ask-hygiene / check-briefing-budgets / check-tickets-deferred-cause) lack ADR-049 bin shims in adopter repos; retro passes degrade fail-open (lightweight aside via /wr-itil:capture-problem).
> Run `/wr-itil:review-problems` to refresh.

## WSJF Rankings

Dev-work queue only. Verification Pending (`.verifying.md`, WSJF multiplier 0) and Parked (`.parked.md`, multiplier 0) tickets are excluded per ADR-022 — surfaced in their own sections below. Rows render **tier-first** (Tier 0 Critical-bypass [Severity Very High ≥17 OR security-classified OR incident-linked] → Tier 1 Inbound-reported → Tier 2 Internal), then within each tier by `(WSJF desc, Known-Error-first, Effort-divisor asc, Reported-date asc, ID asc)`. All tickets are Tier 2 (Origin internal; max Severity 16 < 17). <!-- REPORTED-FIRST-TIER-SOURCE: /wr-itil:work-problems SKILL.md Step 3 (ADR-076) -->

| WSJF | ID   | Title                                                                   | Severity     | Status      | Effort | Reported   | Origin   |
| ---- | ---- | ----------------------------------------------------------------------- | ------------ | ----------- | ------ | ---------- | -------- |
| 20.0 | P040 | Uptime Robot 401 alerts — Cloudflare Worker allowlist CIDR-match bug    | 10 (High)    | Known Error | S      | 2026-05-14 | internal |
| 12.0 | P019 | No deploy-time smoke check for root Link header rels                    | 6 (Medium)   | Known Error | S      | 2026-04-18 | internal |
| 12.0 | P036 | v2 shadow auth silently regressed (FGAC clobber) — ADR-033 fix shipped  | 12 (High)    | Known Error | M      | 2026-05-11 | internal |
| 9.0  | P006 | RapidAPI CI sync deferred                                               | 9 (Medium)   | Known Error | M      | 2026-04-15 | internal |
| 9.0  | P014 | Invalid address ID returns 500 not 404                                  | 9 (Medium)   | Known Error | M      | 2026-04-16 | internal |
| 8.0  | P004 | release:watch script reports false negative                             | 4 (Low)      | Known Error | S      | 2026-04-04 | internal |
| 8.0  | P030 | Dependabot reports 46 vulnerabilities on master                         | 16 (High)    | Open        | M      | 2026-04-21 | internal |
| 6.0  | P034 | addressr-loader's COVERED_STATES filter is case-sensitive               | 6 (Medium)   | Open        | S      | 2026-04-28 | internal |
| 6.0  | P044 | changesets/action swallows publish failure → deploy silently skips      | 6 (Medium)   | Open        | S      | 2026-05-25 | internal |
| 6.0  | P026 | Numeric fuzziness in bool_prefix inflates ranking                       | 12 (High)    | Open        | M      | 2026-04-19 | internal |
| 6.0  | P027 | Synonym expansion bypasses AUTO:5,8 fuzziness                           | 12 (High)    | Open        | M      | 2026-04-21 | internal |
| 4.5  | P032 | No CI perf regression detection — k6 stress profile is on-demand only   | 9 (Medium)   | Open        | M      | 2026-04-27 | internal |
| 4.0  | P047 | wr-risk-scorer mis-states appetite; STOPs on within-appetite score of 5 | 2 (Very Low) | Known Error | S      | 2026-07-15 | internal |
| 4.0  | P041 | `/wr-itil:capture-problem` halts on pre-existing README drift           | 4 (Low)      | Known Error | M      | 2026-05-14 | internal |
| 4.0  | P048 | external-comms marker hash-exactness forces re-review round-trips       | 4 (Low)      | Known Error | M      | 2026-07-15 | internal |
| 4.0  | P029 | Cucumber `will NOT include:` step crashes on v2 API responses           | 4 (Low)      | Open        | S      | 2026-04-21 | internal |
| 4.0  | P031 | `wr-architect:create-adr` skill does not auto-satisfy edit-gate hooks   | 4 (Low)      | Open        | S      | 2026-04-21 | internal |
| 4.0  | P049 | wr-retrospective retro scripts lack bin shims in adopter repos          | 4 (Low)      | Open        | S      | 2026-07-15 | internal |
| 3.0  | P025 | GitHub Actions using Node.js 20 runtime are deprecated                  | 6 (Medium)   | Open        | M      | 2026-04-19 | internal |
| 3.0  | P015 | Range-number addresses not findable by base number                      | 12 (High)    | Open        | L      | 2026-04-16 | internal |
| 3.0  | P035 | Read-shadow soak validation has multiple blind spots                    | 12 (High)    | Open        | L      | 2026-05-03 | internal |
| 2.5  | P023 | Cross-origin root `/` not browser-cached                                | 10 (High)    | Open        | L      | 2026-04-18 | internal |
| 2.0  | P039 | Decouple SaaS deployment from npm publish in release pipeline           | 4 (Low)      | Open        | M      | 2026-05-14 | internal |
| 1.5  | P043 | `wr-itil` SID-helper fallback picks subagent UUID in multi-agent sess   | 3 (Low)      | Open        | M      | 2026-05-14 | internal |
| 1.5  | P045 | RISK-POLICY 14-day staleness window conflicts with quarterly cadence    | 3 (Low)      | Open        | M      | 2026-07-06 | internal |
| 1.5  | P033 | Source-inspection tests are an anti-pattern in this codebase            | 6 (Medium)   | Open        | L      | 2026-04-28 | internal |
| 1.0  | P046 | wr-architect oversight-marker blocks confirms in multi-agent sessions   | 2 (Very Low) | Open        | M      | 2026-07-08 | internal |

## Verification Queue

Fix released, awaiting user verification (driven off `docs/problems/*.verifying.md` per ADR-022). Sorted by `Released date ASC`. <!-- VQ-SORT-DIRECTION: oldest-first per ADR-022 --> `Likely verified?` carries an evidence-first cell per P186. <!-- LIKELY-VERIFIED-CELL-SHAPE: evidence-based per P186 -->

| ID   | Title                                               | Released   | Likely verified?  | Notes                                                                                                          |
| ---- | --------------------------------------------------- | ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| P001 | Stale Dockerfile                                    | 2026-04-19 | no — not observed | Node 22-alpine base + `addressr-server-2` CMD (commit 1a68e6e); verify via local `docker build` — no CI signal |
| P042 | Version-control the Cloudflare Worker via Terraform | 2026-05-25 | no — not observed | Worker cut over (ADR 032, v2.6.12/13); shared UR-observation gate with P040                                    |

## Inbound Upstream Reports

_No inbound discovery pass has run yet (`docs/problems/.upstream-channels.json` not configured). Run `/wr-itil:review-problems` after configuring channels to poll._

## Parked

| ID   | Title                                                                   | Reason                                                                                                                    | Parked since |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ |
| P013 | Loader second run fails on cloud clusters                               | Cannot reproduce on supported config                                                                                      | 2026-04-15   |
| P018 | Root `/` cache TTL too long                                             | Long-lived root cache is intentional per user direction                                                                   | 2026-04-18   |
| P005 | TDD hook does not recognise Cucumber                                    | Blocked on upstream windyroad TDD plugin fix                                                                              | 2026-04-19   |
| P016 | External comms posted without voice/tone check or risk assessment       | Parked pending process-gate design (VOICE-AND-TONE.md now exists)                                                         | 2026-04-19   |
| P021 | `git push origin master` is not risk-gated — risk scorer advisory       | Parked pending hook design                                                                                                | 2026-04-19   |
| P024 | `wr-architect:agent` misses per-request performance / load implications | Parked governance tooling blind spot                                                                                      | 2026-04-19   |
| P038 | Scale v2 back to steady-state sizing post-populate                      | **Permanently superseded** (2026-07-15): v2 (2.19) domain decommissioned, production on 3.5 per ADR-035 — close candidate | 2026-05-14   |

## Review notes (2026-07-15)

**Closed** — P028 (OpenSearch 1.3.20 version debt): production migrated entirely off 1.3.x (Phase 1 → 2.19 on 2026-07-11, Phase 2 → 3.5 per ADR-035 accepted 2026-07-14; v1 `addressr3` decommissioned; `deploy/main.tf` on `OpenSearch_3.5`). The condition the ticket captures no longer holds. Fix released + verified in production → `.closed.md`.

**Auto-transitioned Open → Known Error** (confirmed root cause + documented workaround):

- P036 — FGAC master-user-clobber mechanism structurally removed by ADR-033 (IAM/SigV4, FGAC off), now in production. Close candidate pending no-recurrence confirmation on the FGAC-off domain.
- P041 — Step 0 halt-on-deferred-drift root cause documented; override/reconcile workaround.
- P047 — scorer prose vs `risk-gate.sh` boundary disagreement (`>threshold-1` vs `>threshold`) confirmed; trust-the-gate workaround.
- P048 — marker hash spans full message incl. trailers confirmed; re-review-with-trailers workaround.

**Corrected** — P014 was ranked Open (WSJF 4.5) in the prior README but its file is `.known-error.md` (Status: Known Error). Now ranked correctly as Known Error (WSJF 9.0).

**Re-rated from deferred** — P039 (2.0), P043 (1.5), P044 (6.0 ↑ from 1.5 — silent-green deploy skip under-ranked), P045 (1.5), P046 (1.0), plus the four transitioned above. All previously carried "deferred — re-rate at next review" placeholders.

**Relevance-close pass (Step 4.6)** — the `wr-itil-evaluate-relevance` evaluator flagged multiple CLOSE-CANDIDATEs on a `file-no-longer-exists` signal, but **every flagged file was verified present** in the repo (`src/waycharter-server.js`, `scripts/release-watch.sh`, `docs/decisions/013-docker-image.accepted.md`, `test/js/steps.js`, `test/k6/script.js`). All verdicts this pass were false positives — **no relevance-closes fired**. This is a latent risk: in AFK mode those clean CLOSE-CANDIDATEs would close live tickets silently. Worth an upstream `@windyroad/itil` report on the evaluator's path-extraction.

**Migration-completion review candidates** — P035 (shadow-soak blind spots) and parked P038 relate to the now-complete blue/green migration; P035's three named failure modes were migration-era and its urgency is reduced (P036's mechanism is gone; the `SearchableDocuments`-drop alarm now covers the index-deletion class). Left Open for the user's disposition rather than closed speculatively.
