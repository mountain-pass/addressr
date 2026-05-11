# Problem 036: v2 shadow auth silently regressed mid-soak

**Status**: Open
**Reported**: 2026-05-11
**Priority**: 12 (High) — Impact: Significant (4) x Likelihood: Likely (3) (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)

## Description

v2 shadow auth silently regressed mid-soak — `/debug/shadow-config` shows 96.5% AuthError failure rate at 2026-05-11T07:00Z after starting clean on 2026-05-03 (14/14 successes, 0 failures). Cluster is returning 401/403 on shadow auth despite v2.5.4 URL-encode-creds fix shipping and being verified post-deploy. Soak gate FAIL; ADR 029 cutover step 7 blocked until root cause known.

Live counters at 2026-05-11T06:59Z:

```json
{
  "hostSet": true,
  "credentialsSet": true,
  "clientConstructed": true,
  "attempts": 77129,
  "successes": 2689,
  "failures": 74440,
  "lastError": { "class": "AuthError", "ts": "2026-05-11T06:58:34Z" }
}
```

Initial post-v2.5.4 deploy window (2026-05-03 ~10:48 UTC) showed `attempts: 14, successes: 14, failures: 0` — healthy. Eight days later, AuthError dominates the failure mix. The cluster is responding (no ConnectionError), but rejecting the credentials addressr is sending.

Hypotheses (none confirmed):

1. **TFC drift re-rotated `var.elastic_v2_password`** — a subsequent `terraform apply` (release pipeline or manual plan) could have re-randomised the master user password without updating EB env vars in lockstep. This would mirror the original failure-mode 1 (P035) but for the new decoupled-credential surface.
2. **2-instance bump triggered a creds reset** — the OpenSearch instance-count bump completed after v2.5.4. If OpenSearch resets master user credentials on instance-count change, EB's stored password would now be stale.
3. **Out-of-band password change** — somebody (or some other workflow) updated v2 creds on one side of the seam (TFC, 1Password, GHA secrets, or directly on the cluster).

Discovered via the P035 first-action `/debug/shadow-config` endpoint — first concrete proof the class-of-issue mitigation works (rather than just diagnosing instances of it 3+ days post-hoc).

## Symptoms

- `/debug/shadow-config` reports `attempts: 77129, successes: 2689, failures: 74440` with `lastError.class: AuthError` at 2026-05-11T06:59Z (96.5% AuthError failure rate over the soak window)
- v2 cluster returns HTTP 401 "Authentication finally failed" on direct probe with both the EB-resident and 1P-stored credentials
- EB and 1P credentials are byte-identical (in-session sha256 comparison) — neither side of the EB↔1P seam drifted
- The cluster's master user password is what drifted, not what addressr sends

## Workaround

Rotate the v2 master user password by triggering a new terraform apply with a fresh `TF_VAR_elastic_v2_password`. The apply re-sets the OpenSearch domain's `master_user_password` AND writes the new value into EB's `ADDRESSR_SHADOW_PASSWORD` from the same source (deploy/main.tf:140 + 654 both source from var.elastic_v2_password). Then update the 1Password entry to match. Workflow:

