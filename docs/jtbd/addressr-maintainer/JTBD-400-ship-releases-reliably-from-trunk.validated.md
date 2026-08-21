---
status: validated
human-oversight: confirmed
oversight-date: 2026-08-17
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
  - 'apps/addressr-deployment/** (Terraform infra source. MOVED TWICE ON 2026-08-10: deploy/** -> packages/deployment/** at commit bf106786, then -> apps/addressr-deployment/** per ADR-046, which splits packages/* (distributable) from apps/* (deployed). AMENDED 2026-08-10: the ADR-040 push axis and its .terraform.lock.hcl exclusion are BOTH retired — a change here no longer triggers anything by path, so there is no pathspec left to exclude from. Worker auth behaviour under apps/addressr-deployment/cloudflare-worker/ is JTBD-200 — this job owns the deploy mechanism only)'
  - 'package.json (release surface only — version, changesets config, build:docker / docker:push scripts, and the deploy:* scripts including the read-only deploy:plan; the dependency block serves the runtime jobs)'
  - scripts/release-watch.sh
  - scripts/push-and-watch.sh
  - scripts/docker-tags.sh
  - pre-commit hook chain
  - '.husky/pre-push (carries the ADR-045 changeset guard, added 2026-08-17. Until then this file held only the advisory check-deps call, which cannot block; the guard is the first blocking check to live here, and `set -e` was added with it because a non-last failure was previously discarded silently)'
  - ".github/workflows/deploy-guard.yml (the ADR-045 changeset guard CI leg, added 2026-08-17. Its OWN workflow by design, NOT a job in release.yml — a job there would inherit neither the release job's `if: github.ref == 'refs/heads/master'` nor an exemption from that workflow's pull_request trigger, so on a PR it would see no github.event.before, fail closed, and red every pull request. Note the `.github/workflows/update-*.yml` entry above does NOT match this file)"
  - 'scripts/check-deployment-changeset.sh (the ADR-045 guard predicate, shared by the pre-push hook and the CI leg so the two surfaces cannot drift apart. Its fail-closed polarity is INVERTED from detect-deployment-bump.sh — it BLOCKS THE PUSH where that one declines to deploy — and the two must not be harmonised)'
  - 'scripts/detect-deployment-bump.sh (the release.yml deploy-gate detector, landed 8199e5b9 — value-not-path comparison of apps/addressr-deployment/package.json across the push range. BACKFILLED 2026-08-17: omitted when the gate repoint landed, which is independent evidence this list drifts unless edited alongside the code)'
  - "test/js/__tests__/*.test.mjs carrying an `@jtbd JTBD-400` annotation. MEMBERSHIP IS BY ANNOTATION, NOT BY DIRECTORY, and that distinction is the entry's whole content: a file joins by carrying the marker and leaves by losing it. `test/js/__tests__/**` unqualified would be wrong and P098 says so in terms — that directory also holds the runtime/behavioural suites owned by JTBD-001/002/003/100/200/201, and routing those here would collide with their behavioural surface. ADDED 2026-08-20 as a BACKFILL: seventeen files already carried the annotation and this list recorded none of them, which is the same drift the detect-deployment-bump.sh entry above records. Two members guard GOVERNANCE PROSE rather than a pipeline file — decisions-invariants over docs/decisions/, and p033-population-figures-recompute over P033 — and they are in scope on the job statement's anti-erosion clause, NOT on the release path. That second one is the newest and furthest-reaching member; it is named here rather than absorbed silently, because P033 names this job in its own 'Who is affected' line and a future reader should be able to test that hop and reject it. Naming it is what stops this entry becoming a general licence over guards of docs/problems/**. THIRD such member, ADDED 2026-08-20: story-tier-invariants, and it reaches further than either — docs/stories/**, docs/story-maps/** (including the HTML data island inside each map), docs/problems/<state>/033-*.md (the guard DERIVES the lifecycle directory; P033 closed 2026-08-21 and a hardcoded segment here would have gone stale that day), AND THIS FILE, whose own ## Stories and ## Story Maps tables it asserts against the tier. That last reach is why it is named here: a reader of this job file otherwise cannot tell that editing its reverse-trace tables can red the build. It rides the anti-erosion clause by the same generalisation as the two above — governance prose whose facts nothing recomputes — which is a generalisation from precedent, not from the clause's own words about test profiles, and a future reader should be able to test that hop and reject it."
---

# JTBD-400: Ship releases reliably from trunk

## Job Statement

Help contributors trust that every commit which declares a changeset will actually publish one, and that test profiles keep reporting the coverage they claim, so trunk-based releases stay deterministic, no intended version bump is silently lost, and no test coverage silently erodes.

