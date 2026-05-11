# Problem 035: Read-shadow soak validation has multiple blind spots — silent failures across creds, deletion, and firing

**Status**: Open
**Reported**: 2026-05-03
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Possible (3)
**Effort**: L
**WSJF**: 3.0

## Description

ADR 031 introduced read-shadow as the warming mechanism for ADR 029 cutover. The capability and its primary-path invariant work as designed in unit tests (15/15 green). In production it has surfaced **three independent silent-failure modes in 4 days**, each one only detected by ad-hoc operator probing during the diagnostic of a previous failure:

1. **Silent 401 on shadow auth (2026-04-28 to 2026-04-29)** — TFC's `var.elastic_password` workspace value drifted from EB's `ELASTIC_PASSWORD` env var. v2 was provisioned with TFC's value but EB sent EB's value as `ADDRESSR_SHADOW_PASSWORD`. Every shadow request returned 401. Soak appeared to be running because `mirrorRequest` was invoked at the expected rate; v2's `addressr.search.query_total` did not increment but no monitor noticed. Fixed in ADR 029 step-4 amendment 2026-04-29: distinct `var.elastic_v2_username` / `var.elastic_v2_password` decoupled from v1's.

2. **Silent index deletion on 2026-04-29 between 06:22 and 07:22 UTC** — v2's `addressr` index disappeared in a one-hour window with no GHA workflow runs in scope, no CloudTrail `opensearch.amazonaws.com` events, no addressr-server code path that drops the index, and no operator action recorded. AWS-managed automated snapshots from 2026-04-29 06:22:35 UTC contain the index; the 07:22 snapshot does not. Discovered 2026-05-02 during decouple-v2-creds release verification — i.e., 3 days after the deletion. Restored from the 2026-04-29T06:22 snapshot in this session; root cause unknown. Hypotheses (none confirmed):
   - AWS-managed background maintenance (would normally email an alert; user reports no email)
   - Manual deletion via OpenSearch Dashboards or curl by some external party (access policy at provision time was `Principal: AWS: "*"`)
   - Side-effect of the silent-401 retry loop exhausting some AWS-managed quota
   - Some addressr-server / loader code path I haven't identified that issues `DELETE /addressr` under specific conditions

3. **Silent shadow no-op despite correct config (2026-05-03)** — after the decouple-v2-creds deploy at 12:48 UTC and index restore from snapshot, all evidence said shadow should be firing: v2.5.2 deployed, `mirrorRequest` integration in published lib (verified), EB env vars set, v2 cluster GREEN, v2 auth works on direct curl. Three production probe queries with valid proxy auth got HTTP 200 from v1, confirming the search path executed. v2's `addressr.search.query_total` did not increment — `mirrorRequest` is either not being called or silently no-op'ing. EB log retrieval shows zero references to v2's hostname (`addressr4-p47mmzecvbwgpvrcxbo7ztjfyy`) anywhere. No way to introspect the running process's `process.env` from outside.

4. **Silent shadow auth-failure regression (discovered 2026-05-11)** — re-emergence of failure-mode 1. After the URL-encode-creds fix (v2.5.4) shipped 2026-05-03 ~10:48 UTC, `/debug/shadow-config` reported a healthy initial window (`attempts: 14, successes: 14, failures: 0, lastError: null`, v2 query rate ~0.52 q/s confirmed). Probing the same endpoint 8 days later returned: `attempts: 77129, successes: 2689, failures: 74440, lastError: { class: "AuthError", ts: "2026-05-11T06:58:34Z" }` — a **96.5% AuthError failure rate** during the very window the soak gate was meant to validate. The endpoint discovered the regression in one HTTP call; without it, the 48h time-gate would have passed silently and cutover would have proceeded against an un-soaked v2 cluster. The soak gate (per ADR 031 confirmation amendment 2026-04-29 — verify 2xx, not invocation count) is therefore **FAIL** for the 2026-05-03 → 2026-05-11 window. Cutover blocked. Root cause not yet investigated — hypotheses (none confirmed): TFC drift re-rotated the v2 master user password; the 2-instance bump triggered a creds reset; some out-of-band password change happened on v2 between the v2.5.4 deploy and now. Investigation is the next step before any further cutover attempt.

## Symptoms

- v2 OpenSearch `addressr.search.query_total` does not increment over windows where v1 receives confirmed production traffic (v1 counter increments visibly; v2 stays static)
- ADR 031 soak gate criteria (≥48h business traffic + p95 ≤ 1.5× v1) cannot be evaluated because the soak is not running
- ADR 029 cutover (step 7) is gated on the soak gate and therefore blocked
- The four failures share a pattern: **the running addressr-server's actual behaviour diverges from the configured intention with no observable failure surface that the operator routinely checks**. Three of four required ad-hoc diagnostic probing initiated for a different reason to surface; the fourth (2026-05-11 AuthError regression) was caught immediately by `/debug/shadow-config` — first concrete evidence that the P035 first-action endpoint mitigates the class of issue rather than just diagnosing instances of it.

