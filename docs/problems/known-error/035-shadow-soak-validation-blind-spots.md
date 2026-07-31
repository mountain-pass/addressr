# Problem 035: Read-shadow soak validation has multiple blind spots — silent failures across creds, deletion, and firing

**Status**: Known Error
**Reported**: 2026-05-03
**Priority**: 8 (Medium) — Impact: Significant (4) × Likelihood: Unlikely (2) — re-rated 2026-07-19 (review): ADR-035 migration complete (v2 decommissioned, prod on 3.5); the silent-failure class is dormant until the next search-backend migration, which per user direction must again be zero-outage blue/green
**Effort**: L — held 2026-07-25: three original investigation tasks disposed, but the remaining fix spans `src/read-shadow.js` + `.github/workflows/release.yml` + three governance amendments (ADR-024, ADR-031, JTBD-201)
**WSJF**: 4.0 — (8 × 2.0) / 4 — was 2.0; Open → Known Error status multiplier 1.0 → 2.0 on the 2026-07-25 investigation

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

### Blind-spot inventory (2026-07-25 investigation)

The `/debug/shadow-config` endpoint shipped and closed the worst of the class — it caught the 2026-05-11 AuthError regression in one HTTP call. This pass audited what the endpoint and its CI gate still cannot see. All findings verified by reading the code; file:line evidence below.

**BS-1 — Counters are cumulative-since-boot; there is no last-success timestamp.** `src/read-shadow.js:68-73` declares monotonic module-scoped counters; `src/read-shadow.js:299-311` (`getShadowStatus`) returns them raw. A single poll cannot distinguish "shadow broke five minutes ago" from "shadow blipped eight days ago and recovered" — the lifetime ratio is the same. `lastError.ts` records the recency of the last _failure_ only; there is no corresponding success timestamp, so "is it warming **right now**" is unanswerable from one observation. The 2026-05-11 probe read `attempts: 77129, successes: 2689, failures: 74440` and was interpretable only because the failure ratio was extreme. Invert the window order — long healthy period, recent-onset break — and the identical endpoint reads healthy.

**BS-2 — The accounting invariant `attempts === successes + failures + in-flight` is violated in both directions**, so the counters cannot be used as a self-checksum:

- `src/read-shadow.js:216-221` — a client-construction throw calls `swallowError()` (`failures += 1`) but `shadowAttempts += 1` sits at `:225`, _after_ the try/catch. Failures can therefore exceed attempts. This is exactly the shape of the 2026-05-03 URL-encode-creds bug (`new Client()` throwing synchronously on a `/`-bearing password): the operator would have read `attempts: 0, failures: N`, and the natural reading of `attempts: 0` — "shadow isn't being invoked" — points at the wrong diagnosis (missing config rather than a throwing constructor).

  **Reporting fidelity is inversely proportional to severity, which is the part that makes this worth fixing rather than documenting.** A shadow that cannot construct its client is 100% dead — the worst case there is — and it is the _one_ case that reports `attempts: 0`, which is indistinguishable at a glance from a shadow that was simply never invoked. Every _less_ severe failure (network, auth, timeout) happens after construction and therefore reports `attempts > 0` correctly. The endpoint is least trustworthy exactly where the outage is most total.

  It also breaks the natural operator heuristic. "Is it mirroring?" is `successes / attempts`, and with `attempts: 0` that is a divide-by-zero or a silent `NaN` depending on the tool. The one signal that _is_ honest here — a large `failures` count — is the one an operator computing a ratio is least likely to look at directly.

  **First non-synthetic sighting, 2026-07-31.** A local server under load read `attempts: 0, successes: 0, failures: 3402, lastError.class: UnknownError` while measuring the ADR-033 primary-path invariant for the P069 blue/green soak. All prior BS-2 evidence was code-read plus the retrospective 2026-05-03 inference. To be explicit: the construction failure that produced this reading was local-environment-specific and is **not** itself a reported defect — the counter arithmetic is. The reading is recorded because it is what surfaced BS-2 in the field, and because it took a live-shape misdiagnosis (the reading was initially taken at face value as "the mirror is failing", which was true, and as "it is not being attempted", which was false) before the code was re-read.

  **Re-rating input.** This ticket's Likelihood 2 (Unlikely) rests on "the silent-failure class is dormant until the next search-backend migration." That migration is no longer hypothetical: the ADR-041 read-shadow soak went live 2026-07-31. Raise at the next `/wr-itil:review-problems` rather than re-scoring here.

