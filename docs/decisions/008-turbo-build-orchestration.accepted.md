---
human-oversight: confirmed
oversight-date: 2026-07-18
status: accepted
date: 2023-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 008: Turbo for Build Orchestration

## Context and Problem Statement

The project needs task orchestration for build, version, and publish steps with dependency ordering and caching.

## Decision Drivers

- Task dependency management (build before publish)
- Build caching for faster CI
- Consistent task execution order

## Considered Options

1. **Turborepo** -- task orchestration with caching
2. **Plain npm scripts** -- native npm run with npm-run-all
3. **Nx** -- monorepo build system

## Decision Outcome

**Option 1: Turborepo.** Defines `ci:version` and `ci:publish` tasks in `turbo.json` with dependency chains. Currently a devDependency. (It also defined a `build` task when this was written; that task and the Babel build behind it were removed by [ADR-044](044-native-esm-without-a-build-step.proposed.md) — the source is now the artifact, so there is nothing to order before publish.)

### Consequences

- Good: Task caching reduces CI time
- Good: Dependency ordering ensures correct execution
- Neutral: Single-package repo using a monorepo tool -- may be over-engineering
- Bad: Additional devDependency for limited benefit in a single-package context

### Confirmation

- `turbo.json` defines exactly the tasks that have backing npm scripts — today `ci:version` and `ci:publish` — and no npm script invokes a turbo task absent from it. The previous wording ("exists with task definitions") passed on any non-empty `tasks` object, which is how a `turbo:build` script survived the removal of the `build` task it invoked (ADR-044)
- `turbo:ci:version` and `turbo:ci:publish` scripts in package.json
- `release.yml` uses turbo scripts for publishing

### Reassessment Criteria

- If the project never becomes a monorepo
- If turbo's overhead outweighs caching benefits
