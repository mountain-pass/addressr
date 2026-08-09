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

> **Amendment 2026-07-27 — production deploy gains a THIRD entry point, `deploy/**` on master, and it runs at PUSH-TIER governance.** Written as the hard prerequisite [ADR 040](040-release-pipeline-change-type-action-matrix.proposed.md) sets on itself: its Confirmation forbids a `deploy/**` path-detection step in `.github/workflows/release.yml` until this ADR carries an amendment naming that entry point and its risk tier. Lands ADR 040 stage 3 / [P039](../problems/known-error/039-decouple-saas-deployment-from-npm-publish.md) variant 4b.
>
> **What changed.** The `release` job gains a `Detect a deploy/** change in this push` step (`id: deploy-paths`), scoped `if: github.event_name == 'push'`, which does a plain `git diff --name-only "${BEFORE}" "${GITHUB_SHA}" -- deploy/` between `github.event.before` and the pushed head. The three deploy-bearing steps widen their single shared gate a second time, from `success() && (published == 'true' || inputs.deploy_only == true)` to `success() && (published == 'true' || inputs.deploy_only == true || steps.deploy-paths.outputs.changed == 'true')`. **The single-definition constraint above is unchanged and unweakened**: still exactly one set of deploy steps, still one gate string repeated three times, still no second job and no duplicated step block, still behind the `if: github.ref == 'refs/heads/master'` job guard. A third disjunct is an `if:`-widening, which is precisely the shape this ADR's 2026-07-26 amendment permits.
>
> **The governance tier is genuinely lower, and this is the cost being accepted.** The other two deploy entry points carry a **release-tier** risk score because the wr-risk-scorer gate matches on the `npm run release:watch` command _prefix_, so both the plain and the `--deploy-only` forms are intercepted by construction. A `deploy/**` path push is seen only by the **git-push** gate, which observes `git push` and not `release:watch`. So this axis reaches a full production Terraform apply at **push-tier**, with no human intent at the moment of deploy and no opt-in. This is **not** covered by the accepted residual recorded above: that residual is scoped to a _deliberate_ raw `gh workflow run ... -f deploy_only=true` dispatch, which is a different class from an always-on automatic trigger. [JTBD 400](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md) recorded this axis as deferred until the manual `--deploy-only` path had been exercised; that precondition is **not met** (`--deploy-only` has been dispatched zero times) and the user lifted the deferral on 2026-07-26 regardless. Recorded plainly rather than satisfied on paper.
>
> **Compensating controls, such as they are.** `needs: build-and-test` carries no `if:`, so a `deploy/**` push still runs the full two-version OpenSearch matrix before deploying, and the widened gate still runs the full prod smoke block afterwards. The change is git-visible and Terraform-managed (`deploy/main.tf`), which is the point of the axis: it forces env config through IaC rather than console drift, so the deploy is reviewable in history even though it is not gated at release tier. The detection step reads two explicit commit-ish arguments and fails **closed** — an all-zeros `github.event.before` (branch creation) or a force-pushed-away parent both yield `changed=false` and no deploy.
>
> **One new coupling, deliberately left in place.** The P044 swallowed-publish assertion sits upstream of the deploy steps in the same job, and none of its conjuncts exclude a `deploy/**`-only push. If `package.json` is ever strictly ahead of npm, a pure infrastructure push will fail that assertion and skip the deploy. Narrowing it would add a fourth conjunct to an already-subtle predicate for a rare state; refusing to apply Terraform from a tree with a known-broken release state is the right default. Recorded, not fixed.
>
> **Re-ratification flagged, oversight marker deliberately not flipped.** This amendment widens the entry points to a **production deploy**, which is this ADR's decided question, so it sits at the outer edge of the amendment precedent [ADR 004](004-aws-elastic-beanstalk-deployment.accepted.md) set. `human-oversight: confirmed` is preserved rather than silently flipped — flipping it would raise a spurious unratified-dependency block on every future deploy-adjacent change. The substance is user-pinned (the deferral lift, 2026-07-26), but this run was AFK with no interactive access, so the obligation is queued for `/wr-architect:review-decisions`, to be ratified in the same pass as ADR 039 and ADR 040. Pinned mechanically in `test/js/__tests__/release-workflow-deploy-only.test.mjs`, which cross-reads this file and asserts this block exists whenever the path-detection step is present in `release.yml` — the prerequisite is enforced in test, not left to a human grep.