- `src/read-shadow.js:240-243` — when `client[method]()` returns a non-thenable, `attempts` has already incremented but neither `successes` nor `failures` ever will. The request reads as permanently in-flight.

**BS-3 — The client cache cannot survive a credential rotation, and the endpoint reports healthy throughout.** `clientFingerprint` (`src/read-shadow.js:123-131`, comment at `:122`) reduces credentials to a presence bit (`'+auth'` / `'-auth'`). A same-username password rotation therefore yields an identical fingerprint, so `getShadowClient` returns the stale cached client at `:141-143` for the process lifetime. `clientConstructed` (`:305`) is `!!cachedClient` — a module-lifetime latch, never cleared on failure. Net: shadow cannot pick up a rotated credential without a process restart, while `credentialsSet: true` + `clientConstructed: true` keep asserting the config is fine.

This does **not** contradict P036's root-cause attribution (FGAC clobber, structurally removed by ADR-033 FGAC-off). ADR-033 removed the clobber _source_; the "cannot recover from any credential rotation without a restart" behaviour survives it independently. Recorded here as a distinct latent defect, not a competing cause — see P036.

**BS-4 — Counters are per-instance behind a multi-instance ALB, with no instance identity in the response.** `src/read-shadow.js:63-64` defers the cross-instance surface to CloudWatch alarms. `getShadowStatus` (`:299-311`) returns no instance or boot marker, so a single `curl` samples one of the two EB instances at random and repeated polls cannot establish coverage. An instance whose shadow is dead stays invisible with ~50% probability per poll, and nothing in the response tells the operator they re-sampled the same one.

**BS-5 — The CI smoke gate asserts response _shape_, not soak _health_.** `.github/workflows/release.yml:243-275` asserts `hostSet == false` and that `lastError.class` is a member of the closed enum. It never asserts `successes > 0` or `failures == 0`. `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md:14` states the real check — "Verify `/debug/shadow-config` shows `successes>0, failures=0` (2xx) before starting the soak clock" — but as operator prose, not as an assertion. Worse, `release.yml:268-274` accepts `AuthError` as a _passing_ value. **The 2026-05-11 96.5%-AuthError regression would have passed this smoke check green.** The gate that P035 shipped to close the class would not have caught the failure P035's own failure-mode 4 records.

**BS-6 — The expected-`hostSet` literal is hand-edited per migration with no coupling to the deployed config.** `.github/workflows/release.yml:263-267` hardcodes the expected value; the comment records it being flipped true for the 2026-07-13 soak and back to false at cutover. Nothing ties it to `deploy/main.tf`'s actual `ADDRESSR_SHADOW_*` settings. The dangerous direction is silent: shadow _intended_ enabled, `main.tf` missing the vars, assertion left at `false` → the release passes green while nothing is warming. That is the 2026-05-03 failure-mode 3 with the guard facing the wrong way.

**BS-7 — not a defect; a deliberate omission, recorded to stop it being re-litigated.** `/debug/shadow-config` is registered at `src/waycharter-server.js:952-963` but the root resource advertises only `health` and `api-docs` (`:969-976`). Advertising an unauthenticated operator-diagnostic endpoint in the HATEOAS discovery document every client fetches would cut against the minimal-disclosure posture of ADR-024 and the debug-endpoint policy. Leaving it unlisted is correct. Changing it would be an ADR-012 + ADR-024 decision, not an implementation detail.

**BS-8 — deletion detection is out of scope of this inventory and tracked separately.** BS-1..BS-6 are all shadow-_firing_-scoped. The 2026-04-29 silent index deletion is a data-_availability_ failure: if the same undetected-deletion mechanism ever touched the primary index it would break JTBD-100 / JTBD-101 with no observability surface at all. That detector now exists (`aws_cloudwatch_metric_alarm.v3_searchable_documents_drop`, 15M floor — investigation task 3 below); recorded here so the concern is not lost when this ticket closes.

