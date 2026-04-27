---
status: validated
job-id: ship-releases-reliably-from-trunk
persona: addressr-maintainer
date-created: 2026-04-15
screens:
  - .changeset/
  - .github/workflows/release.yml
  - .github/workflows/update-*.yml
  - pre-commit hook chain
---

# JTBD-400: Ship releases reliably from trunk

## Job Statement

Help contributors trust that every commit which declares a changeset will actually publish one, and that test profiles keep reporting the coverage they claim, so trunk-based releases stay deterministic, no intended version bump is silently lost, and no test coverage silently erodes.

## Job Stories

- When I intend a commit to ship a version bump, I want the corresponding `.changeset/*.md` file to actually land in that commit, so the changesets GitHub Action opens a version PR and the next release ships.
- When I forget to stage a changeset alongside the code it describes, I want a cheap local check (pre-push or post-commit) to catch it before I push, so recovery is a local re-stage rather than a failed `changeset publish` run in CI.
- When pre-commit tooling (lint-staged, husky, license check) would drop, rewrite, or silently exclude any staged file, I want the commit to fail loudly instead of succeeding with missing content. This class of silent-drop bug is guarded by a regression test so it cannot regress unnoticed.
- When a cucumber scenario is tagged to skip a test profile (e.g. `@not-cli2` per P010) without a `docs/problems/NNN-` cross-reference justifying the exemption, I want the commit to fail, so profile-specific coverage can never silently erode as new scenarios copy the pattern.
- When releasing a zero-outage upgrade across infrastructure boundaries (e.g. ADR 029 OpenSearch blue/green), I want each operator step to be an artefact (script, workflow, ADR step) rather than tribal knowledge, so the release pipeline stays deterministic.

## Desired Outcomes

- A regression test proves that a commit staging a `.changeset/*.md` plus the typical ef66d39-class fileset retains the changeset in `HEAD` after the pre-commit hook runs.
- Authorship tooling (agents, humans) has a cheap way to verify that release-intending commits include their changeset, before push.
- When a release-critical file is missing, the developer finds out locally, not from a failed release pipeline in GitHub Actions.
- Test-profile exemption tags carry mandatory cross-references; their addition fails the commit if the cross-reference is missing.
- Infra-boundary release steps (Terraform apply, domain population, cutover) are checkable artefacts, not memory.

## Persona Constraints

- **Addressr Contributor/Maintainer** (primary): trunk-based, no review-by-default, every push is a candidate for release.

## Current Solutions

- Manual pre-push reminders.
- Discovering missed releases via post-publish smoke tests, which is too late.

## Related

- P011 (closed) — original incident: P009 changeset missing from commit `ef66d39`, next release shipped no version bump.
- P010, P017 — exemption-tag and rename-only-commit footguns.
- ADR 014 (governance commits), ADR 029 (zero-outage cutover) — infrastructure-side instances of the same job.