> **Amendment 2026-08-10 — the `deploy/**` push entry point is RETIRED. Production deploy returns to TWO entry points.** The 2026-07-27 block above is retained verbatim as history per [DECISION-MANAGEMENT.md](../../DECISION-MANAGEMENT.md): that decision was ratified (`human-oversight: confirmed`) and implemented — the axis applied to production six times — so it is quoted and superseded here rather than rewritten in place. Read it as a record of what was authorised between 2026-07-27 and 2026-08-10, not as a description of the current pipeline.
>
> **What it authorised, quoted so the supersession is legible without scrolling:** _"production deploy gains a THIRD entry point, `deploy/**` on master, and it runs at PUSH-TIER governance"_, widening the shared gate to `success() && (published == 'true' || inputs.deploy_only == true || steps.deploy-paths.outputs.changed == 'true')`. **That authorisation is withdrawn.** The gate is narrowed back to `success() && (published == 'true' || inputs.deploy_only == true)` and the `Detect a deploy/** change in this push` step is deleted.
>
> **Why it went, and it is NOT because the P095 remediation failed.** [ADR 040](040-release-pipeline-change-type-action-matrix.proposed.md)'s reassessment criterion — _"the `deploy/**` axis fires an unintended production deploy — reconsider whether it should require the dispatch after all"_ — already fired on 2026-08-08 (run `31252424980`) and was already answered there: _"the answer is **no**, the axis should not require the dispatch after all — it is made safe one layer down."_ That answer still stands on its own terms and this amendment does not overturn its reasoning. The axis retires on a **different and independent** ground: the detection step diffed a **path**, and a rename **out of** `deploy/` presents as deletions **under** `deploy/`. So the commit that moves the tree into `packages/deployment/` would itself have set `changed=true` and applied Terraform to production as a rider on a pure refactor. Verified by replaying the exact predicate against a real `git mv` rather than reasoned about. [ADR 044](044-native-esm-without-a-build-step.proposed.md) met the same shape and held `deploy/create-deployment-archive.js` out of the ESM change for it; this amendment removes the trap instead of routing around it a second time.
>
> **What this does to the governance objection recorded above.** The 2026-07-27 block recorded its own cost in as many words — _"no human intent at the moment of deploy and no opt-in"_ — and recorded that JTBD 400's stated precondition for the axis was **not met** and was lifted anyway. Retiring the axis discharges that objection rather than mitigating it. R021 and R022 retire with it.
>
> **The interim this opens, priced rather than asserted away.** Until the successor entry point lands, `deploy_only` is the **only** way to apply an infrastructure change. That is the _less_-proven of the two: per R020 it has been dispatched exactly twice (2026-08-05, runs `30989443618` and `30991052224`), **both against a plan that changed nothing**, so it has never carried a real infrastructure mutation — whereas the retired push axis carried six real applies, five of them successful. R020's Impact was held at 4 explicitly because _"the primary path is now proven and would usually be available"_; this amendment deletes that ground, so R020 re-scores upward rather than retiring. Two cheap conditions make the interim sound, and both are R020's own outstanding treatment rather than new work: run the first real infrastructure change through `deploy_only` as its named non-empty-plan exercise, and sequence it behind a `terraform-plan.yml` baseline dispatch — which, with R021 retired, is now the **only** plan review left on any path to production.
>
> **The accepted residual above is unchanged in mechanism and heavier in weight.** A raw `gh workflow run release.yml -f deploy_only=true` is still not intercepted by the risk gate; only the `npm run release:watch -- --deploy-only` prefix is. That residual was written when the dispatch was one of three entry points. It now carries the entire infrastructure-change surface.
>
> **Oversight marker deliberately not flipped**, for the reason the 2026-07-27 block gives: flipping it raises a spurious unratified-dependency block on every future deploy-adjacent change. The successor entry point — an infrastructure change carrying a changeset for a deployment package, with the release-PR merge as the apply — is a separate decision and will be recorded in its own ADR rather than smuggled in here.

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

It integrates with the existing hook infrastructure, provides a single command for the release workflow, and enforces risk assessment before releases proceed. No new branches, CI workflows, or GitHub configuration changes are required **for the release gate itself** — the clause scopes the gate, and is not a blanket bar on CI (see the amendment below).

> **Amendment 2026-08-01 — read-only plan verification narrows the push-tier gap.** **[PREMISE VOID 2026-08-10 — read this whole block in the past tense, then read the note at its end.]** This ADR records the `deploy/**` push axis reaching prod at push-tier governance as "a lower governance tier accepted and recorded rather than satisfied". That gap is now **narrower, not closed**.
>
> `.github/workflows/terraform-plan.yml` runs `terraform plan` against the real prod workspace and never applies, so a `deploy/**` change can be inspected before the push that applies it. Previously that was impossible rather than merely skipped: the root module's variables come from GitHub Actions secrets, so `terraform plan` cannot run on an operator machine at all, and reading the changed files answers the wrong question — `apply` reconciles the whole root module, so an Elastic Beanstalk change can arise from drift unrelated to the diff.
>
> **Advisory, not blocking.** An operator can still push `deploy/**` and apply without ever dispatching it. The gap therefore narrows rather than closes, and whether a green plan should become a _precondition_ of a `deploy/**` push is a live question, deliberately left open here.
>
> **Deliberately `workflow_dispatch`-only, and deliberately ungated by the risk scorer.** Dispatch-only because a fork `pull_request` receives no secrets, so every `TF_VAR_*` resolves to empty and the plan renders as tearing down the ADR-024 enforcement boundary — a confidently wrong answer from a green run; `pull_request_target` would hand fork-authored code the production AWS keys. Ungated because the job is read-only, so a release-risk score has nothing to gate. Note nonetheless that its trust boundary is identical to `release.yml`'s: it holds the full production credential set. The missing gate is a considered choice, not an oversight.
>
> **Note added 2026-08-10 — what this block is for now.** Its premise was the `deploy/**` push axis: the gap it narrowed was "an operator can push `deploy/**` and apply without ever dispatching a plan", and the open question it left was "whether a green plan should become a _precondition_ of a `deploy/**` push". Both are void — there is no such push. Retained rather than rewritten, per [DECISION-MANAGEMENT.md](../../DECISION-MANAGEMENT.md), because the decision it records was ratified and implemented.
>
> **`terraform-plan.yml` itself is not void — it is more load-bearing than when this block was written, and that is the opposite of what a reader skimming a struck premise would assume.** With [R021](../risks/R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md) retired it is the **only** plan review left on any path to production: both surviving entry points — a release-PR merge and a `deploy_only` dispatch — apply without showing an operator what would change. [R020](../risks/R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md) records a baseline dispatch here as the hand-performed stand-in for the approval gate R021 said the pipeline lacked, and re-scored to 10 on 2026-08-10 because `deploy_only` became the sole infra-apply route while never having carried a real mutation. So the standing advice inverts: this workflow was advisory against the push axis, and is now the expected precondition of every `deploy_only`. The dispatch-only reasoning below is unchanged — the fork-secrets half and the workspace-lock half both still hold.

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
