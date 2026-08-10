---
status: validated
human-oversight: confirmed
oversight-date: 2026-07-06
job-id: ship-releases-reliably-from-trunk
persona: addressr-maintainer
date-created: 2026-04-15
screens:
  - .changeset/
  - .github/workflows/release.yml
  - .github/workflows/terraform-plan.yml
  - '.github/workflows/release-pr-plan.yml (read-only plan on the changesets release PR; posts an address+action-verb projection, never the raw plan — it carries every Terraform root variable in cleartext and this repo is public)'
  - .github/workflows/docker-image.yml
  - .github/workflows/rapidapi-listing-sync.yml
  - .github/workflows/update-*.yml
  - 'packages/deployment/** (Terraform infra source; was deploy/** until commit bf106786 moved it. AMENDED 2026-08-10: the ADR-040 push axis and its .terraform.lock.hcl exclusion are BOTH retired — a change here no longer triggers anything by path, so there is no pathspec left to exclude from. Worker auth behaviour under packages/deployment/cloudflare-worker/ is JTBD-200 — this job owns the deploy mechanism only)'
  - 'package.json (release surface only — version, changesets config, build:docker / docker:push scripts, and the deploy:* scripts including the read-only deploy:plan; the dependency block serves the runtime jobs)'
  - scripts/release-watch.sh
  - scripts/push-and-watch.sh
  - scripts/docker-tags.sh
  - pre-commit hook chain
---

# JTBD-400: Ship releases reliably from trunk

## Job Statement

Help contributors trust that every commit which declares a changeset will actually publish one, and that test profiles keep reporting the coverage they claim, so trunk-based releases stay deterministic, no intended version bump is silently lost, and no test coverage silently erodes.

## Job Stories

When I have a `deploy/**` change I intend to land, I want to run `terraform plan`
against the real prod workspace from CI without applying it, so I can see the
resource-change set **before the act that applies it** — the `deploy_only`
dispatch as of 2026-08-10; previously the push itself, which is what this story
originally said — because the root
module's variables come from GitHub Actions secrets and cannot be supplied on an
operator machine, which previously made pre-verification impossible rather than
merely inconvenient.

Reading the changed files is not a substitute: `apply` refreshes and reconciles
the whole root module, so an Elastic Beanstalk change can arise from drift that
has nothing to do with the diff. Only a plan answers "will this bounce the
fleet?"

Mechanics, because the story is only true if a not-yet-landed change can be
planned: `release.yml`'s auto-apply trigger is `branches: [master]`, so
dispatching the plan workflow against a short-lived branch is safe and does not
fire it. That is compatible with the trunk-based constraint — short-lived, for
the duration of one plan, not a feature branch.

- When I intend a commit to ship a version bump, I want the corresponding `.changeset/*.md` file to actually land in that commit, so the changesets GitHub Action opens a version PR and the next release ships.
- When I forget to stage a changeset alongside the code it describes, I want a cheap local check (pre-push or post-commit) to catch it before I push, so recovery is a local re-stage rather than a failed `changeset publish` run in CI.
- When pre-commit tooling (lint-staged, husky, license check) would drop, rewrite, or silently exclude any staged file, I want the commit to fail loudly instead of succeeding with missing content. This class of silent-drop bug is guarded by a regression test so it cannot regress unnoticed.
- When a cucumber scenario is tagged to skip a test profile (e.g. `@not-cli2` per P010) without a `docs/problems/NNN-` cross-reference justifying the exemption, I want the commit to fail, so profile-specific coverage can never silently erode as new scenarios copy the pattern.
- When releasing a zero-outage upgrade across infrastructure boundaries (e.g. ADR 029 OpenSearch blue/green), I want each operator step to be an artefact (script, workflow, ADR step) rather than tribal knowledge, so the release pipeline stays deterministic.
- When I land an infra-only change that ships no published artifact, I want an explicit, risk-governed trigger that applies it to prod, so committed infra does not sit unapplied waiting for an unrelated publish to carry it out as a rider.

## Desired Outcomes

- Read-only plan paths exist that cannot reach `terraform apply`, so pre-verification never becomes a second path to prod. The single gated path stays single.

  **AMENDED 2026-08-10.** The plan on the release PR is a FEEDBACK LOOP FOR THE CHANGE'S AUTHOR, not a review gate on anyone else: push an infrastructure change you are unsure of, read what it would do to production, and correct it before it applies. That is what makes an uncertain change safe to land. This clause read _"a read-only, `workflow_dispatch`-only plan path"_. The dispatch-only clause was a mechanism, not the outcome: what matters is that a plan path cannot apply, not how it is triggered. `.github/workflows/release-pr-plan.yml` is `pull_request`-triggered on the changesets release branch, so the old wording forbade it literally while its intent endorses it. The plan-cannot-apply property is unchanged and is enforced the same way on both paths — `PLAN_ONLY=1`, plus a fail-closed step that refuses any ref whose `deploy.sh` lacks the `PLAN_ONLY` branch. User-directed this date: _"add a terraform plan to the CICD pipeline that occurs as part of a release PR, that way you can see what it's planning to do to production before we do the merge. The caveat being that it's a point in time check."_