## Job Stories

When I have an `apps/addressr-deployment/**` change I intend to land, I want to
run `terraform plan` against the real prod workspace from CI without applying it,
so I can see the resource-change set **before the act that applies it** — the
MERGE OF THE CHANGESETS RELEASE PR as of 2026-08-17; the `deploy_only` dispatch
before that, which is what this story said between 2026-08-10 and 2026-08-17;
and the push itself before that, which is what it originally said — because the
root module's variables come from GitHub Actions secrets and cannot be supplied
on an operator machine, which previously made pre-verification impossible rather
than merely inconvenient.

**CORRECTED 2026-08-17.** This sentence named the `deploy_only` dispatch, in the
present tense, as the act that applies — and that input was DELETED at commit
`8199e5b9`. It is the same defect class as the ADR-045 criterion-5 conditional
retired this date and the `terraform-plan.yml` header corrected alongside it:
prose that instructs rather than narrates, still naming a route that no longer
exists. Two things follow. The pre-verification surface is now
`release-pr-plan.yml`, which plans automatically on the release PR and posts the
projection before the merge that applies — so this story is better served than it
was when written. And the path is repointed from `deploy/**`, which moved twice
on 2026-08-10 and no longer exists either.

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
- When I push a change under `apps/addressr-deployment/` **that can reach production** — its own `package.json`, documentation, and test files anywhere under the tree excluded, because they arm nothing — and that will arm no deployment version bump, I want a refusal at push time that names the exact changeset to add and why, so the change does not sit unapplied and then surface weeks later as a rider on an unrelated release nobody connected to it. **When my push carries — or there is already pending from an earlier push — a changeset naming the deployment package OR any workspace package it depends on, I want no refusal at all.** That set is DERIVED from the deployment manifest and is deliberately not enumerated here — the ordinary mixed push (app change plus infra change, one app changeset) must stay green, because the apply genuinely will happen. That second sentence is load-bearing and is stated here rather than left to ADR-045 alone: it is the anti-over-fire concession, and a future implementer tightening the guard needs job-level text stopping them from turning every mixed push red. The "or already pending" half is stated for the same reason the outcome one bullet down had to be amended: the guard reads pending changesets from the HEAD tree, so a declaration that landed in an EARLIER push still satisfies it, and a concession narrower than the behaviour it protects invites a range-only tightening that looks compliant. The set is left underived here for the same reason: it currently resolves to `@mountainpass/addressr-deployment` and `@mountainpass/addressr`, but only because the workspace holds two packages — ADR-046 anticipates `apps/website`, and naming today's members here would invite hardcoding them in the predicate, which is a second statement of the cascade set. Both halves of this bullet are guarding against the same move: job text that describes today's behaviour narrowly enough that tightening the code to match looks like compliance.

  **And the refusal fires on a third condition, which neither half above covers: when the guard CANNOT DETERMINE the answer.** These refuse on master independently of whether the push touches the deployment tree at all — the determinability checks run before the changed-file list is ever computed. An indeterminable range is not evidence of safety; it is the absence of evidence either way. But the causes do NOT share a polarity, and collapsing them under one verb is wrong in both directions, so they are split here (all of it absent a `Deploy-Guard-Bypass:` trailer, which outranks every case below):

  - **An unresolvable parent ref refuses ONLY when nothing pending would bump the package.** You cannot determine what CHANGED, but you can still determine what is PENDING, and positive evidence of a bump outranks an unreadable parent. This one sits BEHIND the concession above, not beside it.
  - **An unreadable deployment manifest, an unusable `workspaces` set, or a cascade set resolving to nothing refuse EVEN WHEN a changeset is pending** — necessarily, because the pending set cannot be evaluated against a cascade set that could not be resolved. These are PRIOR to the concession, not exceptions to it. The load-bearing ordering for them is that they run before the pending-changeset check, not merely before the changed-file list. This is stated because the two halves above, read alone, condition every refusal on a production-reachable change being present, which would authorise "fixing" those branches to pass when no such change is detected. That is the FAIL-OPEN direction and it is the one tightening that must never happen: it would harmonise this guard's polarity with `detect-deployment-bump.sh`'s, which declines to DEPLOY where this one declines to let the push through. The two are adjacent in one directory with opposite exit-code contracts, deliberately. Unlike an over-fire, this failure would be silent.

## Desired Outcomes