**Governing constraint on any response-shape fix.** The debug-endpoint policy lives _only_ as a code comment at `src/proxy-auth.js:15-26`. Rule 2 bounds the body to booleans, integers, ISO timestamps, and closed enums — no hostnames, IPs, or ARNs. This **permits BS-1's success timestamp by construction** and **constrains BS-4's instance identity** (an EB instance ID is infrastructure identity; an opaque per-boot UUID is not). Rule 3 requires every debug endpoint to carry a snapshot test in `test/js/__tests__/proxy-auth.test.mjs` covering both the exempt path and a must-NOT-exempt case — any response-shape change must re-check it.

### Investigation Tasks

- [x] **Add `/debug/shadow-config` endpoint** that reports what shadow sees: env-var presence, client construction success, last-N shadow request outcomes. — Shipped. `getShadowStatus` at `src/read-shadow.js:299-311`, registered at `src/waycharter-server.js:952-963`, allowlisted at `src/proxy-auth.js:27`. Proved its value on 2026-05-11 by surfacing the AuthError regression in one call.
- [x] **Ship the `/debug/shadow-config` endpoint via CI**, then use it post-deploy to verify shadow is firing before declaring soak start. — Shipped; probed on every release at `.github/workflows/release.yml:243-275`. **Partial**: the probe asserts shape, not health — see BS-5.
- [x] **Add CloudWatch alarm on `Docs.SearchableDocuments` per index**. — Satisfied, retargeted v2 → v3: `aws_cloudwatch_metric_alarm.v3_searchable_documents_drop` armed at the 15M floor per ADR-035 execution item 3, state OK.
- [x] **Root-cause the 2026-04-29 silent index deletion** — **closed, evidence unrecoverable.** `addressr4` was destroyed 2026-07-14 (ADR-035 execution item 5) and the CloudTrail 90-day lookback over the 2026-04-29 window expires ~2026-07-28. No avenue survives. Recurrence detection is now owned by P036 (in Verification Pending, scope includes "verify no clobber/index-deletion recurs on the FGAC-off domain") plus the `Docs.SearchableDocuments` alarm above.
- [ ] **Add CloudWatch metric / alarm on the primary domain's `addressr.search.query_total` rate.** Threshold: rate < N q/s during expected business hours → alarm. Catches the silent-401 and silent-no-op failure modes automatically. Deferred — deploy-config change, and dormant until the next migration re-enables shadow.
- [ ] **Document the "post-deploy soak verification" as a release runbook step.** The ADR 031 soak gate is post-hoc (after 48h); the runbook gate should be post-deploy (within minutes) for the silent-no-op failure mode. Partly addressed by the cross-reference now at `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md:14`; the assertion itself is BS-5.

## Fix Strategy

Sequenced so the cheap, un-gated work can ship without waiting on the three items that need a human decision. Nothing here was implemented on 2026-07-25 — this pass was investigation only.

**Tier 1 — bounded, safe, no direction needed.**

1. **Fix the BS-2 accounting invariant** (`src/read-shadow.js`): increment `shadowAttempts` in the construction-throw catch at `:218-220`, and give the non-thenable path at `:240-243` a terminal outcome. Un-skip nothing — the characterisation test added 2026-07-25 (`test/js/__tests__/read-shadow.test.mjs`, "P035 BS-2") pins the _current_ buggy values and will fail loudly the day this fix lands, which is the signal to update it to the corrected values.
2. **Add a last-success timestamp** to `getShadowStatus` (BS-1). Permitted outright by debug-endpoint-policy Rule 2 (ISO timestamps are on the allowed list), so no direction is needed. With `lastError.ts` and `lastSuccess.ts` side by side, a single poll answers "which happened more recently" — the freshness question — without a ring buffer or a rate calculation. Re-check the Rule 3 snapshot test in `proxy-auth.test.mjs`.

Both touch `mirrorRequest`, which is on the `/addresses` hot path, so they will trigger a full per-request architect review against ADR 031's ≤1 ms p95 primary-path invariant. Counter arithmetic and a `Date.now()` on the settle path are well inside it, but the review is not optional.

**Tier 2 — needs a user decision before implementing** (queued as outstanding questions 2026-07-25):

