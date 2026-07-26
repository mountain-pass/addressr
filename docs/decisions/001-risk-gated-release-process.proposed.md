---
human-oversight: confirmed
oversight-date: 2026-07-18
status: proposed
date: 2026-03-30
decision-makers: [Tom Howard]
consulted: [Claude Code]
informed: []
---

# ADR 001: Risk-Gated Release Process via release:watch

> **Amendment 2026-07-26** — Production deploy now has a **second, publish-free entry point**, and this ADR's release-risk governance extends to cover it. Lands P039 (decouple SaaS deployment from npm publish); treats R015.
>
> **What changed.** `.github/workflows/release.yml` gains a `deploy_only` boolean `workflow_dispatch` input. The three deploy-bearing steps widen their entry gate from `steps.changesets.outputs.published == 'true'` to `success() && (steps.changesets.outputs.published == 'true' || inputs.deploy_only == true)`; the changesets/publish step is skipped when `deploy_only`, so a deploy-only run never reaches the npm registry; and the P044 swallowed-publish assertion is narrowed with `&& inputs.deploy_only != true` so it does not fire on a run that attempts no publish. Previously the only way to change production — including an EB env-var flip with no code change at all — was to cut a public npm version, which churned 20 versions across the ADR 029 / ADR 035 migration window.
>
> **Single definition is the anti-divergence constraint.** There is exactly ONE set of deploy steps, shared by both entry points, and the `release` job keeps its `if: github.ref == 'refs/heads/master'` guard. The decoupling is an `if:`-widening, never a second job or a duplicated step block — two prod-deploy paths that can drift apart is the failure this shape exists to prevent. The publish→deploy path is byte-identical, so the one-way asymmetry (every publish is followed by a deploy; not every deploy needs a publish) holds by construction rather than by careful re-gating. Pinned by `test/js/__tests__/release-workflow-deploy-only.test.mjs`.
>
> **How the risk gate applies.** The gated entry point is `npm run release:watch -- --deploy-only`, a flag on `scripts/release-watch.sh` rather than a separate script. The wr-risk-scorer gate matches on the `npm run release:watch` command _prefix_, so the flagged form is intercepted **by construction** and carries the same release-tier risk score as an unflagged release. Over-tiering here is deliberate: a deploy-only run's blast radius is a strict subset of a release's. A `npm run deploy:watch` alias would NOT be gated — npm spawns the inner command in a child shell the hook never observes — so `deploy:watch` exists only as a fail-closed signpost that prints the correct command and exits non-zero.
>
> **Correction to this ADR's own Confirmation.** The gate is **plugin-owned** (wr-risk-scorer), not the repo-local `.claude/hooks/git-push-gate.sh` this ADR and both wrapper scripts previously named. That directory does not exist. The distinction is load-bearing: this repo cannot edit or test the gate, which is precisely why the deploy-only path reuses the already-matched command prefix instead of adding a second gated surface or re-implementing the risk check locally.
>
> **Accepted residual.** The raw form `gh workflow run release.yml --ref master -f deploy_only=true` reaches prod without a risk score and is _not_ intercepted, unlike `gh pr merge` (Confirmation criterion 3). This is accepted as the same class as the bad consequence already recorded under Option 1 below — "client-side gate can be bypassed by merging outside the hooked environment" — and is not a new kind of exposure. Compensating controls apply on every path: `needs: build-and-test` carries no `if:`, so a deploy-only dispatch still runs the full two-version OpenSearch matrix _before_ deploying, and the widened gate means it still runs the full smoke-test block afterwards.
>
> **"Deploy-only" is not "zero-impact".** The deploy inherits ADR 004's deploy-time disruption as actually configured — `DeploymentPolicy = "Rolling"` (`deploy/main.tf:251-256`).
>
> **Correction 2026-07-26.** The two claims originally made here were wrong in the same way ADR 004's own text was, and are corrected by the [ADR 004 Amendment 2026-07-26](004-aws-elastic-beanstalk-deployment.accepted.md). (1) The deferral note — "ADR 004's own text still says `AllAtOnce` and has drifted from the infrastructure; correcting it is a separate governance act" — is **discharged**: that act has now been performed. (2) The substantive claim that instances "cycle at reduced capacity" under "health-based batching (`deploy/main.tf:251-256, 517-528`)" **conflated two distinct batching paths**. `517-528` is `aws:autoscaling:updatepolicy:rollingupdate`, which batches ASG _instance replacement_ (`MaxBatchSize = 1`, `MinInstancesInService = 2`); _application deploys_ travel the `aws:elasticbeanstalk:command` path, where `BatchSize = "100"` / `BatchSizeType = "Percentage"` puts the whole fleet in one batch. So a deploy-only dispatch does **not** cycle at reduced capacity — it cycles all instances at once, and the deploy-window duration is unmeasured. This makes "deploy-only is not zero-impact" more true, not less.
>
> **Scope limitation — the shadow-flip use case is NOT delivered.** P039's motivating example, toggling `SHADOW` soaking via an EB env var, still does not work through this path. The smoke block hard-asserts `hostSet != false` (`release.yml:263-267`), and it runs _after_ "Deploy new version" (`189`) and the wait step (`228-230`). So such a dispatch **applies the Terraform first** and only then fails the assertion: prod is left in the flipped state behind a red run, with no automatic rollback (`RollbackLaunchOnFailure` at `deploy/main.tf:513-514` covers EB launch failure, not a red smoke test). Parameterising that assertion is an open P039 investigation task serving JTBD-201, and P039 stays open at Known Error until it lands.
>
> **ADR 007 is untouched**, with one benign consequence: because the changesets step is skipped on a deploy-only run, a release PR is not created or updated during that run. The next push to master does it. That is a one-run deferral, not a semantic change to the versioning contract.