- Read-only plan paths exist that cannot reach `terraform apply`, so pre-verification never becomes a second path to prod. The single gated path stays single.

  **AMENDED 2026-08-10.** The plan on the release PR is a FEEDBACK LOOP FOR THE CHANGE'S AUTHOR, not a review gate on anyone else: push an infrastructure change you are unsure of, read what it would do to production, and correct it before it applies. That is what makes an uncertain change safe to land. This clause read _"a read-only, `workflow_dispatch`-only plan path"_. The dispatch-only clause was a mechanism, not the outcome: what matters is that a plan path cannot apply, not how it is triggered. `.github/workflows/release-pr-plan.yml` is `pull_request`-triggered on the changesets release branch, so the old wording forbade it literally while its intent endorses it. The plan-cannot-apply property is unchanged and is enforced the same way on both paths — `PLAN_ONLY=1`, plus a fail-closed step that refuses any ref whose `deploy.sh` lacks the `PLAN_ONLY` branch. User-directed this date: _"add a terraform plan to the CICD pipeline that occurs as part of a release PR, that way you can see what it's planning to do to production before we do the merge. The caveat being that it's a point in time check."_

- A regression test proves that a commit staging a `.changeset/*.md` plus the typical ef66d39-class fileset retains the changeset in `HEAD` after the pre-commit hook runs.
- Authorship tooling (agents, humans) has a cheap way to verify that release-intending commits include their changeset, before push.
- When a release-critical file is missing, the developer finds out locally, not from a failed release pipeline in GitHub Actions.

  **AMENDED 2026-08-17.** Local-first is RETAINED as the primary surface and is unchanged: the pre-push hook is the surface the author should normally meet, and a refusal there costs a local re-stage rather than a pipeline run. What this clause did NOT contemplate is a SECOND, server-side surface. The ADR-045 changeset guard runs both as a `pre-push` hook AND as a CI leg in its own workflow, because a client-side-only gate is bypassable — `git push --no-verify` defeats the hook and needs no discovery — and the failure it guards is silent and green. The two are not alternatives and neither substitutes for the other: the hook exists so the author finds out locally; the CI leg exists so the finding cannot be skipped. Read literally, the clause above forbids the CI leg while its intent — the author learns before the damage, at the cheapest point available — endorses it. **The literal reading MUST NOT be used to justify deleting the CI leg.**

  And note what deletion would actually cost, because it is worse than "one less check": removing the CI leg leaves only the client-side surface, `--no-verify` defeats it silently and leaves no trailer, so the guard becomes exactly the thing ADR-045 calls worse than none — **while the `Deploy-Guard-Bypass:` count that was supposed to detect that failure reads zero**, because nobody bypassing via `--no-verify` writes a trailer. Deleting the CI leg does not merely weaken the guard; it blinds the instrument meant to tell you the guard had failed.

  The CI leg is also not a second pipeline under the persona's one-pipeline-to-production constraint, which forbids "a workflow that reaches production without going through the one that already does". It reaches production by no path at all — it only refuses.

- Test-profile exemption tags carry mandatory cross-references; their addition fails the commit if the cross-reference is missing.
- Infra-boundary release steps (Terraform apply, domain population, cutover) are checkable artefacts, not memory.
- Routine use of the `Deploy-Guard-Bypass:` trailer is COUNTABLE, not remembered. ADR-045's reassessment criteria name the trailer "appearing routinely rather than exceptionally" as the measurable form of guard failure, but name no counter and no occasion, which leaves the criterion unfalsifiable as written. The count is `git log --grep='^Deploy-Guard-Bypass:'` over the period since the last reassessment, run at ADR-045's reassessment date (2026-11-10) and recorded there. Without a written occasion this would be a manually-run release step depending on operator memory rather than a checkable artefact — the pain point the outcome immediately above exists to remove, reappearing inside the instrument meant to measure it.
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

## Story Maps

| ID            | Title                                          | Status |
| ------------- | ---------------------------------------------- | ------ |
| STORY-MAP-001 | STORY-MAP-001: How a change reaches production | draft  |

## Stories

| ID        | Title                                                                                     | Status      |
| --------- | ----------------------------------------------------------------------------------------- | ----------- |
| STORY-002 | STORY-002: A change is argued and written down before it is built                         | done        |
| STORY-003 | STORY-003: A change is made until its test passes                                         | done        |
| STORY-004 | STORY-004: A change is reviewed against the rules before it lands                         | done        |
| STORY-005 | STORY-005: A change reaches production without hand-run steps                             | done        |
| STORY-006 | STORY-006: A fix is confirmed working in production before it is closed                   | done        |
| STORY-001 | STORY-001: A test that passes no matter what the code does is found and made able to fail | in-progress |
