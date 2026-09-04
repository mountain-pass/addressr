---
human-oversight: confirmed
oversight-date: 2026-07-18
name: addressr-maintainer
description: Lands code to the Addressr repo under a trunk-based workflow with automated changeset-driven releases to npm, Docker, and AWS.
---

# Addressr Contributor/Maintainer

## Who

Lands code to the Addressr repo under a trunk-based workflow: commits go straight to `master`, changesets declare the intended version bump, and the changesets GitHub Action cuts releases automatically to npm, Docker, and the RapidAPI-fronted AWS deployment.

## Context Constraints

- Trunk-based: no long-lived feature branches; commits land directly on `master`
- **ONE PIPELINE TO PRODUCTION.** User-stated principle, 2026-08-10, verbatim: _"there should be only one pipeline path to production. Some of the steps may may not trigger. that is okay. But it's One pipeline."_ This is a constraint on the PIPELINE, not on the number of triggers. Steps inside it are allowed to skip conditionally — a run that publishes nothing and deploys nothing is still the same pipeline. What is forbidden is a SECOND path: a duplicate set of deploy steps, a separate job, or a workflow that reaches production without going through the one that already does. ADR-001 encodes the mechanical half of this as its single-definition doctrine — exactly one set of deploy steps, shared by every entry point, `if:`-widened and never forked. Read every proposal against this: _does it add a step to the pipeline, or a second pipeline?_
- **THE CHANGESETS DECIDE WHAT DEPLOYS.** The second half of the same principle, stated 2026-08-10: _"I don't want it being a flag that the agent has to provide from our local machine. The change sets should determine what does and doesn't trigger and deploy."_ One pipeline is necessary but not sufficient — what turns a step ON must be a committed, reviewable declaration, not a value supplied at dispatch time by whoever is at the keyboard. A `workflow_dispatch` boolean fails this even though it runs the same pipeline: nothing in the repo records that a deploy was wanted or why. A changeset records both, lands a CHANGELOG entry, and is visible on the release PR beside its terraform plan.
- **No review-by-default still holds, unqualified.** As of 2026-08-10 a `git push` cannot apply Terraform — an infrastructure change reaches production only through the release PR. That PR is NOT an approval gate: it exists so the person or agent who made the change can SEE what it would do to production and correct it before it applies. Self-verification, not sign-off. The distinction matters because it is what lets an uncertain infrastructure change be pushed at all: land it, read the plan on the PR, and decide whether what you wrote was right.
- Changesets-driven release: `.changeset/*.md` is the version-bump contract
- Pre-commit chain (lint-staged, husky, license check, `test:js`) gates every commit
- A failed release is only discovered after push and costs a recovery commit and a wasted pipeline run
- Multiple cucumber test profiles (default, rest2, cli2) plus geo/no-geo split — coverage drift can hide

> The four constraints below were added on 2026-09-03, after this file's `oversight-date` of 2026-07-18. They were not separately ratified as a persona edit; they inherit ratification from JTBD-403 (know the paid channel still bills correctly), which the maintainer confirmed that day and which asserts each of them. Recorded here so a reader does not take the older marker as covering newer content.

- **Sole operator of a paid managed channel.** Added 2026-09-03 with JTBD-403. The maintainer is not only the person who ships this project but the one who owes a commercial contract to whoever pays for metered access: usage billed accurately, entitlement matching what the provider says, and service not silently withdrawn. Nothing in the constraints above reaches that obligation, and the jobs that assume it were written before the persona recorded it.
- **Sole reviewer, frequently unattended.** Long assumed and relied on by the credential and context jobs, recorded here on 2026-09-03 because a job now depends on it directly: much work runs in sessions with nobody watching, so a finding whose only reader is a present human is not a control. This is the persona-level fact behind the project's rule that a check must act, or be read by an agent.
- **Out-of-band reachability is limited, and currently absent.** Email and SMS were chosen on 2026-09-03 and withdrawn in whole on 2026-09-04, both halves, without the configuration ever being applied. There is no on-call rotation and no paging tier on the account, and no fault notification is in place today. Whatever replaces it shortens time-to-awareness without ever becoming coverage.
- **The repository is public.** Also long assumed. It bounds every artefact the persona's jobs produce: no commercial terms, subscriber data, credentials or traffic volumes may land in the tree, and that applies to notification payloads leaving the account as much as to committed files.

## Pain Points

- Commit-tooling footguns that silently drop release-critical files (e.g. lint-staged discarding staged `.changeset/*.md`)
- Test-profile exemption tags (`@not-cli2`) added without justification, silently eroding coverage
- Manually-run release steps that depend on operator memory rather than checkable artefacts
- The one remaining route to a production infrastructure apply has never carried a real infrastructure mutation — it has been exercised twice, both against a plan that changed nothing (R020)