## Context and Problem Statement

Addressr currently has no gated release process. Merging the changesets release PR on master immediately triggers npm publish (`changesets/action`) and AWS deployment via Terraform. There is no mechanism to prevent releases when the accumulated changes carry elevated risk (e.g., large dependency upgrade batches, breaking changes, untested integrations).

The git-push-gate hook infrastructure already supports risk-score checks and references `npm run release:watch`, but the script does not exist yet.

## Decision Drivers

- Releases to npm and AWS should not proceed without a risk assessment
- The existing risk-scoring infrastructure (hooks, risk-scorer agent, RISK-POLICY.md) is already in place
- Direct `gh pr merge` of release PRs bypasses any gating mechanism
- The team needs visibility into release workflow success/failure
- The solution should be simple and not require new branches or CI workflow changes

## Considered Options

### Option 1: Risk-gated `release:watch` script

A bash script invoked via `npm run release:watch` that merges the changesets PR, watches the GitHub Actions workflow, and reports results. Gated by the existing git-push-gate hook's risk-score check.

- Good: Integrates with existing hook infrastructure — no new CI or GitHub config needed
- Good: Single command provides end-to-end release visibility (merge, watch, report)
- Good: Risk assessment enforced before every release
- Bad: Local script dependency — releases require a Claude Code session with hooks active
- Bad: Client-side gate can be bypassed by merging outside the hooked environment

### Option 2: Manual ungated process (status quo)

Continue with the current process where any merge of the changesets PR triggers release. Rely on human judgment and PR review alone.

- Good: Simple, no additional tooling
- Bad: No risk assessment gate — elevated-risk releases proceed unchecked
- Bad: No release workflow visibility — must check GitHub Actions UI manually

### Option 3: GitHub Actions environment protection rules

Use GitHub's built-in environment protection (required reviewers, wait timers) to gate the release workflow server-side.

- Good: Server-side enforcement — cannot be bypassed locally
- Good: Works regardless of local tooling
- Bad: No integration with the project's risk-scoring system
- Bad: Manual reviewer approval is a coarser gate than automated risk scoring
- Bad: Requires GitHub repository admin configuration

## Decision Outcome

**Option 1: Risk-gated `release:watch` script.**

It integrates with the existing hook infrastructure, provides a single command for the release workflow, and enforces risk assessment before releases proceed. No new branches, CI workflows, or GitHub configuration changes are required.

This decision covers:

- Creation of `scripts/release-watch.sh`
- Addition of `npm run release:watch` script entry in `package.json`
- The existing `git-push-gate.sh` hook that blocks direct `gh pr merge` and gates `release:watch` on the release risk score

## Confirmation

- `npm run release:watch` runs `scripts/release-watch.sh`; `-- --deploy-only` dispatches `deploy_only=true`
- BOTH forms are blocked by the wr-risk-scorer git-push-gate hook without a passing release risk score
- `npm run deploy:watch` does not deploy — it exits non-zero without reaching prod
- Direct `gh pr merge` of a release PR (title "chore: release") is redirected to `release:watch`
- The script identifies the changesets release PR, merges it, and watches the workflow

## Reassessment Criteria

- If the project moves to a different release mechanism (e.g., away from changesets)
- If GitHub Actions adds native risk-gating features that make the script redundant
- If the team grows and needs a server-side gate rather than a client-side one
- If a separate `publish` branch pattern is adopted (as in bbstats)
- If the wr-risk-scorer gate's command-match pattern changes such that a flagged `npm run release:watch -- --deploy-only` invocation no longer matches (e.g. the pattern becomes end-anchored), silently dropping gate coverage for the deploy-only path
