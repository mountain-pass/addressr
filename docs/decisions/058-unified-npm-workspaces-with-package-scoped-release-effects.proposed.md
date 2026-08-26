---
status: 'proposed'
date: 2026-08-26
human-oversight: confirmed
oversight-date: 2026-08-26
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, accessibility-lead]
informed: []
reassessment-date: 2026-11-26
supersedes:
  [
    008-turbo-build-orchestration,
    050-the-image-follows-the-publish-not-the-deploy,
  ]
---

# Unified npm workspaces with package-scoped release effects

> The decision-maker selected consolidation directly on 2026-08-26: "move the addressr-mcp and addressr-ui projects into this repo", then asked for a persistent goal to carry the move through completion. The snapshot/history and package-scoped release details below are the smallest safe implementation recommended by the mandatory architecture review.

## Context and Problem Statement

The published Addressr MCP server and UI libraries live in separate repositories from the API, deployment, and website workspaces. The user directed that `addressr-mcp` and `addressr-ui` move into this repository. A snapshot-only copy is not sufficient: all five imported packages already publish to npm, the UI quartet needs build output before publishing, and the current release workflow treats any successful npm publication as proof that `@mountainpass/addressr` changed and should deploy the API and publish its Docker image.

The source boundaries at the decision point are:

| Source                                          | Exact source revision                      | Preserved release tags                                                                                |
| ----------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `https://github.com/mountain-pass/addressr-mcp` | `92898c3b26dd18f1a9ad9bf25d533d886b4fafca` | `v0.1.0`, `v0.2.0`, `v1.0.0` through `v1.0.4`                                                         |
| `https://github.com/mountain-pass/addressr-ui`  | `016deb24594dff7ce01dbb6e540993ce5b112c1d` | package tags through `@mountainpass/addressr-{core,react,svelte,vue}@0.7.0`, plus historical `v0.2.0` |

The target already defines `packages/*` as publishable workspaces, `apps/*` as deployed workspaces, npm 10 and one root lockfile, Changesets for versioning, and a single release workflow. The move must retain those boundaries, preserve runtime behavior, and make each release's effects depend on the package that actually changed.

## Decision Drivers

- One lockfile and one CI/release path provide faster, deterministic feedback than parallel npm and pnpm control surfaces.
- A UI-only or MCP-only release must never deploy the API or publish its Docker image.
- Every public package expected to publish must be checked against npm; a swallowed publication must fail loudly.
- Framework libraries need built `dist/` output before Changesets publishes them.
- Source history and tags must remain discoverable without grafting 158 unrelated commits into this repository.
- Accessibility behavior, especially combobox keyboard behavior, must remain observable through tests during the package-manager conversion.
- The import must exclude credentials, generated artifacts, local state, and duplicate repository governance.

## Considered Options

1. **Unified npm workspaces with snapshot imports and package-scoped release effects (chosen)** -- import the five distributable packages under `packages/*`, keep npm and the root lockfile, harden release behavior per package, and preserve old histories in archived source repositories.
2. **Graft both Git histories into the monorepo** -- preserve commit ancestry in this graph using subtree or filter-repo techniques, while still rebuilding release automation.
3. **Keep the projects in separate repositories** -- retain their existing package managers and workflows and coordinate releases across repositories.

## Decision Outcome

Chosen option: **"Unified npm workspaces with snapshot imports and package-scoped release effects"**, because it creates one working delivery system while retaining the complete historical evidence in the source repositories. History grafting adds conflict and navigation cost without preserving evidence that an archived read-only repository does not already preserve.

The packages land at:

- `packages/addressr-mcp`
- `packages/addressr-core`
- `packages/addressr-react`
- `packages/addressr-svelte`
- `packages/addressr-vue`

The UI quartet remains one Changesets linked group. MCP versions independently. Internal UI dependencies use exact `0.7.0` pins so Changesets can update them. Every manifest points to `mountain-pass/addressr` with its own `repository.directory`.

The target uses npm 10 and the root `package-lock.json` only. Source pnpm files, workflows, hooks, agent settings, risk reports, generated output, local settings, `.env`, and `.afk-run-state` do not move. Product-specific documentation is migrated deliberately; colliding repository-wide governance indexes are not copied.

