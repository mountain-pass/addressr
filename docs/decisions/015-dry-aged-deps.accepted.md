---
status: accepted
date: 2025-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 015: dry-aged-deps for Dependency Freshness Checking

## Context and Problem Statement

Dependency updates should be applied regularly but not on day-one of a new release (to avoid early-adopter bugs).

## Decision Drivers

- Avoid bleeding-edge dependency releases
- Automated detection of mature updates
- Conservative update strategy for a production service

## Considered Options

1. **dry-aged-deps** -- flags updates only after they've matured
2. **Dependabot** -- creates PRs for all available updates
3. **Renovate** -- configurable update PRs with scheduling
4. **Manual** -- periodic `npm outdated` checks

## Decision Outcome

**Option 1: dry-aged-deps.** Runs as a CI job (`check-deps`) on every push and PR. Flags updates that have been available long enough to be considered mature.

### Consequences

- Good: Reduces risk from new-release bugs
- Good: Automated CI detection
- Neutral: Requires `.dry-aged-deps.json` exclusion file for deferred upgrades
- Bad: No automatic PR creation (just detection)

### Confirmation

- `package.json` has `check-deps` script
- `release.yml` has `check-deps` CI job
- `.dry-aged-deps.json` exists for exclusions

### Reassessment Criteria

- Need for faster security patch adoption
- dry-aged-deps maintenance status