1. Generate a fresh password (preserve "base64-derived may contain URL-reserved chars" property to stay covered by the v2.5.4 URL-encode fix's regression test)
2. Update GHA secret `TF_VAR_ELASTIC_V2_PASSWORD` (and `TF_VAR_elastic_v2_password` — both spellings present in workflow refs)
3. Land any release-triggering changeset to force the deploy step to fire (`if: steps.changesets.outputs.published == 'true'` gate)
4. Smoke-probe `/debug/shadow-config` post-deploy — expect `attempts >0, successes >0, failures=0, lastError.class: null`
5. Update 1Password entry "Addressr v2 OpenSearch" to the new password

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (JTBD-400); Self-Hosted Operator (JTBD-201) — soak gate FAIL means cutover decision can't be made.
- **Frequency**: continuous since (unknown date in the 2026-05-03 → 2026-05-11 window)
- **Severity**: Significant — blocks ADR 029 step 7 (cutover); v1 still serving production correctly so user-facing impact is zero
- **Analytics**: `/debug/shadow-config` live counters

## Root Cause Analysis

Investigation performed 2026-05-11 confirmed the cluster's master user password drifted independently of every credential plane we control.

**Evidence:**

| Check                                                                                      | Result                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| EB `ADDRESSR_SHADOW_PASSWORD` (via `aws elasticbeanstalk describe-configuration-settings`) | 33-char value present                                                                 |
| 1Password `Addressr v2 OpenSearch / password`                                              | 33-char value present                                                                 |
| EB password sha256 == 1P password sha256 (digests compared in-session, not committed)      | **TRUE** — values are byte-identical on both sides of the deploy seam                 |
| Direct curl to v2 `_cluster/health` with EB/1P password                                    | **HTTP 401** "Authentication finally failed"                                          |
| GHA release runs with deploy step in 2026-05-03 → 2026-05-11 window                        | 2 (both 2026-05-03 — v2.5.3 endpoint, v2.5.4 URL-encode fix); none after              |
| Dependabot dependency-bump PRs in window                                                   | 4 (May 7, 8, 9 × 2) — PR-builds only; did not trigger publish-conditional deploy step |
| EB env config changes since 2026-05-03 10:57 deploy                                        | **None** (EB events show only health-state changes, no config updates)                |
| CloudTrail `es.amazonaws.com` non-read events for `search-addressr4` in window             | **0** (4 ListTags events 2026-05-03; no UpdateDomainConfig, no master-user changes)   |

**Conclusion (with high confidence):**

The cluster's FGAC internal user password changed _inside_ the OpenSearch domain — invisible to CloudTrail because internal-user-password changes go through the OpenSearch REST API (`_plugins/_security/api/internalusers/elastic`), not the AWS control plane. None of the surfaces we control (TFC apply, EB env, GHA secret push, 1Password) initiated that change. This pattern mirrors P035 failure-mode 2 (the 2026-04-29 silent index deletion that also had no CloudTrail control-plane events) — both manifest as state-divergence inside the OpenSearch domain that the AWS-managed service does not surface to us.

Three remaining-but-unverifiable hypotheses for who/what changed it:

1. **AWS-internal automated maintenance** (unlikely; AWS-managed OpenSearch does not normally rotate FGAC master user passwords).
2. **A direct OpenSearch REST API call from somewhere outside our session record** — would need wider CloudTrail (read + management events combined) to verify, or OpenSearch audit logs (not currently enabled on this domain).
3. **A snapshot restore that included the `.opendistro_security` system index** — the only restore in this window was the 2026-05-02 addressr-index restore from 2026-04-29 snapshot, which restored only `indices: "addressr"`; the security index should NOT have been touched but this is worth re-verifying.

### Investigation Tasks

- [x] Re-rate Priority and Effort at next /wr-itil:review-problems
- [x] Check terraform-apply runs in GHA release history for the 2026-05-03 → 2026-05-11 window — none after 2026-05-03 10:57
- [x] Probe v2 cluster directly with 1Password's stored v2 password — **fails with HTTP 401**
- [x] Compare EB and 1P passwords — **byte-identical** (in-session sha256 digest comparison; digest not committed); both fail against cluster
- [x] CloudTrail lookup for `es.amazonaws.com` non-read events on `search-addressr4` — none
- [ ] Enable OpenSearch domain audit logs on `search-addressr4` so the next instance of this failure is fully traceable (P036 + P035 follow-up)
- [ ] Verify the 2026-05-02 snapshot restore did NOT include `.opendistro_security` — list snapshot indices via `_snapshot/cs-automated-enc/<id>` and confirm only `addressr` was specified
- [ ] Apply the rotate-and-sync workaround documented above to restore the soak window
- [ ] Once soak is healthy again: re-run the k6 v2-leg comparison and re-evaluate ADR 029 step 7 cutover

## Dependencies

- **Blocks**: ADR 029 step 7 (cutover) until soak gate can be re-established
- **Blocked by**: (none)
- **Composes with**: P035 (observability gap — this is failure-mode 4 of P035's class-of-issue); P028 (drives ADR 029 which P036 is interrupting)

## Related

- **P035** — observability gap; `/debug/shadow-config` endpoint shipped as P035 first action discovered P036
- **ADR 029** — two-phase blue/green; P036 blocks step 7 cutover
- **ADR 031** — read-shadow; P036 is a concrete failure of ADR 031's soak gate
- **ADR 030** — OpenSearch domain Terraform module; potential locus of root cause (TFC drift hypothesis)
