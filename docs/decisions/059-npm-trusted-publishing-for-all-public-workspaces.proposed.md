---
status: 'proposed'
date: 2026-08-26
human-oversight: confirmed
oversight-date: 2026-08-26
decision-makers: [Tom Howard]
consulted: [Codex architecture review]
informed: []
reassessment-date: 2026-11-26
---

# npm trusted publishing for all public workspaces

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per the governance-skill invocation rule, derived-substance amendment 2026-07-06 / the full-substance capture implementation design). Section content was derived by the capturing agent from the in-session decision context and RATIFIED by the decision-maker on 2026-08-26 at the /wr-architect:review-decisions drain.

## Context and Problem Statement

The first release after consolidating the Addressr MCP and UI packages passed every build, test, package, licence, live-integration, and website gate, then failed the five imported-package npm publish attempts with E404; `@mountainpass/addressr` was already current and was not attempted. The response is consistent with a missing, expired, or insufficiently authorised target `NPM_TOKEN`, but does not distinguish those causes. All six public workspaces require trust because the shared token is being removed. Relaying a token from a source repository was rejected at residual risk 12/25: the token's granular package scope could not be proved before an irreversible concurrent publish, and the available GitHub credential was broader than a one-repository secret update.

npm trusted publishing can bind each existing package to this repository's GitHub Actions workflow and authenticate `npm publish` through a short-lived OIDC identity instead of a repository bearer token. The repository otherwise remains deliberately on npm 10.9.4 for root installation, versioning, and lockfile generation; trusted publishing requires npm 11.5.1 or newer only at the publish boundary.

## Decision Drivers

- Publication authority must be exact and readable before a retry can make any package version public.
- One release command publishes six public workspaces concurrently, so authentication must cover `@mountainpass/addressr` as well as the five imported packages.
- A durable target-owned release path must not depend on secrets retained by repositories that will be archived.
- The existing Changesets versioning, package verification, API-only deployment effects, npm 10 lockfile, and root install behavior must remain unchanged.
- A partial publish must be enumerated even when `changesets/action` itself fails, while deploy, smoke, and Docker effects must remain success-only.

## Considered Options

1. **Trusted publishing for all six public workspaces (chosen)** -- bind each npm package to `mountain-pass/addressr` and `release.yml`, give only the release job OIDC permission, and use an exact npm 11 version only for the publish invocation.
2. **Create a new granular bearer token in the target repository** -- select all six packages and retain the existing `NPM_TOKEN` workflow shape.
3. **Relay source-repository tokens into the target repository** -- use temporary cross-repository workflows to transfer credentials without displaying their values.
4. **Keep the failed target token and retry** -- assume the E404 was transient and run the same release again.

## Decision Outcome

Chosen option: **"Trusted publishing for all six public workspaces"**, because it gives npm an exact repository, workflow, and allowed-action boundary for every package without creating or transferring a long-lived publish credential. npm 10.9.4 remains the repository tool for installs, versioning, and lockfile generation; the release job installs one exact npm 11 version immediately before the publish action and asserts the minimum Node and npm versions there.

The npm trust records use:

- Provider: GitHub Actions
- Organization: `mountain-pass`
- Repository: `addressr`
- Workflow: `release.yml`
- Allowed action: `npm publish`
- Environment: none

The release job grants `contents: read` and `id-token: write`, retains the existing `GH_TOKEN` for Changesets' GitHub mutations, and supplies neither `NPM_TOKEN` nor `NODE_AUTH_TOKEN` to the publish action. All six npm trust records must be configured and read back before the first OIDC retry.

The publication verifier runs after the Changesets step even when that step fails, unless Changesets is creating or updating a release PR. It reports every local public-workspace version still absent from npm. Release effects, API deployment, production smoke, and Docker publication continue to require normal upstream success. Recovery from any partial publication is forward-only; no published version is unpublished.

## Consequences

### Good

- Publishing no longer depends on a long-lived repository bearer token or an archived source repository.
- npm accepts publishes only from the exact target repository workflow and automatically records provenance.
- All six public workspaces share one visible authentication boundary matching the existing single release pipeline.
- A failed concurrent publish leaves an exact registry mismatch report for forward recovery.

### Neutral

- npm package settings become part of the release system and require six identical records rather than one GitHub Actions secret.
- The root lockfile and ordinary developer/CI installs continue to use npm 10.9.4; only publishing uses npm 11.

### Bad

- A workflow filename or repository rename requires coordinated changes in all six npm trust records.
- npm trusted publishing is an external control plane whose configuration cannot be fully represented in Git.
- The publish job temporarily carries `id-token: write`; a future workflow edit could widen how that identity is used if review and tests fail.

## Confirmation

1. npm package settings read back the exact GitHub organization, repository, workflow filename, no environment, and `npm publish` action for `@mountainpass/addressr`, `@mountainpass/addressr-core`, `@mountainpass/addressr-mcp`, `@mountainpass/addressr-react`, `@mountainpass/addressr-svelte`, and `@mountainpass/addressr-vue` before retry.
2. The parsed release workflow gives only the `release` job `contents: read` and `id-token: write`; no other job gains npm publishing authority.
3. The release job installs one exact npm version at or above 11.5.1 and asserts Node is at least 22.14 and npm is at least 11.5.1 immediately before `changesets/action` invokes the publish script.
4. The Changesets step retains its exact version, publish, GitHub-release, and `GH_TOKEN` wiring but contains neither `NPM_TOKEN` nor `NODE_AUTH_TOKEN`.
5. An executable workflow test proves the publication verifier carries failure-aware `if:` semantics and that package effects, deployment, smoke, and Docker publication remain success-only.
6. A target `master` release publishes every locally-ahead public workspace, and `node scripts/check-workspace-publications.mjs` confirms exact registry equality for all six.
7. npm metadata for each imported package reports its exact target `repository.directory` and a provenance attestation tied to `mountain-pass/addressr` before either source repository is archived.

## Pros and Cons of the Options

### Trusted publishing for all six public workspaces

- Good, because authentication is short-lived, exact to one repository workflow, and produces registry provenance.
- Bad, because six external trust records must remain synchronized with the workflow identity.

### Create a new granular bearer token in the target repository

- Good, because it preserves the current workflow and npm 10 publish path.
- Bad, because it creates another expiring, package-scoped secret whose exact authority is not visible in the repository, while npm recommends trusted publishing for CI/CD.

### Relay source-repository tokens into the target repository

- Good, because it could reuse a credential that previously published at least one package.
- Bad, because it cannot prove all-package scope before publication and introduces a temporary cross-repository secret-mutation principal; the assessed residual risk was 12/25, above appetite 5.

### Keep the failed target token and retry

- Good, because it changes nothing.
- Bad, because the exact same credential already failed every package PUT and a retry would provide no new control or evidence.

## Reassessment Criteria

- npm trusted publishing stops supporting GitHub Actions, the required Node/npm floor becomes incompatible with the release runner, or provenance cannot be verified for a successful publish.
- The repository, workflow filename, or package set changes and the six trust records can no longer be kept exact without material operational burden.
- Changesets gains a staged or transactional publication mechanism that prevents partial multi-package visibility and warrants replacing the failure-aware verifier.
- A release succeeds through a path other than the exact configured workflow, or any non-release job obtains an npm publish-capable OIDC identity.