The unified release workflow builds every package that publishes build output, identifies the exact public packages whose local versions are ahead of npm, verifies each expected publication, and exposes an API-package-specific output. API deploy, production smoke, and Docker publication use only the API-package output or the separately governed deployment-package version bump.

The source repositories are archived only after target `master` CI is green, the imported packages have published successfully from this repository, npm metadata points to each new `repository.directory`, required target-repository secrets are present, and the archive state is read back. Before archival rollback is a revert; after publication recovery is a forward changeset, never npm unpublish.

## Consequences

### Good

- One checkout exercises API, MCP, UI, deployment, and website compatibility.
- Package-specific release effects prevent an unrelated library publication from reaching production infrastructure.
- The root lockfile and shared controls replace duplicated repository plumbing.
- Archived source repositories preserve their full commits and tags without polluting the target history.

### Neutral

- The source repositories remain as read-only historical records after the move.
- Existing package versions are retained at import; the first target-owned release supplies the migration proof.
- The Svelte compiler's generic click warning remains acceptable only while observable tests prove the input-owned `aria-activedescendant` keyboard path.

### Bad

- The root dependency graph and CI become larger.
- A release-workflow defect can affect more published packages, so package enumeration and registry verification become load-bearing.
- The pnpm-to-npm conversion creates a one-time lockfile and script diff.

## Confirmation

1. Exactly the five named imported workspaces exist under `packages/*`; all are public distributable packages and pass the repository's workspace-membership guard.
2. `npm ci` from the repository root installs the entire workspace without a nested lockfile or pnpm workspace file.
3. MCP unit tests pass; live MCP integration either passes with the target secret or reports unavailable without being represented as coverage.
4. Each UI package builds and its existing test totals survive the npm conversion without weakened assertions.
5. Observable UI tests cover query entry, ArrowDown active-descendant selection, Enter selection, Escape collapse/clear, and focus remaining on the input across the framework implementations.
6. Changesets links the four UI packages and leaves MCP independent.
7. A workflow fixture proves an MCP/UI-only publication cannot run API deploy, production smoke, or Docker publication; an API publication still can.
8. The release job builds publishable UI output and fails when any expected public workspace version remains ahead of npm after publication.
9. C4 documents the MCP server, core SDK, framework adapters, consumers, and RapidAPI/HATEOAS relationships.
10. Each first target-owned package release is visible on npm with the target repository URL and exact `repository.directory` before its source repository is archived; GitHub then reports `isArchived: true` for that source.

## Pros and Cons of the Options

### Unified npm workspaces with snapshot imports and package-scoped release effects

- Good: one dependency and release system with small, reversible snapshot commits.
- Good: full history remains available at the original URLs.
- Bad: commit ancestry is not traversable directly from imported files.

### Graft both Git histories into the monorepo

- Good: imported file history is locally traversable.
- Bad: adds 158 unrelated commits, path-rewrite machinery, and harder rollback without improving retained evidence.

### Keep the projects in separate repositories

- Good: no migration cost.
- Bad: keeps three package managers/control surfaces and prevents one compatibility gate across the products.

## Reassessment Criteria

- Archived GitHub repositories stop preserving tags or commit navigation adequately.
- npm workspace support cannot express a future internal dependency relationship needed by the UI packages.
- Release duration or lockfile contention materially slows validated trunk feedback.
- A package-scoped release effect fires for the wrong workspace or an expected publication is reported green while absent from npm.

## Related

- [ADR-007](007-changesets-versioning.accepted.md) -- retains Changesets as the version and npm publication mechanism.
- [ADR-045](045-changesets-armed-release-pr-merge-as-the-production-deploy-entry-point.proposed.md) -- retains the deployment-package arming boundary.
- [ADR-046](046-packages-are-distributable-apps-are-deployed.proposed.md) -- places all imported distributables under `packages/*`.
- [ADR-053](053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) -- supplies the snapshot-import and archive-history precedent.
- [ADR-050](050-the-image-follows-the-publish-not-the-deploy.superseded.md) -- retains Docker publication after an API-package publish while narrowing its trigger from any npm publication to the API package.
