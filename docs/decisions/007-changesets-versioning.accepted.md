---
status: accepted
date: 2023-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 007: Changesets for Version Management and npm Publishing

## Context and Problem Statement

The project needs automated semantic versioning and npm publishing, triggered by merging to master.

## Decision Drivers

- Semantic versioning based on changeset descriptions
- Automated release PR creation
- npm publishing on merge
- Developer-friendly workflow (add changeset files, not version bumps)

## Considered Options

1. **Changesets** -- `@changesets/cli` with GitHub Action
2. **semantic-release** -- fully automated from commit messages
3. **Manual versioning** -- hand-edit package.json version

## Decision Outcome

**Option 1: Changesets.** Developers add `.changeset/*.md` files describing changes and their semver impact. The `changesets/action` GitHub Action creates a release PR or publishes when changesets exist.

### Consequences

- Good: Explicit control over version bumps
- Good: Release PRs provide a review opportunity
- Good: Supports patch, minor, and major bumps
- Neutral: Requires discipline to add changeset files
- Bad: Release PR must be manually merged (now gated by `release:watch` per ADR 001)

### Confirmation

- `.changeset/config.json` configured on `master` branch
- `release.yml` uses `changesets/action@v1.4.5`
- `ci:version` and `ci:publish` scripts in package.json

### Reassessment Criteria

- Moving to a monorepo with multiple packages
- Need for pre-release channels
- Changesets maintenance status