3. **BS-3 credential-sensitive cache fingerprint.** Including a credential hash in `clientFingerprint` makes shadow self-heal on rotation, but adds per-`mirrorRequest` work on the search hot path — squarely an ADR 031 primary-path-invariant tradeoff, and the kind of high-traffic-endpoint change that must be asked about rather than assumed negligible.
4. **BS-4 instance identity in the response.** An opaque per-boot UUID satisfies debug-endpoint-policy Rule 2; an EB instance ID does not. Choosing between them is an information-disclosure decision on an unauthenticated endpoint.
5. **BS-5 / BS-6 CI gate.** Fix sites are `.github/workflows/release.yml:243-275` and `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md:14`. Make the gate assert soak _health_ (`successes > 0`, `failures == 0`, `lastError == null`) when shadow is enabled, and derive the expected `hostSet` from `deploy/main.tf` rather than a hand-edited literal. Release-gate config, so out of scope for an investigation iteration.

**Tier 3 — governance amendments this investigation surfaced.**

6. **ADR-024 amendment — blocking for item 4, documentation debt for item 2.** Item 2 adds a field of a kind debug-endpoint-policy Rule 2 already permits (ISO timestamp) to an endpoint already on the allowlist, so it widens nothing and is shippable without waiting. Item 4 is the opposite: it turns on a disclosure question the allowlist entry was never reviewed for, so the amendment must land first. The allowlist widened from the two entries ADR-024 names as "a closed list ... to prevent accidental widening" (`docs/decisions/024-*.md:72`) to three, when `/debug/shadow-config` landed. The code itself records the deferral and the consolidation path (`src/proxy-auth.js:15-17`). The three-rule debug-endpoint policy should move out of the code comment and into the ADR at the same time.
7. **ADR-031 reassessment has been triggered.** Its criterion 1 — "the next major search-engine migration completes (Phase 2 2.x → 3.x): if read-shadow proves valuable a second time, promote to `accepted`" — fired when ADR-035 execution item 4 recorded the v3 cutover gated on the read-shadow soak. ADR-031 is still `proposed`. This blind-spot inventory is the material that reassessment needs for its Consequences and Confirmation sections.
8. **JTBD-201 outcome amendment.** The outcome as written ("A **documented** soak gate ... before cutover ships") is satisfied by prose — which BS-5 proves is insufficient, since the 2026-05-11 window met it and would still have passed CI green. A problem ticket records a defect; the outcome definition belongs on the job, or the gap vanishes when this ticket closes. Requires re-ratification via `/wr-jtbd:confirm-jobs-and-personas`, so it is queued rather than edited.

## Dependencies

- **Blocks**: (none — class-of-issue ticket; ADR 029 cutover gate depends on soak evidence quality but the cutover code itself is not blocked by P035)
- **Blocked by**: (none)
- **Composes with**: P028 (OpenSearch 1.3.20 version debt — drives ADR 029 which P035 protects)

## Related

- **ADR 029** (Two-phase blue/green OpenSearch upgrade) — soak gate blocks cutover until P035'\''s failure modes are diagnostically observable.
- **ADR 031** (Read-shadow for search-backend migrations) — Confirmation amendment 2026-04-29 closed the soak-validity check gap (verify 2xx, not invocation count) but the check is still operator-manual.
- **P028** (OpenSearch 1.3.20 version debt) — ADR 029 step 4 amendment 2026-04-29 fixed the cred-decouple aspect of P035 failure mode 1.
- **JTBD-201** (Validate a New Search Backend Before Cutover) — desired outcome "shadow target failure cannot impact the primary response" is preserved (verified — primary path returns 200 throughout); but a new outcome is implied by P035: "operator can detect when shadow target is not warming, before declaring soak met". Fix Strategy item 8 proposes the amendment.
- **P036** (v2 shadow auth silently regressed — FGAC clobber) — in Verification Pending. Owns the recurrence check for the 2026-04-29 silent index deletion now that that investigation is closed evidence-unrecoverable. BS-3 records a _distinct_ latent defect on the same failure surface, not a competing root cause.
- **ADR 024** (Origin gateway auth-header enforcement) — its named-closed allowlist was widened to include `/debug/shadow-config` without amendment (`src/proxy-auth.js:15-17` records the deferral). Fix Strategy item 6.
- **ADR 035** (OpenSearch 3.5 upgrade) — Phase 2 cutover 2026-07-14 decommissioned `addressr4`, which is why the failure-mode-2 evidence is unrecoverable and why the class is dormant until the next migration.
- **JTBD-100 / JTBD-101** (Data Quality Analyst) — reachable by the failure-mode-2 deletion class if it ever touched the primary index; see BS-8.
