# Problem 082: `RISK_BYPASS: reducing` opens all three gates at once, including push-past-CI

**Status**: Open
**Reported**: 2026-08-02
**Priority**: 12 (High) — Impact: Significant (4) × Likelihood: Possible (3) — derived at capture; a bypass issued for one tier silently releases the other two, and the push tier is the one that reaches production
**Origin**: internal
**Effort**: S — derived at capture: the fix is per-tier bypass markers upstream, not a change in this repo
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

A single `RISK_BYPASS: reducing` line emitted by the risk scorer writes **three** markers, not one. From `risk-score-mark.sh` (wr-risk-scorer 0.18.6):

```sh
reducing)
    touch "${RDIR}/reducing-commit"
    touch "${RDIR}/reducing-push"
    touch "${RDIR}/reducing-release"
```

`reducing-push` is then checked in `git-push-gate.sh` **before** the CI-status check and before the risk gate, and it persists for the full marker TTL against a drift hash that is deliberately invariant across commit and push (P054).

So a bypass issued to unstick a **commit** silently opens the **push** gate, past both CI and the score, for the remainder of the TTL. The three tiers are scored separately and gated separately, but they are bypassed together.

## Symptoms

A scorer that judges a commit net-risk-reducing — a legitimate and common verdict — hands back an open master-push gate that skips CI. Nothing in the emitted verdict says so, and the operator has no signal that two extra gates just opened.

## Reproduction

Observed 2026-08-02. A `deploy/**` commit scored `commit=4 push=6` — commit within appetite, push above it. The commit gate blocked on a stale higher score, and the obvious unsticking move was a `reducing` bypass. The scorer declined, and gave the reason explicitly:

> "One bypass line touches all three markers, and `reducing-push` is checked at `git-push-gate.sh` line 43 — before the CI-status check and before the risk gate, persisting for the full TTL against an invariant hash. Emitting `reducing` to unstick your commit would hand you an open master-push gate that skips both CI and the 6/25 score, i.e. it would arm precisely the unplanned production apply this whole exercise exists to prevent."

In this project the push tier arms a full-root-module production `terraform apply` (ADR-040 stage 3), so the opened gate is not theoretical — it is the one that reaches live infrastructure.

## Workaround

Do not emit `reducing` to resolve a single-tier block. Reduce the actual score instead, or discharge the remediation that is holding the tier above appetite. That is what was done here: the `terraform-plan.yml` two-run protocol was run on a throwaway ref, which took the push tier from 6/25 to 4/25 on evidence rather than on a bypass.

## Impact Assessment

- **Who is affected**: any adopter of `wr-risk-scorer` whose push tier reaches production. Maintainer-side; no direct consumer exposure.
- **Frequency**: available on every `reducing` verdict, which is a routine outcome. It did not fire here only because the scorer read its own hook source and refused.
- **Severity**: Significant. The realised shape is an above-appetite production apply landing with CI unread. In this project that means a whole-root-module Terraform apply against the live Elastic Beanstalk environment, OpenSearch and Cloudflare.

## Root Cause Analysis

The bypass vocabulary is scored per-tier but applied globally. `RISK_SCORES` carries three independent numbers (`commit`, `push`, `release`); `RISK_BYPASS` carries one token with no tier qualifier, and the mark hook fans it out to all three. The asymmetry is the defect: there is no way to express "this commit is risk-reducing" without also asserting it of the push and the release.

Aggravating factor: the marker sits **ahead of** the CI-status check in `git-push-gate.sh`, so it does not merely substitute for the score — it also skips a gate that is not a risk gate at all.

### Investigation Tasks

- [ ] Confirm the behaviour against the current upstream version before reporting — the observed hook is `wr-risk-scorer/0.18.6`; several versions are present in the local plugin cache and the gate that fires is not always the newest.
- [ ] Report upstream to `windyroad/agent-plugins` per the P077 precedent (issue, then offer a PR). Proposed shape: make the bypass tier-qualified (`RISK_BYPASS: reducing-commit`), or have the mark hook write only the marker for the tier the verdict was issued against.
- [ ] Separately: argue that `reducing-push` should sit **after** the CI-status check regardless. A risk bypass is a statement about risk, not about whether the build passes; those are different claims and one should not silently satisfy the other.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P077, P080 — all three are `wr-risk-scorer` / governance-plugin defects found by reading hook source rather than by observing failure

## Related

- **P077** (risk scorer rates deferral as mitigation) — same plugin suite, same report-then-PR route.
- **P080** (external-comms gate cannot read `--body-file`) — same suite, same discovery method: the behaviour is only visible by reading the hook, and the operator-facing message says nothing about the real cause.
- `git-push-gate.sh` line ~43 (the `reducing-push` check, ahead of CI), `risk-score-mark.sh` lines 60-65 (the three-marker fan-out), `pipeline-state.sh` lines 36-45 (the commit/push-invariant drift hash that makes the marker survive the commit).
- **ADR-040** stage 3 — why the push tier matters here specifically: a `deploy/**` push arms a production apply with no plan-approval gate in front of it.

Note the discovery route, because it generalises: this was found because a scorer was asked to rule on a sequencing deadlock and read its own hook sources to answer. Neither this defect nor P080 produced a failure that would have surfaced them; both were latent and would have stayed latent.

Origin: internal, surfaced 2026-08-02 when a commit-tier block and a push-tier block disagreed, and the scorer declined to resolve it with a bypass it had inspected.