## Workaround

For the immediate cutover work: restore the index from snapshot when it disappears (proven works); if shadow doesn'\''t fire after a deploy, redeploy or restart the EB app server (workarounds suggested by deployment shape — neither root-causes the underlying class of issue).

For the soak gate: do not declare the gate met until v2'\''s `addressr.search.query_total` is visibly incrementing at production query rate over a sustained window (manual operator check until P035 ships proper monitoring).

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (JTBD-400). Self-Hosted Operator (JTBD-201). Phase 1 cutover schedule slips while diagnosis happens.
- **Frequency**: realised at least 3 distinct times in the first 96 hours of the soak attempt. The pattern (silent failure during a window the operator presumes is healthy) is the persistent risk; the specific cause varies per realisation.
- **Severity**: Significant. Soak gate is the only mechanism that gates cutover from breaching ADR 029'\''s zero-outage guarantee; without trustworthy soak evidence, cutover either ships blind (high risk to JTBD-001) or stalls (release-pipeline cost).
- **Analytics**: AWS CloudWatch (when wired); v2 OpenSearch `_stats/search` per-index counter (today, manual probe only).

## Root Cause Analysis

### Why each individual failure was undetected

| Failure                            | Why no monitor caught it                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silent 401 (2026-04-28)            | ADR 031 soak gate gated on `mirrorRequest` invocation, not on shadow HTTP status. Patched in ADR 031 Confirmation amendment 2026-04-29: gate must verify 2xx, not invocation count. But the verification is operator-manual, not automated. |
| Silent index deletion (2026-04-29) | No automated check on v2'\''s `Docs.SearchableDocuments` or per-index `_count`. Snapshot rotation is the only mechanism that recorded the disappearance, and snapshots are not consulted unless the operator actively looks.                |
| Silent no-op (2026-05-03)          | No introspection capability on the running EB process'\''s actual `process.env`. EB'\''s stored config doesn'\''t guarantee the process sees the same values. No `/debug/shadow-config` or equivalent endpoint exists.                      |

### Why the class of issue exists

Read-shadow'\''s whole design is to be invisible on the happy path: fire-and-forget, error-swallowed, `debug('error')` only on failure, `debug('api')` is silent in production (`DEBUG=error` only). That is the right design for protecting the primary-path invariant, but it makes the operator-facing observability surface **near-zero**. The operator cannot tell whether shadow is working without going outside the normal failure-detection channels.

### Investigation Tasks

- [ ] **Add `/debug/shadow-config` endpoint** (or `/health` extension) that reports what shadow sees: env-var presence, client construction success, last-N shadow request outcomes. Self-explanatory operator-facing diagnostic. [Selected next action 2026-05-03.]
- [ ] **Add CloudWatch metric / alarm** on v2'\''s `addressr.search.query_total` rate. Threshold: rate < N q/s during expected business hours → alarm. Catches the silent-401 and silent-no-op failure modes automatically.
- [ ] **Add CloudWatch alarm on v2'\''s `Docs.SearchableDocuments` per index**. Threshold: < 1M for the `addressr` index → alarm. Catches the silent-deletion failure mode.
- [ ] **Ship the `/debug/shadow-config` endpoint via CI**, then use it post-deploy to verify shadow is firing before declaring soak start.
- [ ] **Root-cause the 2026-04-29 silent index deletion** if data is available. Possible avenues: AWS support ticket for management-event audit logs; `aws cloudtrail lookup-events` over a wider time window; check OpenSearch dashboard sign-in events for that window if access logs are enabled.
- [ ] **Document the "post-deploy soak verification" as a release runbook step**. The current ADR 031 soak gate is post-hoc (after 48h); the runbook gate should be post-deploy (within minutes) for the silent-no-op failure mode.

## Dependencies

- **Blocks**: (none — class-of-issue ticket; ADR 029 cutover gate depends on soak evidence quality but the cutover code itself is not blocked by P035)
- **Blocked by**: (none)
- **Composes with**: P028 (OpenSearch 1.3.20 version debt — drives ADR 029 which P035 protects)

## Related

- **ADR 029** (Two-phase blue/green OpenSearch upgrade) — soak gate blocks cutover until P035'\''s failure modes are diagnostically observable.
- **ADR 031** (Read-shadow for search-backend migrations) — Confirmation amendment 2026-04-29 closed the soak-validity check gap (verify 2xx, not invocation count) but the check is still operator-manual.
- **P028** (OpenSearch 1.3.20 version debt) — ADR 029 step 4 amendment 2026-04-29 fixed the cred-decouple aspect of P035 failure mode 1.
- **JTBD-201** (Validate a New Search Backend Before Cutover) — desired outcome "shadow target failure cannot impact the primary response" is preserved (verified — primary path returns 200 throughout); but a new outcome is implied by P035: "operator can detect when shadow target is not warming, before declaring soak met".
