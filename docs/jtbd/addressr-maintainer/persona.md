---
name: addressr-maintainer
description: Lands code to the Addressr repo under a trunk-based workflow with automated changeset-driven releases to npm, Docker, and AWS.
---

# Addressr Contributor/Maintainer

## Who

Lands code to the Addressr repo under a trunk-based workflow: commits go straight to `master`, changesets declare the intended version bump, and the changesets GitHub Action cuts releases automatically to npm, Docker, and the RapidAPI-fronted AWS deployment.

## Context Constraints

- Trunk-based: no long-lived feature branches; commits land directly on `master`
- Changesets-driven release: `.changeset/*.md` is the version-bump contract
- Pre-commit chain (lint-staged, husky, license check, `test:js`) gates every commit
- A failed release is only discovered after push and costs a recovery commit and a wasted pipeline run
- Multiple cucumber test profiles (default, rest, rest2, cli, cli2) plus geo/no-geo split — coverage drift can hide

## Pain Points

- Commit-tooling footguns that silently drop release-critical files (e.g. lint-staged discarding staged `.changeset/*.md`)
- Test-profile exemption tags (`@not-cli2`) added without justification, silently eroding coverage
- Manually-run release steps that depend on operator memory rather than checkable artefacts