- A regression test proves that a commit staging a `.changeset/*.md` plus the typical ef66d39-class fileset retains the changeset in `HEAD` after the pre-commit hook runs.
- Authorship tooling (agents, humans) has a cheap way to verify that release-intending commits include their changeset, before push.
- When a release-critical file is missing, the developer finds out locally, not from a failed release pipeline in GitHub Actions.
- Test-profile exemption tags carry mandatory cross-references; their addition fails the commit if the cross-reference is missing.
- Infra-boundary release steps (Terraform apply, domain population, cutover) are checkable artefacts, not memory.
- An infra-only change reaches prod through a single prompted, risk-scored command (`npm run release:watch -- --deploy-only`) rather than an unreviewed out-of-band `terraform apply`. The dispatch remains operator-initiated by design; the compensating control is that it is the one gated path.

  **AMENDED 2026-08-10, clause by clause, because they resolve differently. The dispatch is NOT endorsed by this amendment, not even transitionally** — user-directed this date, when offered a "transitional control" framing: _"I don't want the dispatch to be transitional at all."_

  _Operator-initiated by design_ is **WITHDRAWN, not restored.** Retiring ADR-040's `deploy/**` push axis did make it true again as a matter of fact, but true is not correct: `deploy_only` being the only remaining route is what made it a defect, not a design. It fails the governing principle stated this date — _"I don't want it being a flag that the agent has to provide from our local machine. The change sets should determine what does and doesn't trigger and deploy."_ A `workflow_dispatch` boolean fails that test even though it runs the same pipeline, because nothing in the repo records that a deploy was wanted or why. The named command `npm run release:watch -- --deploy-only` is superseded and is removed in Phase 4; the clause above is retained as the shipped text it supersedes, not as current intent.

  _The one gated path_ **survives as an outcome and changes mechanism.** The arming declaration becomes a committed changeset on the deployment package — reviewable, visible on the release PR alongside its terraform plan, with the merge as the apply. That is a stronger compensating control than the dispatch it replaces, on the only count that matters here: it leaves a record.

  The third clause — _"auto-dispatch on infra change (P039 variant 4b) is deliberately deferred until the manual path has been exercised"_ — is discharged by fact rather than by decision: the manual path WAS exercised on 2026-08-05 (runs `30989443618`, `30991052224`). ADR-040's claim that it had run zero times is stale. **That discharge is the enabling premise for the changeset-armed gate**, which is substantially variant 4b. Note what the exercise did and did not prove: both runs went against a plan that changed nothing, so the path is proven for dispatch, gating and step-entry, and unproven for carrying a real infrastructure mutation (R020). The successor route inherits that gap and starts at zero real applies of its own — R020 is re-scored against the successor, not closed by the predecessor's deletion.

## Persona Constraints

- **Addressr Contributor/Maintainer** (primary): trunk-based, no review-by-default, every push is a candidate for release.

## Current Solutions

- Manual pre-push reminders.
- Discovering missed releases via post-publish smoke tests, which is too late.

## Related

- P011 (closed) — original incident: P009 changeset missing from commit `ef66d39`, next release shipped no version bump.
- P010, P017 — exemption-tag and rename-only-commit footguns.
- ADR 001 (risk-gated release process via `release:watch`), ADR 029 (zero-outage cutover) — infrastructure-side instances of the same job. **Corrected 2026-08-09**: this line read "ADR 014 (governance commits)". ADR 014 is _ESLint 9 Flat Configuration with Security and Quality Plugins_, contains no occurrence of "governance", and is not infrastructure-side. ADR 001 is the governance-tier release decision, is infrastructure-side, and already cross-references this job in its 2026-07-27 amendment — but the original intent is inferred, not recorded, so treat the referent as reconstructed. Same rot class as the superseded-ADR citations swept on this date, except a bare-token grep cannot reach it: the citation number is live, only its subject is wrong.
- ADR 040 (release pipeline decoupled into npm / docker / deploy axes) — ~~its `deploy/**` push trigger **contradicts** the final Desired Outcome above (operator-initiated, one gated path, P039 variant-4b deferral). Amendment pending an interactive `/wr-jtbd:confirm-jobs-and-personas` run.~~ **DISCHARGED 2026-08-10 BY DELETION, not by amendment.** The push trigger is retired (commit `dd9c950b`; ADR-001 and ADR-040 dated amendments), so the contradiction is removed at its source rather than reconciled in prose. See the amended Desired Outcome above for which clauses this restores and which were already discharged by fact.
- Deliberately NOT added as screens here: `Dockerfile`, `.dockerignore.tmpl`, `docs/DOCKER-IMAGE-CHANGELOG.md` — routed to the not-yet-existing JTBD-202 per P055, not dropped.
