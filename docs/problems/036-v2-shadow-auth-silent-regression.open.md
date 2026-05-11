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

(deferred to investigation)

## Workaround

(deferred to investigation — likely rotate-and-sync the v2 master password explicitly through TFC → EB → `/debug/shadow-config` verify)

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (JTBD-400); Self-Hosted Operator (JTBD-201) — soak gate FAIL means cutover decision can't be made.
- **Frequency**: continuous since (unknown date in the 2026-05-03 → 2026-05-11 window)
- **Severity**: Significant — blocks ADR 029 step 7 (cutover); v1 still serving production correctly so user-facing impact is zero
- **Analytics**: `/debug/shadow-config` live counters

## Root Cause Analysis

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] Check terraform-apply runs in GHA release history for the 2026-05-03 → 2026-05-11 window
- [ ] Probe v2 cluster directly with 1Password's stored v2 password (eliminate "cluster password drifted" hypothesis)
- [ ] Probe v2 cluster with EB's current `ADDRESSR_SHADOW_PASSWORD` (eliminate "EB password is wrong" hypothesis)
- [ ] If creds in 1P work but EB's don't → which side drifted, and what's the resync procedure?
- [ ] Once root cause known: ship a fix + CloudWatch alarm to catch the next instance (P035 follow-up task already names CW alarms)
- [ ] Create reproduction test if possible (would require staging-v2 environment)

## Dependencies

- **Blocks**: ADR 029 step 7 (cutover) until soak gate can be re-established
- **Blocked by**: (none)
- **Composes with**: P035 (observability gap — this is failure-mode 4 of P035's class-of-issue); P028 (drives ADR 029 which P036 is interrupting)

## Related

- **P035** — observability gap; `/debug/shadow-config` endpoint shipped as P035 first action discovered P036
- **ADR 029** — two-phase blue/green; P036 blocks step 7 cutover
- **ADR 031** — read-shadow; P036 is a concrete failure of ADR 031's soak gate
- **ADR 030** — OpenSearch domain Terraform module; potential locus of root cause (TFC drift hypothesis)
