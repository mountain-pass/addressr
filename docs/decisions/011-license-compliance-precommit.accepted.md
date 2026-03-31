---
status: accepted
date: 2021-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 011: License Compliance Enforcement via Pre-Commit Hook

## Context and Problem Statement

As a publicly distributed npm package, addressr must ensure all production dependencies use compatible open-source licenses.

## Decision Drivers

- Legal compliance for an open-source distribution
- Catch license issues before they reach production
- Explicit allowlist rather than blocklist

## Considered Options

1. **Pre-commit license check** -- `license-checker` with allowlist, enforced by husky
2. **CI-only license scanning** -- check in pipeline, not at commit time
3. **SaaS license scanning** -- FOSSA, Snyk, or similar

## Decision Outcome

**Option 1: Pre-commit.** Runs `license-checker --production --onlyAllow` with an explicit allowlist: MIT, Apache-2.0, ISC, Unlicense, BSD-2-Clause, BSD-3-Clause, WTFPL, 0BSD, Python-2.0, MPL-2.0, BlueOak-1.0.0.

### Consequences

- Good: Every commit is gated on license compliance
- Good: Explicit allowlist makes approved licenses clear
- Bad: Runs on every commit (could be slow)
- Bad: Adding a GPL dependency would block commits

### Confirmation

- `package.json` `check-licenses` script with allowlist
- `pre-commit` script runs `lint-staged && npm run check-licenses`

### Reassessment Criteria

- Need to accept GPL or other copyleft dependencies
- Performance issues with large dependency trees
