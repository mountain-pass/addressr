---
status: accepted
date: 2023-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 010: DevContainer-Based Deployment in CI

## Context and Problem Statement

The CI pipeline needs to run Terraform for AWS deployment. The deployment environment must have Terraform CLI, AWS CLI, and Node.js available.

## Decision Drivers

- Environment parity between local development and CI
- Reproducible deployment environment
- Avoid installing tools on CI runner

## Considered Options

1. **DevContainer in CI** -- `devcontainers/ci` action runs deploy inside the devcontainer
2. **Direct tool installation** -- install Terraform and AWS CLI on the GitHub Actions runner
3. **HashiCorp's Terraform Action** -- official GitHub Action for Terraform

## Decision Outcome

**Option 1: DevContainer.** The same `.devcontainer/devcontainer.json` used for local development runs in CI via `devcontainers/ci@v0.3`. Secrets passed as environment variables.

### Consequences

- Good: Exact same environment locally and in CI
- Good: No tool version drift between local and CI
- Bad: DevContainer image must be built/cached in CI (adds time)
- Bad: Debugging CI failures requires understanding devcontainer internals

### Confirmation

- `release.yml` uses `devcontainers/ci@v0.3` for the deploy step
- `.devcontainer/devcontainer.json` includes Terraform and AWS CLI features

### Reassessment Criteria

- CI build time concerns from devcontainer overhead
- GitHub Actions adding better Terraform integration
